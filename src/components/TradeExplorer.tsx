"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { interpolateRdBu, interpolateYlGnBu } from "d3-scale-chromatic";
import { scaleDivergingSymlog, scaleSequentialSqrt } from "d3-scale";

import { TradeLens } from "@/components/TradeLens";
import { TradeMap } from "@/components/TradeMap";
import { YearCarousel } from "@/components/YearCarousel";
import { displayCountryName } from "@/lib/countryNames";
import { formatCurrency, formatMetric, formatPercent, formatRca } from "@/lib/format";
import {
  computeHs4Overlay,
  computeOverlay,
  makeProductSelections,
  percentile,
} from "@/lib/trade";
import type {
  CountryMeta,
  ExplorerMode,
  Hs4LensYear,
  Hs4Meta,
  Hs4Partition,
  Hs2Meta,
  Manifest,
  OverlayDatum,
  OverlayMetric,
  ProductSelection,
  TradeGeometry,
  YearData,
} from "@/types/trade";

const DATA_ROOT = "/data/trade";
const NO_EXPORT_COLOR = "#d8d6cf";
const WORLD_SHARE_COLOR_FLOOR = 0.2;
const WORLD_SHARE_LEGEND_STOPS = [0, 0.25, 0.5, 0.75, 1];

function worldShareColor(value: number): string {
  return interpolateYlGnBu(
    WORLD_SHARE_COLOR_FLOOR + (1 - WORLD_SHARE_COLOR_FLOOR) * value,
  );
}

const WORLD_SHARE_RAMP = `linear-gradient(90deg, ${WORLD_SHARE_LEGEND_STOPS
  .map((stop) => `${worldShareColor(stop)} ${stop * 100}%`)
  .join(", ")})`;

const METRICS: Array<{ id: OverlayMetric; label: string; help: string }> = [
  { id: "worldExportShare", label: "Largest exporters", help: "Share of world exports" },
  { id: "exportShare", label: "Export dependence", help: "Share of country exports" },
  { id: "net", label: "Net exporters", help: "Exports minus imports" },
  { id: "rca", label: "Specialization", help: "Revealed comparative advantage" },
];

interface BaseData {
  manifest: Manifest;
  countries: CountryMeta[];
  products: Hs2Meta[];
  hs4Products: Hs4Meta[];
  geometry: TradeGeometry;
}

interface InitialState {
  mode: ExplorerMode;
  year: number;
  country: string;
  product: string;
  metric: OverlayMetric;
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json() as Promise<T>;
}

function getInitialState(): InitialState {
  if (typeof window === "undefined") {
    return {
      mode: "country",
      year: 2023,
      country: "USA",
      product: "hs2:01",
      metric: "worldExportShare",
    };
  }
  const params = new URLSearchParams(window.location.search);
  const metricIds = new Set(METRICS.map((item) => item.id));
  const metric = params.get("metric") as OverlayMetric | null;
  return {
    mode: params.get("mode") === "overlay" ? "overlay" : "country",
    year: Number(params.get("year")) || 2023,
    country: params.get("country")?.toUpperCase() || "USA",
    product: params.get("product") || "hs2:01",
    metric: metric && metricIds.has(metric) ? metric : "worldExportShare",
  };
}

export function TradeExplorer() {
  const [initial] = useState<InitialState>(getInitialState);
  const yearCache = useRef(new Map<number, YearData>());
  const hs4LensCache = useRef(new Map<number, Hs4LensYear>());
  const hs4PartitionCache = useRef(new Map<string, Hs4Partition>());
  const [base, setBase] = useState<BaseData | null>(null);
  const [yearData, setYearData] = useState<YearData | null>(null);
  const [hs4LensData, setHs4LensData] = useState<Hs4LensYear | null>(null);
  const [hs4Partition, setHs4Partition] = useState<Hs4Partition | null>(null);
  const [mode, setMode] = useState<ExplorerMode>(initial.mode);
  const [year, setYear] = useState(initial.year);
  const [activeIso3, setActiveIso3] = useState(initial.country);
  const [selectionId, setSelectionId] = useState(initial.product);
  const [metric, setMetric] = useState<OverlayMetric>(initial.metric);
  const [focusRequest, setFocusRequest] = useState<{
    iso3: string;
    center: [number, number];
    zoom?: number;
    nonce: number;
  } | null>(null);
  const [loadingYear, setLoadingYear] = useState(false);
  const [countryQuery, setCountryQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchJson<Manifest>(`${DATA_ROOT}/manifest.json`, controller.signal),
      fetchJson<CountryMeta[]>(`${DATA_ROOT}/countries.json`, controller.signal),
      fetchJson<Hs2Meta[]>(`${DATA_ROOT}/hs2.json`, controller.signal),
      fetchJson<Hs4Meta[]>(`${DATA_ROOT}/hs4.json`, controller.signal),
      fetchJson<TradeGeometry>(`${DATA_ROOT}/geometry.geojson`, controller.signal),
    ])
      .then(([manifest, countries, products, hs4Products, geometry]) => {
        setBase({ manifest, countries, products, hs4Products, geometry });
        if (!manifest.years.includes(initial.year)) setYear(manifest.defaultYear);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
      });
    return () => controller.abort();
  }, [initial]);

  useEffect(() => {
    if (!base || !base.manifest.years.includes(year)) return;
    const cachedYear = yearCache.current.get(year);
    const cachedLens = hs4LensCache.current.get(year);
    if (cachedYear && cachedLens) {
      setYearData(cachedYear);
      setHs4LensData(cachedLens);
      return;
    }
    const controller = new AbortController();
    setLoadingYear(true);
    setError(null);
    Promise.all([
      fetchJson<YearData>(`${DATA_ROOT}/years/${year}.json`, controller.signal),
      fetchJson<Hs4LensYear>(`${DATA_ROOT}/hs4/lens/${year}.json`, controller.signal),
    ])
      .then(([data, lensData]) => {
        yearCache.current.set(year, data);
        hs4LensCache.current.set(year, lensData);
        setYearData(data);
        setHs4LensData(lensData);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
      })
      .finally(() => setLoadingYear(false));
    return () => controller.abort();
  }, [base, year]);

  useEffect(() => {
    if (!base || !yearData) return;
    const activeIndex = base.manifest.years.indexOf(yearData.year);
    [activeIndex - 1, activeIndex + 1]
      .map((index) => base.manifest.years[index])
      .filter((candidate): candidate is number => candidate !== undefined)
      .forEach((candidate) => {
        if (yearCache.current.has(candidate) && hs4LensCache.current.has(candidate)) return;
        Promise.all([
          fetchJson<YearData>(`${DATA_ROOT}/years/${candidate}.json`),
          fetchJson<Hs4LensYear>(`${DATA_ROOT}/hs4/lens/${candidate}.json`),
        ])
          .then(([data, lensData]) => {
            yearCache.current.set(candidate, data);
            hs4LensCache.current.set(candidate, lensData);
          })
          .catch(() => undefined);
      });
  }, [base, yearData]);

  const productSelections = useMemo(
    () => (base ? makeProductSelections(base.products, base.hs4Products) : []),
    [base],
  );
  const productGroups = useMemo(() => {
    if (!base) return [];
    const selectionsById = new Map(productSelections.map((item) => [item.id, item]));
    const groups = new Map<string, {
      id: string;
      name: string;
      hs2: ProductSelection[];
      hs4: ProductSelection[];
    }>();
    const getGroup = (id: string, name: string) => {
      const existing = groups.get(id);
      if (existing) return existing;
      const group = { id, name, hs2: [], hs4: [] };
      groups.set(id, group);
      return group;
    };

    base.products.forEach((product) => {
      const selection = selectionsById.get(`hs2:${product.id}`);
      if (selection) getGroup(product.sectionId, product.sectionName).hs2.push(selection);
    });
    base.hs4Products.forEach((product) => {
      const selection = selectionsById.get(`hs4:${product.id}`);
      if (selection) getGroup(product.sectionId, product.sectionName).hs4.push(selection);
    });

    return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [base, productSelections]);
  const selectedProduct = useMemo(
    () =>
      productSelections.find((item) => item.id === selectionId) ??
      productSelections[0],
    [productSelections, selectionId],
  );
  const productsById = useMemo(
    () => new Map(base?.hs4Products.map((product) => [product.id, product]) ?? []),
    [base],
  );
  const countriesById = useMemo(
    () => new Map(base?.countries.map((country) => [country.iso3, country]) ?? []),
    [base],
  );
  const geometryByCountry = useMemo(
    () => new Map(
      base?.geometry.features
        .filter((feature) => feature.properties.tradeIso3)
        .map((feature) => [feature.properties.tradeIso3!, feature.properties]) ?? [],
    ),
    [base],
  );
  const yearCountriesById = useMemo(
    () => new Map(yearData?.countries.map((country) => [country.iso3, country]) ?? []),
    [yearData],
  );
  const hs4LensCountriesById = useMemo(
    () => new Map(hs4LensData?.countries.map((country) => [country.iso3, country]) ?? []),
    [hs4LensData],
  );
  const selectableCountries = useMemo(
    () => base
      ? [...base.countries]
          .filter((country) => country.hasGeometry && yearCountriesById.has(country.iso3))
          .sort((a, b) =>
            displayCountryName(a.iso3, a.name).localeCompare(displayCountryName(b.iso3, b.name)),
          )
      : [],
    [base, yearCountriesById],
  );

  const resolvedIso3 = activeIso3 === ""
    ? ""
    : yearCountriesById.has(activeIso3)
      ? activeIso3
      : yearCountriesById.has("USA")
        ? "USA"
        : yearData?.countries[0]?.iso3 ?? "";

  const initialFocusRequest = useMemo(() => {
    if (initial.mode === "overlay") {
      return { iso3: "WORLD", center: [5, 22] as [number, number], zoom: 1.45, nonce: 0 };
    }
    const properties = geometryByCountry.get(initial.country);
    return properties
      ? { iso3: initial.country, center: [properties.labelX, properties.labelY] as [number, number], zoom: 2.2, nonce: 0 }
      : null;
  }, [geometryByCountry, initial.country, initial.mode]);

  useEffect(() => {
    if (!base || !selectedProduct) return;
    const params = new URLSearchParams({
      mode,
      year: String(year),
      country: resolvedIso3,
      product: selectedProduct.id,
      metric,
    });
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [base, metric, mode, resolvedIso3, selectedProduct, year]);

  useEffect(() => {
    if (!selectedProduct || selectedProduct.kind !== "hs4") return;
    const hs2 = selectedProduct.hs2Ids[0];
    const cacheKey = `${year}:${hs2}`;
    const cached = hs4PartitionCache.current.get(cacheKey);
    if (cached) {
      const frame = requestAnimationFrame(() => setHs4Partition(cached));
      return () => cancelAnimationFrame(frame);
    }
    const controller = new AbortController();
    fetchJson<Hs4Partition>(`${DATA_ROOT}/hs4/years/${year}/${hs2}.json`, controller.signal)
      .then((data) => {
        hs4PartitionCache.current.set(cacheKey, data);
        setHs4Partition(data);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
      });
    return () => controller.abort();
  }, [selectedProduct, year]);

  const overlayData = useMemo<OverlayDatum[]>(() => {
    if (!yearData || !selectedProduct) return [];
    if (selectedProduct.kind === "hs4") {
      if (
        !selectedProduct.hs4Id ||
        hs4Partition?.year !== year ||
        hs4Partition.hs2 !== selectedProduct.hs2Ids[0]
      ) return [];
      return computeHs4Overlay(
        yearData.countries,
        hs4Partition.products[selectedProduct.hs4Id] ?? [],
        yearData.worldExports,
      );
    }
    return computeOverlay(yearData.countries, selectedProduct, yearData.worldExports);
  }, [hs4Partition, selectedProduct, year, yearData]);
  const overlayByCountry = useMemo(
    () => new Map(overlayData.map((datum) => [datum.iso3, datum])),
    [overlayData],
  );
  const overlayValues = useMemo(() => {
    const values = overlayData.map((item) => item[metric]);
    const colors = new Map<string, { color: string; value: number }>();
    if (metric === "worldExportShare") {
      const maximum = Math.max(0, ...values) || 1;
      const scale = scaleSequentialSqrt<string>(worldShareColor).domain([0, maximum]).clamp(true);
      overlayData.forEach((item) => {
        const value = item.worldExportShare;
        colors.set(item.iso3, {
          color: value > 0 ? scale(value) : NO_EXPORT_COLOR,
          value,
        });
      });
    } else if (metric === "net") {
      const cap = percentile(values.map(Math.abs), 0.95) || 1;
      const scale = scaleDivergingSymlog<string>(interpolateRdBu).domain([-cap, 0, cap]).clamp(true);
      overlayData.forEach((item) => colors.set(item.iso3, { color: scale(item.net), value: item.net }));
    } else {
      const positive = values.filter((value) => value > 0);
      const cap = percentile(positive, 0.95) || 1;
      const scale = scaleSequentialSqrt<string>(interpolateYlGnBu).domain([0, cap]).clamp(true);
      overlayData.forEach((item) => colors.set(item.iso3, { color: scale(item[metric]), value: item[metric] }));
    }
    return colors;
  }, [metric, overlayData]);

  const activeCountry = yearCountriesById.get(resolvedIso3);
  const activeFingerprint = hs4LensCountriesById.get(resolvedIso3);
  const activeMeta = countriesById.get(resolvedIso3);
  const activeCountryName = activeMeta ? displayCountryName(activeMeta.iso3, activeMeta.name) : "";
  const activeOverlay = overlayByCountry.get(resolvedIso3);
  const destinationMeta = activeCountry?.leadingDestination
    ? countriesById.get(activeCountry.leadingDestination)
    : null;
  const destinationName = destinationMeta
    ? displayCountryName(destinationMeta.iso3, destinationMeta.name)
    : null;
  const displayedCountryQuery = countryQuery ?? activeCountryName;

  const selectCountry = (iso3: string, moveMap = false) => {
    if (!yearCountriesById.has(iso3)) return;
    setActiveIso3(iso3);
    const properties = geometryByCountry.get(iso3);
    if (moveMap && properties) {
      setFocusRequest({ iso3, center: [properties.labelX, properties.labelY], nonce: Date.now() });
    }
  };

  const findCountry = (query: string, includePrefix = false) => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return undefined;
    return selectableCountries.find((country) => {
      const name = displayCountryName(country.iso3, country.name).toLocaleLowerCase();
      return name === normalized || (includePrefix && name.startsWith(normalized));
    });
  };

  const commitCountryQuery = () => {
    const match = findCountry(displayedCountryQuery, true);
    if (!match) {
      setCountryQuery(null);
      return;
    }
    setCountryQuery(null);
    selectCountry(match.iso3, true);
  };

  const selectMode = (nextMode: ExplorerMode) => {
    setMode(nextMode);
    if (nextMode === "overlay") {
      setFocusRequest({ iso3: "WORLD", center: [5, 22], zoom: 1.45, nonce: Date.now() });
      return;
    }
    const properties = geometryByCountry.get(resolvedIso3);
    if (properties) {
      setFocusRequest({
        iso3: resolvedIso3,
        center: [properties.labelX, properties.labelY],
        zoom: 2.2,
        nonce: Date.now(),
      });
    }
  };

  if (error && !base) {
    return (
      <main className="fatal-state">
        <p className="eyebrow">Trade Atlas</p>
        <h1>The data could not be loaded.</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!base || !yearData || !hs4LensData || !selectedProduct) {
    return (
      <main className="loading-state">
        <span className="loading-mark" />
        <p>Preparing the world trade map…</p>
      </main>
    );
  }

  const activeMetricInfo = METRICS.find((item) => item.id === metric)!;
  const overlayProductName = selectedProduct.label.replace(/^\d{2,4}\s·\s/, "");
  const legendValues = [...overlayValues.values()].map((item) => item.value);
  const legendCap = metric === "net"
    ? percentile(legendValues.map(Math.abs), 0.95)
    : percentile(legendValues.filter((value) => value > 0), 0.95);
  const legendMaximum = metric === "net"
    ? Math.max(0, ...legendValues.map(Math.abs))
    : Math.max(0, ...legendValues);
  const legendIsCapped = metric !== "worldExportShare" && legendCap > 0 && legendCap < legendMaximum;
  const worldShareLegendValues = WORLD_SHARE_LEGEND_STOPS.map((stop) => (
    stop === 0 ? null : legendMaximum * stop ** 2
  ));

  return (
    <main className={`trade-app mode-${mode}`}>
      <section className="map-stage" aria-label="Trade Atlas explorer">
        <TradeMap
          geometry={base.geometry}
          mode={mode}
          activeIso3={resolvedIso3}
          overlayMetric={metric}
          overlayValues={mode === "overlay" ? overlayValues : new Map()}
          focusRequest={focusRequest ?? initialFocusRequest}
          onCountryFocus={(iso3) => {
            if (iso3) selectCountry(iso3);
            else if (mode === "country") setActiveIso3("");
          }}
        />

        <div className="brand-panel">
          <header className="brand-copy">
            <p className="eyebrow">Trade Atlas</p>
            <h2 className={`trade-headline${mode === "overlay" ? " overlay-headline" : ""}`}>
              {mode === "country" ? (
                <>
                  <span>See what</span>
                  <label className="headline-country-search">
                    <input
                      aria-label="Search for a country"
                      type="search"
                      list="country-name-suggestions"
                      value={displayedCountryQuery}
                      placeholder="a country"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        const nextQuery = event.target.value;
                        setCountryQuery(nextQuery);
                        const exactMatch = findCountry(nextQuery);
                        if (exactMatch) selectCountry(exactMatch.iso3, true);
                      }}
                      onBlur={commitCountryQuery}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitCountryQuery();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          setCountryQuery(null);
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <datalist id="country-name-suggestions">
                      {selectableCountries.map((country) => (
                        <option key={country.iso3} value={displayCountryName(country.iso3, country.name)} />
                      ))}
                    </datalist>
                  </label>
                  <span>trades.</span>
                </>
              ) : (
                <>
                  <span>Compare trade in</span>
                  <span className="overlay-headline-product" title={overlayProductName}>{overlayProductName}</span>
                  <span>worldwide.</span>
                </>
              )}
            </h2>
            <p>{mode === "country" ? "Drag the map beneath the lens." : "Compare one product’s trade across every country."}</p>
          </header>

          {mode === "overlay" && (
            <div className="overlay-stack">
              <section className="overlay-dock" aria-label="Product overlay controls">
                <label className="product-picker">
                  <span>Category or product</span>
                  <select value={selectedProduct.id} onChange={(event) => setSelectionId(event.target.value)}>
                    {productGroups.map((group) => (
                      <optgroup key={group.id} label={`${group.id} · ${group.name}`}>
                        <option disabled value={`heading:${group.id}:hs2`}>— HS2 categories —</option>
                        {group.hs2.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        <option disabled value={`heading:${group.id}:hs4`}>— HS4 products —</option>
                        {group.hs4.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <div className="metric-switch" aria-label="Overlay measure">
                  {METRICS.map((item) => (
                    <button key={item.id} type="button" className={metric === item.id ? "active" : ""} onClick={() => setMetric(item.id)}>
                      <strong>{item.label}</strong>
                      <span>{item.help}</span>
                    </button>
                  ))}
                </div>
              </section>

              {activeCountry && activeMeta && activeOverlay && (
                <aside className="overlay-profile" aria-live="polite">
                  <div className="overlay-profile-heading">
                    <span>{activeCountryName} · {year}</span>
                    <strong>{selectedProduct.label}</strong>
                  </div>
                  <dl>
                    <div><dt>World share</dt><dd>{formatPercent(activeOverlay.worldExportShare)}</dd><small>#{activeOverlay.ranks.worldExportShare}</small></div>
                    <div><dt>Export dependence</dt><dd>{formatPercent(activeOverlay.exportShare)}</dd><small>#{activeOverlay.ranks.exportShare}</small></div>
                    <div><dt>Net exports</dt><dd className={activeOverlay.net >= 0 ? "positive" : "negative"}>{formatCurrency(activeOverlay.net)}</dd><small>#{activeOverlay.ranks.net}</small></div>
                    <div><dt>Specialization</dt><dd>{formatRca(activeOverlay.rca)}</dd><small>#{activeOverlay.ranks.rca}</small></div>
                  </dl>
                </aside>
              )}
            </div>
          )}
        </div>

        <nav className="view-dock" aria-label="Explorer controls">
          <div className="mode-switch" aria-label="View mode">
            <button type="button" className={mode === "country" ? "active" : ""} onClick={() => selectMode("country")}>Country lens</button>
            <button type="button" className={mode === "overlay" ? "active" : ""} onClick={() => selectMode("overlay")}>Product overlay</button>
          </div>
        </nav>

        {mode === "country" && (
          <TradeLens
            country={activeCountry ?? null}
            countryMeta={activeMeta ?? null}
            fingerprint={activeFingerprint ?? null}
            products={productsById}
            destinationName={destinationName}
            year={year}
            provisional={yearData.provisional}
            onSelectProduct={(hs4) => {
              setSelectionId(`hs4:${hs4}`);
              selectMode("overlay");
            }}
          />
        )}

        {mode === "overlay" && (
          <div className="map-legend" aria-label={`${activeMetricInfo.label} color scale`}>
            <span>{activeMetricInfo.help}</span>
            {metric === "worldExportShare" ? (
              <>
                <small>Full range · square-root scale</small>
                <div className="legend-zero-key"><i />No recorded exports</div>
                <div className="legend-ramp sequential full-range" style={{ background: WORLD_SHARE_RAMP }} />
                <div className="legend-labels legend-labels-multi">
                  {worldShareLegendValues.map((value, index) => (
                    <span key={WORLD_SHARE_LEGEND_STOPS[index]}>
                      {value === null ? ">0" : formatMetric(metric, value)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                {legendIsCapped && <small>Color saturates beyond the shown endpoints.</small>}
                <div className={metric === "net" ? "legend-ramp diverging" : "legend-ramp sequential"} />
                <div className="legend-labels">
                  <span>{metric === "net" && legendIsCapped ? `≤ ${formatMetric(metric, -legendCap)}` : metric === "net" ? formatMetric(metric, -legendCap) : "0"}</span>
                  <span>{legendIsCapped ? `≥ ${formatMetric(metric, legendCap)}` : formatMetric(metric, legendCap)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <YearCarousel
          years={base.manifest.years}
          value={year}
          provisionalYears={base.manifest.provisionalYears}
          loading={loadingYear}
          onChange={setYear}
        />

        <p className="data-note">
          BACI, CEPII · HS 2017 classification · HS2 + HS4 view
        </p>
      </section>
    </main>
  );
}
