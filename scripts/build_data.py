#!/usr/bin/env python3
"""Build compact, browser-ready HS2 and HS4 trade assets from BACI."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import shutil
import tempfile
import time
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import duckdb


ROOT = Path(__file__).resolve().parents[1]
BACI_ZIP = ROOT / "data/raw/BACI_HS17_V202601.zip"
WORLD_BANK_ZIP = ROOT / "data/raw/world-bank/wb_boundaries_geojson_lowres.zip"
WORLD_BANK_TAIWAN = ROOT / "data/raw/world-bank/taiwan.geojson"
OEC_HS2_JSON = ROOT / "data/raw/oec/hs2-members.json"
OEC_HS4_JSON = ROOT / "data/raw/oec/hs4-members.json"
CROSSWALK_CSV = ROOT / "data/country-crosswalk.csv"
SQL_FILE = ROOT / "data/sql/aggregate_trade.sql"
OUTPUT_DIR = ROOT / "public/data/trade"
REPORT_FILE = ROOT / "data/processed/build-report.json"
YEARS = tuple(range(2017, 2025))
DEFAULT_YEAR = 2023
SOURCE_VERSION = "BACI_HS17_V202601"
WORLD_BANK_VERSION = "2026-07-14 catalog release"
WORLD_BANK_MEMBER = "WB_Boundaries_GeoJSON_lowres/WB_countries_Admin0_lowres.geojson"
TOP_HS4_PER_COUNTRY = 24


@dataclass(frozen=True)
class Country:
    numeric_id: int
    name: str
    iso2: str
    source_iso3: str
    ui_iso3: str


def repair_source_text(value: str) -> str:
    """Repair the UTF-8-as-Latin-1 mojibake present in CEPII's country labels."""
    value = value.strip()
    try:
        repaired = value.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value
    return repaired if repaired != value else value


SECTIONS = (
    ("01", "05", "01", "Animals & animal products"),
    ("06", "14", "02", "Vegetable products"),
    ("15", "15", "03", "Animal & vegetable fats"),
    ("16", "24", "04", "Prepared foodstuffs"),
    ("25", "27", "05", "Mineral products"),
    ("28", "38", "06", "Chemical products"),
    ("39", "40", "07", "Plastics & rubber"),
    ("41", "43", "08", "Leather & furs"),
    ("44", "46", "09", "Wood products"),
    ("47", "49", "10", "Paper products"),
    ("50", "63", "11", "Textiles"),
    ("64", "67", "12", "Footwear & headgear"),
    ("68", "70", "13", "Stone & glass"),
    ("71", "71", "14", "Precious metals & stones"),
    ("72", "83", "15", "Base metals"),
    ("84", "85", "16", "Machinery & electrical"),
    ("86", "89", "17", "Transportation"),
    ("90", "92", "18", "Instruments"),
    ("93", "93", "19", "Weapons"),
    ("94", "96", "20", "Miscellaneous"),
    ("97", "97", "21", "Art & antiques"),
)

AGRICULTURE_GROUPS = (
    ("01", "05", "animal-products", "Animal products"),
    ("06", "14", "vegetable-products", "Vegetable products"),
    ("15", "15", "fats-and-oils", "Animal and vegetable fats and oils"),
    ("16", "24", "foodstuffs", "Foodstuffs"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=list(YEARS),
        help="Years to build (default: 2017 through 2024)",
    )
    return parser.parse_args()


def write_json(path: Path, value: Any, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(
            value,
            handle,
            ensure_ascii=False,
            allow_nan=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
        )
        handle.write("\n")
    temporary.replace(path)


def round_number(value: float, digits: int) -> float:
    if not math.isfinite(value):
        raise ValueError(f"Non-finite number encountered: {value}")
    return round(value, digits)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def read_crosswalk() -> dict[str, str]:
    with CROSSWALK_CSV.open(encoding="utf-8", newline="") as handle:
        return {
            row["baci_iso3"]: row["map_iso3"]
            for row in csv.DictReader(handle)
            if row["status"] in {"direct", "proxy"}
        }


def read_countries(archive: zipfile.ZipFile, overrides: dict[str, str]) -> dict[int, Country]:
    member = next(name for name in archive.namelist() if name.startswith("country_codes_"))
    with archive.open(member) as raw:
        rows = csv.DictReader(line.decode("utf-8-sig") for line in raw)
        countries: dict[int, Country] = {}
        for row in rows:
            source_iso3 = row["country_iso3"].strip()
            if not source_iso3:
                continue
            countries[int(row["country_code"])] = Country(
                numeric_id=int(row["country_code"]),
                name="Taiwan" if source_iso3 == "S19" else repair_source_text(row["country_name"]),
                iso2=row["country_iso2"].strip(),
                source_iso3=source_iso3,
                ui_iso3=overrides.get(source_iso3, source_iso3),
            )
    return countries


def section_for(hs2: str) -> tuple[str, str]:
    for start, end, section_id, name in SECTIONS:
        if start <= hs2 <= end:
            return section_id, name
    raise ValueError(f"No section mapping for HS2 {hs2}")


def agriculture_group_for(hs2: str) -> dict[str, str] | None:
    for start, end, group_id, name in AGRICULTURE_GROUPS:
        if start <= hs2 <= end:
            return {"id": group_id, "name": name}
    return None


def build_hs2_metadata() -> list[dict[str, Any]]:
    payload = json.loads(OEC_HS2_JSON.read_text(encoding="utf-8"))
    members = payload.get("members", [])
    if len(members) != 96:
        raise ValueError(f"Expected 96 HS2 members from OEC, found {len(members)}")
    result = []
    for member in members:
        hs2 = str(member["key"]).zfill(2)
        section_id, section_name = section_for(hs2)
        result.append(
            {
                "id": hs2,
                "name": member["caption"],
                "sectionId": section_id,
                "sectionName": section_name,
                "agricultureGroup": agriculture_group_for(hs2),
            }
        )
    return sorted(result, key=lambda item: item["id"])


def build_hs4_metadata() -> list[dict[str, Any]]:
    payload = json.loads(OEC_HS4_JSON.read_text(encoding="utf-8"))
    members = payload.get("members", [])
    if len(members) != 1222:
        raise ValueError(f"Expected 1222 HS4 members from OEC, found {len(members)}")
    result = []
    for member in members:
        hs4 = str(member["key"]).zfill(4)
        hs2 = hs4[:2]
        section_id, section_name = section_for(hs2)
        result.append(
            {
                "id": hs4,
                "name": member["caption"],
                "hs2": hs2,
                "sectionId": section_id,
                "sectionName": section_name,
            }
        )
    ids = [item["id"] for item in result]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate HS4 code in OEC metadata")
    return sorted(result, key=lambda item: item["id"])


def rounded_geometry(value: Any) -> Any:
    if isinstance(value, (tuple, list)):
        return [rounded_geometry(item) for item in value]
    if isinstance(value, float):
        return round(value, 4)
    return value


def ring_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    """Return planar area and centroid for a GeoJSON outer ring."""
    twice_area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0
    for start, end in zip(ring, ring[1:]):
        cross = start[0] * end[1] - end[0] * start[1]
        twice_area += cross
        centroid_x += (start[0] + end[0]) * cross
        centroid_y += (start[1] + end[1]) * cross
    if abs(twice_area) < 1e-9:
        points = ring[:-1] or ring
        return 0.0, sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)
    return abs(twice_area / 2), centroid_x / (3 * twice_area), centroid_y / (3 * twice_area)


def geometry_label_point(geometry: dict[str, Any]) -> tuple[float, float]:
    """Use the largest polygon's centroid as a stable map-focus point."""
    if geometry["type"] == "Polygon":
        rings = [geometry["coordinates"][0]]
    elif geometry["type"] == "MultiPolygon":
        rings = [polygon[0] for polygon in geometry["coordinates"] if polygon]
    else:
        raise ValueError(f"Unsupported Admin 0 geometry: {geometry['type']}")
    _, x, y = max((ring_centroid(ring) for ring in rings), key=lambda item: item[0])
    return round(x, 4), round(y, 4)


def build_geometry(countries: dict[int, Country], overrides: dict[str, str]) -> tuple[dict[str, Any], dict[str, str]]:
    baci_ui_codes = {country.ui_iso3 for country in countries.values()}
    reverse_overrides = {map_iso3: baci_iso3 for baci_iso3, map_iso3 in overrides.items()}
    names_by_ui = {country.ui_iso3: country.name for country in countries.values()}
    geometry_names: dict[str, str] = {}
    features = []
    grouped: dict[str, dict[str, Any]] = {}

    with zipfile.ZipFile(WORLD_BANK_ZIP) as archive:
        payload = json.loads(archive.read(WORLD_BANK_MEMBER))
    payload["features"].append(json.loads(WORLD_BANK_TAIWAN.read_text(encoding="utf-8")))
    for source_feature in payload["features"]:
        props = source_feature["properties"]
        geometry = source_feature.get("geometry")
        if not geometry:
            continue
        candidates = (props.get("ISO_A3_EH"), props.get("ISO_A3"), props.get("WB_A3"))
        map_iso3 = next((str(code).strip() for code in candidates if code and str(code).strip() != "-99"), "")
        if len(map_iso3) != 3:
            continue
        trade_iso3 = map_iso3 if map_iso3 in baci_ui_codes else None
        source_iso3 = reverse_overrides.get(map_iso3, map_iso3 if trade_iso3 else None)
        display_name = names_by_ui.get(map_iso3, str(props.get("NAME_EN") or props.get("WB_NAME") or map_iso3))
        geometry_names[map_iso3] = display_name
        if geometry["type"] == "Polygon":
            polygons = [geometry["coordinates"]]
        elif geometry["type"] == "MultiPolygon":
            polygons = geometry["coordinates"]
        else:
            continue
        entry = grouped.setdefault(
            map_iso3,
            {
                "tradeIso3": trade_iso3,
                "sourceIso3": source_iso3,
                "name": display_name,
                "polygons": [],
            },
        )
        entry["polygons"].extend(polygons)

    for map_iso3, entry in grouped.items():
        geometry = {"type": "MultiPolygon", "coordinates": entry["polygons"]}
        label_x, label_y = geometry_label_point(geometry)
        features.append(
            {
                "type": "Feature",
                "id": map_iso3,
                "properties": {
                    "mapIso3": map_iso3,
                    "tradeIso3": entry["tradeIso3"],
                    "sourceIso3": entry["sourceIso3"],
                    "name": entry["name"],
                    "labelX": label_x,
                    "labelY": label_y,
                },
                "geometry": rounded_geometry(geometry),
            }
        )
    features.sort(key=lambda feature: feature["id"])
    return {"type": "FeatureCollection", "features": features}, geometry_names


def sql_path(path: Path) -> str:
    return str(path).replace("'", "''")


def fetch_dicts(connection: duckdb.DuckDBPyConnection, query: str) -> Iterable[dict[str, Any]]:
    cursor = connection.execute(query)
    columns = [item[0] for item in cursor.description]
    for row in cursor.fetchall():
        yield dict(zip(columns, row))


def build_year(
    connection: duckdb.DuckDBPyConnection,
    archive: zipfile.ZipFile,
    year: int,
    countries: dict[int, Country],
    geometry_codes: set[str],
    valid_hs2: set[str],
    valid_hs4: set[str],
    sql_template: str,
    temporary_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, dict[str, list[list[Any]]]], dict[str, Any]]:
    member = f"BACI_HS17_Y{year}_V202601.csv"
    if member not in archive.namelist():
        raise FileNotFoundError(f"{member} is missing from {BACI_ZIP.name}")
    archive.extract(member, temporary_dir)
    csv_path = temporary_dir / member
    print(f"[{year}] aggregating {csv_path.stat().st_size / 1_000_000:.1f} MB", flush=True)
    connection.execute(sql_template.format(csv_path=sql_path(csv_path)))

    parent_validation = next(fetch_dicts(
        connection,
        """
        WITH hs4_parents AS (
            SELECT
                country_id,
                left(hs4, 2) AS hs2,
                sum(exports)::BIGINT AS exports,
                sum(imports)::BIGINT AS imports
            FROM hs4_country_product_base
            GROUP BY country_id, left(hs4, 2)
        )
        SELECT
            max(abs(coalesce(h.exports, 0) - coalesce(p.exports, 0)))::BIGINT AS max_export_delta,
            max(abs(coalesce(h.imports, 0) - coalesce(p.imports, 0)))::BIGINT AS max_import_delta
        FROM country_product_base p
        FULL OUTER JOIN hs4_parents h USING (country_id, hs2)
        """,
    ))

    totals_by_id = {row["country_id"]: row for row in fetch_dicts(connection, "SELECT * FROM country_totals")}
    destinations_by_id = {
        row["country_id"]: row for row in fetch_dicts(connection, "SELECT * FROM leading_destinations")
    }
    products_by_id: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in fetch_dicts(
        connection,
        """
        SELECT country_id, hs2, exports, imports
        FROM country_product_base
        ORDER BY country_id, hs2
        """,
    ):
        products_by_id[row["country_id"]].append(
            {
                "hs2": row["hs2"],
                "exports": row["exports"],
                "imports": row["imports"],
            }
        )

    hs4_lens_by_id: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in fetch_dicts(
        connection,
        f"""
        SELECT country_id, hs4, exports, export_share
        FROM hs4_lens_metrics
        QUALIFY row_number() OVER (
            PARTITION BY country_id
            ORDER BY exports DESC, hs4
        ) <= {TOP_HS4_PER_COUNTRY}
        ORDER BY country_id, exports DESC, hs4
        """,
    ):
        hs4_lens_by_id[row["country_id"]].append(
            {
                "hs4": row["hs4"],
                "exports": row["exports"],
                "exportShare": round_number(row["export_share"], 8),
            }
        )

    hs4_partitions: dict[str, dict[str, list[list[Any]]]] = defaultdict(lambda: defaultdict(list))
    unknown_hs4: set[str] = set()
    for row in fetch_dicts(
        connection,
        """
        SELECT country_id, hs4, exports, imports
        FROM hs4_country_product_base
        ORDER BY hs4, country_id
        """,
    ):
        country = countries.get(row["country_id"])
        if country is None:
            continue
        hs4 = row["hs4"]
        if hs4 not in valid_hs4:
            unknown_hs4.add(hs4)
            continue
        hs4_partitions[hs4[:2]][hs4].append(
            [country.ui_iso3, row["exports"], row["imports"]]
        )
    if unknown_hs4:
        raise ValueError(f"Unknown HS4 codes in {year}: {sorted(unknown_hs4)}")

    output_countries = []
    hs4_lens_countries = []
    unknown_numeric_ids = []
    seen_country_codes: set[str] = set()
    for country_id, totals in sorted(totals_by_id.items()):
        country = countries.get(country_id)
        if country is None:
            unknown_numeric_ids.append(country_id)
            continue
        products = products_by_id[country_id]
        product_codes = [item["hs2"] for item in products]
        if len(product_codes) != len(set(product_codes)):
            raise ValueError(f"Duplicate country/HS2 key in {year}: {country.ui_iso3}")
        unexpected_hs2 = sorted(set(product_codes) - valid_hs2)
        if unexpected_hs2:
            raise ValueError(f"Unknown HS2 codes in {year}: {unexpected_hs2}")
        if country.ui_iso3 in seen_country_codes:
            raise ValueError(f"Duplicate UI country code in {year}: {country.ui_iso3}")
        seen_country_codes.add(country.ui_iso3)
        for product in products:
            if product["exports"] < 0 or product["imports"] < 0:
                raise ValueError(f"Negative gross trade value in {year}: {country.ui_iso3}")
        destination = destinations_by_id.get(country_id)
        destination_country = countries.get(destination["destination_id"]) if destination else None
        output_countries.append(
            {
                "iso3": country.ui_iso3,
                "exports": totals["exports"],
                "imports": totals["imports"],
                "net": totals["net"],
                "leadingDestination": destination_country.ui_iso3 if destination_country else None,
                "leadingDestinationExports": destination["exports"] if destination else None,
                "products": products,
            }
        )
        lens_products = hs4_lens_by_id[country_id]
        hs4_lens_countries.append(
            {
                "iso3": country.ui_iso3,
                "leadingHs4": lens_products[0]["hs4"] if lens_products else None,
                "products": lens_products,
            }
        )

    csv_path.unlink()
    world_exports = sum(item["exports"] for item in output_countries)
    world_imports = sum(item["imports"] for item in output_countries)
    hs4_world_exports = sum(
        row[1]
        for products in hs4_partitions.values()
        for country_rows in products.values()
        for row in country_rows
    )
    hs4_world_imports = sum(
        row[2]
        for products in hs4_partitions.values()
        for country_rows in products.values()
        for row in country_rows
    )
    product_rows = sum(len(item["products"]) for item in output_countries)
    validation = {
        "year": year,
        "countries": len(output_countries),
        "countryProductRows": product_rows,
        "countryHs4LensRows": sum(len(item["products"]) for item in hs4_lens_countries),
        "hs4FlowRows": sum(
            len(country_rows)
            for products in hs4_partitions.values()
            for country_rows in products.values()
        ),
        "unknownNumericCountryIds": unknown_numeric_ids,
        "worldExports": world_exports,
        "worldImports": world_imports,
        "hs4WorldExports": hs4_world_exports,
        "hs4WorldImports": hs4_world_imports,
        "hs4WorldExportDifference": hs4_world_exports - world_exports,
        "hs4WorldImportDifference": hs4_world_imports - world_imports,
        "maxHs4ParentExportDelta": parent_validation["max_export_delta"],
        "maxHs4ParentImportDelta": parent_validation["max_import_delta"],
        "globalDifference": world_exports - world_imports,
        "globalDifferenceShare": round_number(
            abs(world_exports - world_imports) / world_exports if world_exports else 0,
            12,
        ),
        "activeCountriesWithoutGeometry": sorted(
            item["iso3"] for item in output_countries if item["iso3"] not in geometry_codes
        ),
    }
    if unknown_numeric_ids:
        raise ValueError(f"Unknown BACI numeric country IDs in {year}: {unknown_numeric_ids}")
    if validation["globalDifferenceShare"] > 1e-9:
        raise ValueError(f"Global export/import balance failed for {year}: {validation}")
    if abs(hs4_world_exports - world_exports) > 100 or abs(hs4_world_imports - world_imports) > 100:
        raise ValueError(f"HS4/world totals failed for {year}: {validation}")
    if parent_validation["max_export_delta"] > 100 or parent_validation["max_import_delta"] > 100:
        raise ValueError(f"HS4/HS2 parent totals failed for {year}: {validation}")
    return (
        {
            "schemaVersion": 2,
            "year": year,
            "provisional": year == 2024,
            "worldExports": world_exports,
            "worldImports": world_imports,
            "countries": output_countries,
        },
        {
            "schemaVersion": 1,
            "year": year,
            "countries": hs4_lens_countries,
        },
        {hs2: dict(products) for hs2, products in hs4_partitions.items()},
        validation,
    )


def main() -> None:
    args = parse_args()
    years = tuple(sorted(set(args.years)))
    invalid_years = sorted(set(years) - set(YEARS))
    if invalid_years:
        raise ValueError(f"Unsupported years: {invalid_years}; choose from {list(YEARS)}")
    for required in (
        BACI_ZIP,
        WORLD_BANK_ZIP,
        WORLD_BANK_TAIWAN,
        OEC_HS2_JSON,
        OEC_HS4_JSON,
        CROSSWALK_CSV,
        SQL_FILE,
    ):
        if not required.exists():
            raise FileNotFoundError(required)

    started = time.monotonic()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "years").mkdir(parents=True, exist_ok=True)
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    overrides = read_crosswalk()
    hs2 = build_hs2_metadata()
    hs4 = build_hs4_metadata()
    sql_template = SQL_FILE.read_text(encoding="utf-8")

    with zipfile.ZipFile(BACI_ZIP) as archive:
        bad_members = archive.testzip()
        if bad_members:
            raise zipfile.BadZipFile(f"Corrupt archive member: {bad_members}")
        countries = read_countries(archive, overrides)
        geometry, geometry_names = build_geometry(countries, overrides)
        geometry_codes = set(geometry_names)
        metadata_by_ui: dict[str, dict[str, Any]] = {}
        for country in sorted(countries.values(), key=lambda item: item.ui_iso3):
            candidate = {
                "iso3": country.ui_iso3,
                "sourceIso3": country.source_iso3,
                "iso2": country.iso2 or None,
                "name": country.name,
                "hasGeometry": country.ui_iso3 in geometry_codes,
            }
            existing = metadata_by_ui.get(country.ui_iso3)
            if existing is None or ("(..." in existing["name"] and "(..." not in country.name):
                metadata_by_ui[country.ui_iso3] = candidate
        country_metadata = sorted(metadata_by_ui.values(), key=lambda item: item["iso3"])

        write_json(OUTPUT_DIR / "geometry.geojson", geometry)
        write_json(OUTPUT_DIR / "countries.json", country_metadata)
        write_json(OUTPUT_DIR / "hs2.json", hs2)
        write_json(OUTPUT_DIR / "hs4.json", hs4)

        connection = duckdb.connect(database=":memory:")
        connection.execute("SET threads TO 4")
        connection.execute("SET memory_limit = '4GB'")
        validations = []
        output_sizes = {}
        with tempfile.TemporaryDirectory(prefix="map-proj-baci-") as temporary:
            for year in years:
                year_payload, hs4_lens_payload, hs4_partitions, validation = build_year(
                    connection,
                    archive,
                    year,
                    countries,
                    geometry_codes,
                    {item["id"] for item in hs2},
                    {item["id"] for item in hs4},
                    sql_template,
                    Path(temporary),
                )
                output_path = OUTPUT_DIR / "years" / f"{year}.json"
                write_json(output_path, year_payload)
                lens_path = OUTPUT_DIR / "hs4" / "lens" / f"{year}.json"
                write_json(lens_path, hs4_lens_payload)
                partition_dir = OUTPUT_DIR / "hs4" / "years" / str(year)
                if partition_dir.exists():
                    shutil.rmtree(partition_dir)
                for hs2_id, products in sorted(hs4_partitions.items()):
                    write_json(
                        partition_dir / f"{hs2_id}.json",
                        {
                            "schemaVersion": 1,
                            "year": year,
                            "hs2": hs2_id,
                            "products": products,
                        },
                    )
                validation["outputBytes"] = output_path.stat().st_size
                validation["hs4LensOutputBytes"] = lens_path.stat().st_size
                validation["hs4PartitionOutputBytes"] = sum(
                    path.stat().st_size for path in partition_dir.glob("*.json")
                )
                validations.append(validation)
                output_sizes[str(year)] = {
                    "hs2": output_path.stat().st_size,
                    "hs4Lens": lens_path.stat().st_size,
                    "hs4Partitions": validation["hs4PartitionOutputBytes"],
                }
                print(
                    f"[{year}] {validation['countries']} countries, "
                    f"{validation['countryProductRows']} HS2 rows, "
                    f"{validation['hs4FlowRows']} HS4 rows, "
                    f"{(output_path.stat().st_size + lens_path.stat().st_size + validation['hs4PartitionOutputBytes']) / 1_000_000:.2f} MB",
                    flush=True,
                )
        connection.close()

    baci_codes = {country.ui_iso3 for country in countries.values()}
    unmapped_baci = sorted(
        {
            country.ui_iso3: country.name
            for country in countries.values()
            if country.ui_iso3 not in geometry_codes
        }.items()
    )
    unused_geometry = sorted(code for code in geometry_codes if code not in baci_codes)
    manifest = {
        "schemaVersion": 2,
        "source": {
            "name": "BACI",
            "publisher": "CEPII",
            "classification": "HS 2017",
            "version": SOURCE_VERSION,
            "archiveSha256": sha256(BACI_ZIP),
            "valueUnit": "current USD",
        },
        "map": {
            "name": "World Bank Official Administrative Boundaries",
            "version": WORLD_BANK_VERSION,
            "scale": "low resolution",
        },
        "years": list(years),
        "defaultYear": DEFAULT_YEAR if DEFAULT_YEAR in years else years[-1],
        "provisionalYears": [year for year in years if year == 2024],
        "hsLevel": "HS2 + HS4",
        "files": {
            "countries": "countries.json",
            "products": "hs2.json",
            "hs4Products": "hs4.json",
            "geometry": "geometry.geojson",
            "yearPattern": "years/{year}.json",
            "hs4LensYearPattern": "hs4/lens/{year}.json",
            "hs4PartitionPattern": "hs4/years/{year}/{hs2}.json",
        },
    }
    write_json(OUTPUT_DIR / "manifest.json", manifest, pretty=True)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "elapsedSeconds": round(time.monotonic() - started, 2),
        "validations": validations,
        "unmappedBaciCountries": [
            {"iso3": iso3, "name": name} for iso3, name in unmapped_baci
        ],
        "geometryWithoutBaciData": unused_geometry,
        "outputBytesByYear": output_sizes,
    }
    write_json(REPORT_FILE, report, pretty=True)
    print(f"Build complete in {report['elapsedSeconds']}s", flush=True)
    print(f"Report: {REPORT_FILE}", flush=True)


if __name__ == "__main__":
    main()
