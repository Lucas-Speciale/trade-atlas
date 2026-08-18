# Trade Atlas

Trade Atlas is a static, interactive world trade explorer built with Next.js and TypeScript. Drag a detailed flat map beneath a fixed country lens to watch recognizable HS4 export products change, then select a product to compare it worldwide.

The runtime is deliberately small: there is no application API, database, or arbitrary query layer. BACI is aggregated offline and the browser loads one compact annual JSON file at a time. OpenFreeMap supplies the visual basemap at runtime without an API key.

## Current experience

- MapLibre flat Mercator map using OpenFreeMap's Liberty style
- Viewport-anchored country lens with a translucent focus wash
- Dynamic radial product readouts with export-basket shares and values
- Hover expansion from **All other products** into the next ranked HS4 products
- Continuous country selection as the map moves beneath the lens
- Lens-center country selection and country search
- Draggable, scrollable, keyboard-accessible year carousel for 2017–2024
- HS4 product navigation from the country lens into a worldwide overlay
- HS2 category and HS4 product overlays
- Largest exporters, export dependence, net exporters, and specialization (RCA)
- Product-specific route webs from a selected country to its ten leading destinations or sources
- Shareable URL state for mode, year, country, product, and metric
- Responsive layout, reduced-motion behavior, and static production output

## Run locally

Requirements: Node.js 20 or later and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Quality checks:

```bash
pnpm test
pnpm lint
pnpm build
```

`pnpm build` creates the static site in `out/`.

## Runtime architecture

```text
OpenFreeMap Liberty vector basemap
                +
Local World Bank country GeoJSON
                │
                ▼
        MapLibre map canvas
                │
                ▼
React SVG/HTML HUD: focus wash, country lens,
radial readouts, animated routes, overlay controls,
and year carousel
```

MapLibre owns projection, map movement, labels, geographic layers, and pointer feature events. React owns application state and the viewport-sized HUD. During movement, the lens center is converted back to longitude/latitude and checked against a precomputed local Admin 0 polygon index. In country mode the pointer only drags or zooms the map; search can move a country into the lens. When the lens is over ocean, the country fingerprint and statistics clear.

The country lens arranges the leading HS4 products clockwise across its upper semicircle. Each readout names the product, shows its exact share of the country's total merchandise exports, and includes the underlying export value. Readouts draw and count up when the selected country or year changes. A neutral **All other products** readout accounts for the remainder of the export basket; hovering or focusing it flows open the remaining retained HS4 rankings and an honest residual for products below the compact fingerprint.

The UI calculates HS2 overlays in memory. Changing year loads one immutable HS2 annual file plus a compact file containing each country's leading HS4 products; neighboring years are prefetched and cached. Selecting an HS4 product lazily loads only its year and parent-HS2 partition, then calculates country measures and ranks in the browser.

In Product Overlay, clicking a country lazily loads one separate route partition for the selected year and parent HS2 chapter. BACI's bilateral rows are pre-aggregated to the selected HS2 or HS4 product, classified as outbound for a net exporter or inbound for a net importer, and reduced to ten mapped partners. SVG flight paths draw in the true flow direction and the companion readout states the gross route measure separately from the map's selected overlay metric.

## Data pipeline

```text
BACI HS6 CSVs (local only)
        │
        ▼
DuckDB aggregation + Python validation
        │
        ├── country × year × HS2 measures
        ├── leading country × year × HS4 fingerprints
        ├── lazy year × parent-HS2 overlay partitions
        ├── lazy top-ten bilateral route partitions
        ├── country totals and leading destination
        └── explicit BACI ↔ map ISO3 crosswalk
        │
        ▼
public/data/trade/*.json + geometry.geojson
```

The generated browser assets live in `public/data/trade/`. Route files are separate from the initial overlay payload and are fetched only after a country is selected. The raw BACI archive, boundary source archive, Python environment, and validation report are development inputs and are not required by the deployed app.

To reproduce the assets:

1. Create `.venv` and install `requirements-data.txt`.
2. Put `BACI_HS17_V202601.zip` in `data/raw/`.
3. Put the World Bank low-resolution GeoJSON archive in `data/raw/world-bank/wb_boundaries_geojson_lowres.zip`.
4. Preserve OEC's HS2 and HS4 member responses as `data/raw/oec/hs2-members.json` and `data/raw/oec/hs4-members.json`.
5. Run `pnpm data:build`.

The build validates archive integrity, duplicate country/product keys, HS2/HS4 membership, leading-zero preservation, gross trade values, HS4-to-HS2 reconciliation, country coverage, and global export/import equality. It writes a detailed report to `data/processed/build-report.json`.

## Data definitions

- `exports`: BACI bilateral value aggregated to exporting country and HS2 or HS4
- `imports`: the same value aggregated to importing country and HS2 or HS4
- `net`: exports minus imports
- `exportShare`: product exports divided by all merchandise exports from that country
- `worldExportShare`: country exports divided by worldwide exports of that product
- `rca`: the product's share of a country's exports divided by its share of world exports
- `route share`: bilateral product flow divided by the selected country's gross exports or imports of that product; routes are emitted for product-direction totals of at least $1 million

Values are current US dollars. BACI's source field is reported in thousands of dollars and converted during the data build.

## Sources and caveats

- [CEPII BACI HS17 V202601](https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS17_V202601.zip)
- [BACI documentation](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html)
- [World Bank Official Boundaries](https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries), CC BY 4.0
- [OpenFreeMap](https://openfreemap.org/), using OpenMapTiles and OpenStreetMap data
- [OEC HS2 metadata endpoint](https://api-v2.oec.world/tesseract/members?cube=trade_i_baci_a_17&level=HS2%20Official)
- [OEC HS4 metadata endpoint](https://api-v2.oec.world/tesseract/members?cube=trade_i_baci_a_17&level=HS4%20Official)

The project describes merchandise trade, not domestic production. The HS 2017 BACI archive covers 2017–2024; 2024 is marked provisional. BACI's `Other Asia, nes` (`S19`) is used as the documented practical proxy for Taiwan. Boundary display and Taiwan's separate presentation are for data exploration and do not imply any political position.

## Project structure

```text
src/app/                 Next.js shell and responsive styling
src/components/          Map, trade lens, timeline, and explorer state
src/lib/                 Formatting and trade calculations
src/types/               Static data contracts
scripts/build_data.py    Reproducible data pipeline
data/sql/                DuckDB HS2/HS4 aggregation SQL
data/raw/world-bank/     Boundary inputs and source notes
public/data/trade/       Deployable static assets
CONCEPT.md               Product concept and phased plan
```

## Deployment

Pushes to `main` are tested, statically exported, and deployed to the existing Cloudflare Pages project by `.github/workflows/deploy.yml`. The workflow requires the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
