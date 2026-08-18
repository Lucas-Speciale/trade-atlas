# Trade Atlas — Interaction and Build Plan

## Purpose

Trade Atlas is a lightweight, browser-based way to explore how countries participate in global merchandise trade. It combines two connected experiences:

1. **Country Lens** — move a flat world map beneath a fixed visual lens and watch the selected country’s export fingerprint change in place.
2. **Product Overlay** — choose an HS4 product, HS2 chapter, or agriculture/food group and compare countries worldwide using a choropleth.

The experience is inspired by OEC’s Tradle and VisQuill’s Demographic Profiles, but the chart language, trade measures, and product workflow are original to this project.

## Data and terminology

The source is BACI, produced by CEPII from UN Comtrade and distributed under the Etalab Open Licence 2.0.

- **HS 2017** is the revision of the Harmonized System used by the source archive.
- **HS2** remains the lightweight overview: broad product chapters represented by the first two digits of an HS code.
- **HS4** is the next drill-down level: official four-digit headings that describe recognizable products within each HS2 chapter.
- **HS3 is not used.** The Harmonized System does not define a standard three-digit product level, so truncating codes to three digits would create arbitrary, unlabeled groups.

The prototype includes 2017–2024. The raw HS6 BACI archive remains a local, reproducible input and is never deployed. Public assets contain compact country/year HS2 aggregates, leading HS4 country fingerprints, and lazy HS4 overlay partitions rather than the full bilateral source.

## Interaction architecture

The visualization occupies the viewport rather than behaving like a dashboard followed by cards.

```text
Floating title and mode controls
────────────────────────────────
MapLibre canvas using OpenFreeMap
Country fill and boundary layers
────────────────────────────────
Viewport-sized SVG/HTML HUD
Focus wash and central country lens
Radial export bars and annotations
Year carousel and compact controls
────────────────────────────────
Attribution
```

The map and HUD use the same viewport coordinate system but remain separate renderers. MapLibre owns geography, panning, zooming, labels, and pointer feature events. React owns selection state and renders the chart/controls. The SVG HUD ignores pointer events except on explicitly interactive bars and controls.

## Mode 1: Country Lens

### Selection behavior

- A fixed circular lens sits near the center of the viewport.
- The user drags the map beneath it.
- The country rendered beneath the lens center becomes active during movement.
- Moving between countries updates the country name, totals, radial bars, annotations, and highlight in place.
- In Country Lens mode, pointer input is reserved for dragging and zooming the map; countries do not react to hover or click.
- Searching from the country name in the headline moves that country into the lens.
- Small countries remain reachable through headline autocomplete.

### Focus treatment

- A translucent pale wash quiets the map outside the active interface.
- A circular cutout keeps the selected geography clear.
- The active country receives a restrained warm fill and crisp outline.
- OpenFreeMap's native country labels and restrained Admin 0 boundaries remain legible alongside basemap coastlines, water, and subtle terrain.
- The lens contains no interface text. A fine leader line runs from its center through the lower rim to unboxed black annotation text below it. The text sits directly on the existing pale focus wash—there is no panel, border, blur, shadow, or divider.
- The effect uses SVG/CSS masking and translucent fills rather than a live blur filter.

### Export fingerprint

A radial semicircle of product readouts wraps around the top of the country lens.

- The largest HS4 export begins at the upper-left and products decrease clockwise.
- Desktop shows the six leading products; narrower layouts reduce the count before adding **All other products**.
- Every readout persistently shows the HS4 product name, its exact share of the country's total exports, and its export value.
- Broad HS sections provide restrained spoke colors; color is supportive rather than the primary encoding.
- Readouts draw in sequentially and percentages count up when the country or year changes.
- Hover/focus emphasizes one product and repeats its full definition in the annotation below the lens.
- Selecting a product opens it in Product Overlay mode.
- **All other products** is neutral and accounts for the remainder of the export basket.
- Hovering or focusing **All other products** opens a downward ranked breakdown of the remaining retained HS4 headings and percentages; the final residual keeps the totals complete.

### Country information

The lens and nearby annotations show:

- Country name and total merchandise exports
- Total merchandise imports
- Net merchandise exports, explicitly defined as exports minus imports and identified as a trade surplus or deficit
- Leading HS4 product
- Leading destination
- Selected year and provisional status

The country identity, year, and current export readout live in the leader-line annotation beneath the lens. The remaining values stay in the lower map HUD rather than becoming a separate page section.

### Year carousel

- All available years appear on a horizontally draggable strip.
- The active year is centered and emphasized; neighboring years fade with distance.
- Bold type is the only selected-year treatment; the carousel does not add marker bars around it.
- Mouse drag, touch swipe, wheel, arrow keys, and direct click are supported.
- The control snaps to a year and preloads neighboring year files.
- Country and chart transitions respond immediately when the active year changes.

## Mode 2: Product Overlay

Product Overlay uses the same full-viewport map. The country lens and radial basket retract so the global color pattern becomes primary.

The user selects an HS4 product, HS2 chapter, or agriculture/food group and one measure:

- **Largest exporters** — country share of worldwide exports for the selection.
- **Export dependence** — selection share of the country’s total exports.
- **Net exporters** — exports minus imports for the selection.
- **Specialization** — revealed comparative advantage for the selection.

Product, metric, legend, and year controls float over the map. Hovering a country shows its value; selecting it pins a compact four-measure comparison and rank. Mode, year, country, product, and metric remain shareable URL parameters.

## Shared country control

The upper-left title always uses three lines: **See what / [Country] / trades.** The country name changes with lens movement, and the name itself is a searchable autocomplete field. When the lens is over ocean it clears to the search placeholder. This is the only explicit country selector; there is no duplicate control in the upper-right mode switch.

## Agriculture and food groupings

- Animal Products — HS 01–05
- Vegetable Products — HS 06–14
- Animal and Vegetable Fats and Oils — HS 15
- Foodstuffs — HS 16–24
- Agriculture & Food — HS 01–24

These filters describe trade, not domestic production.

## Map sources and behavior

### Basemap

- Map renderer: MapLibre GL JS
- Hosted tiles and style: OpenFreeMap `Liberty`
- Underlying map data: OpenStreetMap / OpenMapTiles
- MapLibre worker: explicit, version-pinned module URL so Next.js can load vector tiles and GeoJSON processing reliably
- Projection: flat Web Mercator
- Pitch and rotation disabled
- Restrained global zoom range
- Map attribution remains visible

OpenFreeMap provides the geographic detail and labeling visible in the reference while keeping the app keyless. It is a runtime network dependency; the trade data and country hit geometry remain local.

The Liberty style includes a low-resolution Natural Earth raster beneath its vector layers. If MapLibre’s worker does not start, that raster can make the map appear partially loaded while country boundaries, labels, and detailed island geometry remain absent. The application therefore configures the worker explicitly instead of relying on MapLibre to infer its module URL from the Next.js client bundle.

### Country boundaries

Use a simplified local Admin 0 GeoJSON with an explicit reviewed BACI ISO3 crosswalk. World Bank Official Administrative Boundaries are the preferred source for the rebuilt country selection/highlight layer and require CC BY 4.0 attribution plus a boundary-status disclaimer.

A dedicated MapLibre fill layer drives overlay hover, overlay selection, and choropleth coloring. For continuous country-lens selection, MapLibre converts the lens center to longitude/latitude and a precomputed local polygon index resolves the active country, including antimeridian handling.

## Data architecture

The app remains backend-free at runtime.

An offline Python/DuckDB build reads BACI and emits immutable assets:

```text
public/data/trade/
├── manifest.json
├── countries.json
├── hs2.json
├── hs4.json
├── geometry.geojson
├── years/
    ├── 2017.json
    ├── 2018.json
    ├── 2019.json
    ├── 2020.json
    ├── 2021.json
    ├── 2022.json
    ├── 2023.json
│   └── 2024.json
└── hs4/
    ├── lens/{year}.json
    └── years/{year}/{parent-hs2}.json
```

Shared metadata and geometry load once. One complete HS2 file and one compact leading-HS4 fingerprint file load for the active year. Country changes, metric changes, and chart transitions operate in memory. Neighboring years are cached or prefetched. An exact HS4 overlay loads one partition for its active year and parent HS2 chapter.

### HS4 refinement

HS4 is derived from BACI's existing six-digit product code by retaining its first four digits and aggregating the underlying trade flows. It does not require another source download.

- Keep HS2 as the fast global overview and broad grouping layer.
- Use HS4 for the country fingerprint and recognizable product search/detail.
- Precompute only the leading HS4 headings needed for each country/year fingerprint.
- Partition global HS4 overlay data by year and parent HS2 chapter so a selection loads one small file on demand.
- Keep the raw bilateral HS6 files out of the deployed application.

This preserves a static, backend-free runtime while avoiding a single all-years, all-products client payload.

## Front-end architecture

- Next.js App Router and TypeScript
- React client component for the interactive explorer
- MapLibre GL JS for the flat basemap and geographic layers
- A single responsive SVG HUD for the lens, radial percentage readouts, wash, and chart labels
- Focused D3 scale/color modules for quantitative encodings
- Typed local state; no Redux or application server
- URL parameters for shareable state
- Vitest for calculation helpers and browser QA for the complete interaction

Do not introduce the VisQuill GDK. Its reactive ideas inform the component boundaries, but the required behavior is small enough to implement directly and transparently in the existing stack.

## Required derived measures

For each country, product, and year:

- Exports
- Imports
- Net exports = exports − imports
- Export-basket share = product exports / total country exports
- World-export share = product exports / worldwide exports of that product
- Revealed comparative advantage
- Per-measure country ranks

## Build phases

### Phase 1 — Plan and map foundation

- Establish the viewport map/HUD architecture as the single rendering model.
- Add MapLibre and OpenFreeMap Liberty.
- Load local country geometry into MapLibre as the hit, highlight, and overlay layer.
- Preserve the existing compact trade assets and URL state.

Exit condition: the detailed flat basemap renders and countries can be queried reliably through one map interaction layer.

### Phase 2 — Integrated Country Lens

- Replace the center reticle and detached chart card with a single viewport-sized trade lens.
- Add the focus wash, circular cutout, active-country treatment, country labels, radial export readouts, and annotations.
- Update selection continuously as the map crosses a country boundary.
- Add sequential entrance transitions, percentage count-ups, and product interactions.

Exit condition: dragging between countries changes the export fingerprint in place around the lens.

### Phase 3 — Year interaction

- Replace the country-mode year dropdown with the swipeable year carousel.
- Add snapping, keyboard control, wheel input, and neighboring-year prefetch.
- Keep a compact accessible fallback selection path.

Exit condition: changing year updates the selected country and lens without disrupting the map.

### Phase 4 — Integrated Product Overlay

- Retract the lens cleanly in overlay mode.
- Move product, metric, legend, selected-country values, and year controls into compact map overlays.
- Keep choropleth colors, country hover, country selection, and ranks synchronized.

Exit condition: users can move from a radial HS4 bar to its global comparison without leaving the visualization surface.

### Phase 5 — Cleanup and validation

- Delete superseded components, styles, types, dependencies, and copy.
- Confirm that MapLibre is the single owner of projection, pan, zoom, and pointer geography.
- Verify desktop and mobile layouts, keyboard access, reduced motion, loading/error states, tests, and static production build.
- Update README documentation and data/map attribution.

Exit condition: the codebase reads as one intentional implementation with no duplicate interaction or rendering paths.

### Phase 6 — Recognizable product drill-down (implemented)

- Aggregate BACI HS6 flows to official HS4 headings.
- Replace or supplement the broad country fingerprint with leading HS4 products.
- Add HS4 selection and parent-HS2 navigation.
- Generate country/year top-product files and lazy global overlay partitions rather than shipping the full dataset.
- Validate HS4 totals against their HS2 parents and preserve leading zeroes in product codes.

Exit condition: users can move from a broad HS2 chapter to recognizable HS4 products without materially increasing the initial page load.

## Success criteria

The prototype succeeds when a user can:

1. Drag the map and watch the centered country fingerprint change immediately.
2. Read the selected country’s largest exports directly around the map lens.
3. Move through every available year with the carousel.
4. Select a radial HS4 readout and see its worldwide export pattern.
5. Change overlay metrics and inspect country values without leaving the map.
6. Use the experience on desktop and mobile without stale panels or duplicated controls.

## Sources

- BACI HS 2017 archive: <https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS17_V202601.zip>
- BACI documentation: <https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html>
- OpenFreeMap: <https://openfreemap.org/>
- OpenFreeMap Liberty style: <https://tiles.openfreemap.org/styles/liberty>
- MapLibre GL JS: <https://maplibre.org/maplibre-gl-js/docs/>
- World Bank Official Boundaries: <https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries>
