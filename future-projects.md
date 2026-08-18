# Future projects

This document separates concrete Trade Atlas extensions from ideas for new, static-first data visualizations. It is a direction list, not an implementation plan.

## Working model for every project

Keep raw source archives local or in external storage. Do not deploy them and do not commit them unless they are genuinely small metadata files with a clear reason to be versioned.

Run expensive joins, rankings, correlations, and geometry work offline. Publish only compact files that map directly to interactions in the browser. A good pattern is:

```text
downloaded source snapshot → local DuckDB/Python build → validation report
                           → versioned JSON/CSV/Parquet partitions → static site
```

Avoid precomputing every possible pairwise comparison. That becomes combinatorial and duplicates data. Preserve reusable atomic measures—country, year, item, value—plus shared totals, then let the browser calculate cheap ratios and comparisons. Precompute only expensive structures such as ranks, top-k relationships, concentration indices, correlations selected for a feature, and map geometry.

Runtime APIs are acceptable for data that must be live, but they should not be the default. Periodic source snapshots give these projects faster interaction, reproducible results, no exposed credentials, and graceful operation when an upstream service is unavailable.

Before adopting any dataset, confirm its current licence, attribution, update policy, geographic identifiers, missing-data conventions, and whether republishing derived assets is allowed.

## Trade Atlas extensions

### 1. Year playback

Add a play control beside the year carousel. Product colors, ranks, selected-country values, and routes would interpolate from 2017 through 2024, pause briefly on each year, and loop. This is the smallest high-impact addition because all annual partitions already exist.

Useful details:

- Show the active year prominently and retain the provisional marker.
- Pause on direct user input and respect reduced-motion preferences.
- Prefetch only the next partition rather than loading the complete dataset.
- Offer a slow mode so geographically small changes remain readable.

### 2. Who controls world supply?

For any HS4 product or HS2 category, show how concentrated worldwide exports are and how that changes over time.

- Animated top-exporter ranking or bump chart
- Each leader's world export share
- Combined top-one, top-three, top-five, and top-ten shares
- Herfindahl–Hirschman Index (HHI)
- Countries entering or leaving the top ten
- A deterministic summary such as “Iron-ore exports became more concentrated from 2017 to 2024”

Precompute one compact product-year concentration record from the existing country export totals. Keep the actual maximum visible; do not hide dominant suppliers behind a percentile-capped legend.

For a longer historical view, CEPII's [BACI HS92 series covers 1995–2024](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html). It should be a separate long-run mode rather than silently appended to HS17: product definitions differ across HS revisions, and CEPII advises against mixing BACI releases.

### 3. Dependency and chokepoints

Turn the current product route web into a supply-dependence view. Select a country and product, then answer not only “where does it come from?” but “how exposed is this country to one supplier?”

- Largest supplier and its share of imports
- Top-three supplier share and import-source HHI
- Number of meaningful suppliers
- Alternative suppliers already serving nearby markets
- Export-market dependence for producing countries
- A clear resilient/diversified/concentrated classification with its thresholds shown

The existing bilateral BACI rows support this. The current top-ten route web is the visual base; future controls could switch between exports, imports, and the automatically selected net direction without changing the choropleth's meaning.

### 4. Trade shocks and rerouting

Show where a product's trade network changed most between two years.

- Year-over-year export and import change by country
- Newly appearing or disappearing major routes
- Partner replacement: which destination or supplier took another's place
- Absolute-dollar and percentage-change modes
- A before/after route animation centered on one selected country

This would reveal sanctions, shortages, new capacity, and demand shifts without claiming causation. Suppress misleading percentage changes when the starting value is tiny and always show the underlying dollar values.

### 5. Value versus physical quantity

BACI includes both trade value and metric quantity. A product view could compare tonnes, dollars, and implied value per tonne; highlight countries that export a high-value form of a commodity; or show whether growth came from price, volume, or both.

This needs stricter validation than the current value-only experience. Quantity reporting can be missing or inconsistent, and implied unit values are not retail prices. Use product-specific outlier checks and disclose coverage before shipping it.

### 6. Cross-dataset trade stories

Join BACI's stable country-year measures to one carefully selected external series. Strong examples include:

- Export concentration versus income or growth
- Food production versus food exports
- Electricity mix versus exports of clean-energy equipment
- Carbon emissions versus the carbon intensity of an export basket

Store the shared primitive measures and compute user-selected comparisons in the browser. Precompute correlations only for published indicators with adequate overlapping coverage, and show sample size, years, missing countries, and the reminder that correlation is not causation.

## New visualization projects and open data

### Demographic profiles — UN World Population Prospects

Source: [UN World Population Prospects 2024](https://population.un.org/wpp/), which recommends CSV bulk downloads for database use and provides annual estimates and projections.

Possible experience:

- A country lens with population, fertility, mortality, migration, and age structure
- Animated population pyramids from 1950 through projections to 2100
- “Demographic neighbors” that find countries with similar age profiles
- A map of when each country reaches peak population or a selected median age

This is the closest standalone successor to the original VisQuill inspiration and fits compact country-year partitions well.

### Food systems and crop belts — FAOSTAT

Source: [FAOSTAT](https://www.fao.org/faostat/en/), which provides free access and bulk downloads for food and agriculture series.

Possible experience:

- Select wheat, coffee, cocoa, soy, cattle, or another commodity and watch production belts move over time
- Separate total output, yield, harvested area, and share of national agriculture
- Compare what a country produces with what it exports by joining a FAOSTAT commodity to BACI
- Show yield gaps and land-use trade-offs without conflating production with trade

The main work is a reviewed FAOSTAT-to-HS concordance; many agricultural commodities do not map one-to-one to customs products.

### Development atlas — World Development Indicators

Source: [World Bank World Development Indicators](https://datatopics.worldbank.org/world-development-indicators/), available as bulk CSV and Excel files with metadata.

Possible experience:

- A scrollable country profile for income, health, education, urbanization, infrastructure, and emissions
- A two-indicator comparison map with trails through time
- “Countries like this one” based on normalized indicator profiles
- Small multiples showing regional convergence or divergence

WDI is broad rather than perfectly complete. Every interaction should expose indicator definitions, source notes, units, and missing-year coverage.

### Displacement routes — UNHCR Refugee Data Finder

Source: [UNHCR Refugee Statistics](https://www.unhcr.org/refugee-statistics/). Its data spans origin, country of asylum, population type, year, and available demographics; downloads can be captured as versioned CSV snapshots through the official data service.

Possible experience:

- Animated origin-to-asylum arcs over time
- Stock versus annual movement/solution views
- Host-country share and origin-country displacement rate
- A selected-country story separating refugees, asylum-seekers, internally displaced people, returns, and resettlement

Definitions change by population type and not every route represents a movement during that year. The design must be careful, humane, and explicit about stocks versus flows.

### The electricity transition — Ember

Source: [Ember's official open data repository](https://github.com/ember-energy/ember-data-api) and [Electricity Data Explorer](https://ember-energy.org/data/electricity-data-explorer/). The official API documents a CC BY 4.0 licence, while the repository contains underlying annual data files that can be snapshotted offline.

Possible experience:

- A country lens whose ring is the electricity mix by source
- Playback of coal, gas, nuclear, hydro, wind, solar, and bioenergy shares
- The year wind and solar overtake a selected source
- Cross-border comparisons of generation, demand, emissions intensity, and clean-power growth

Use the source files during the offline build; a runtime API call is unnecessary for an annually or monthly refreshed portfolio piece.

### Carbon responsibility — Global Carbon Budget

Source: [Global Carbon Budget Data Hub](https://globalcarbonbudget.org/datahub/), with downloadable summary spreadsheets, national emissions, land-use emissions, gridded files, and archived releases.

Possible experience:

- Switch among annual, cumulative, per-capita, fossil, and land-use emissions
- Animate the center of global emissions over two centuries
- Compare territorial emissions with population and trade exposure
- Show the global budget as sources flowing into atmospheric, land, and ocean sinks

This can stay very light when built from national summary tables; gridded NetCDF layers should be pre-tiled or omitted from an initial version.

### Maritime connectivity — UNCTAD

Source: [UNCTAD Data Hub maritime transport indicators](https://unctadstat.unctad.org/insights/theme/246), including country, port, and bilateral liner-shipping connectivity measures.

Possible experience:

- A port and country network showing strongest scheduled liner connections
- How a port's connectivity rank changes over time
- Trade value from BACI combined with UNCTAD connectivity to find high-trade, low-connectivity bottlenecks
- Regional shipping corridors that brighten or fade during playback

This is not a vessel-tracking dataset. Global AIS traces are much larger and often commercially restricted, so the connectivity indices are the better lightweight first project.

### Conflict events — UCDP

Source: [UCDP Dataset Download Center](https://ucdp.uu.se/downloads/), which provides current georeferenced event data as direct CSV and Excel downloads.

Possible experience:

- A time-aware map of organized-violence events with uncertainty and event type
- Regional timelines and changes in geographic concentration
- A carefully framed comparison of conflict exposure with trade-route changes or displacement

This subject requires restrained design, exact definitions, visible source notes, and no decorative treatment of casualties.

## Suggested order

1. Add Trade Atlas year playback.
2. Add product concentration and dependency measures from BACI.
3. Build the UN demographic profile as the next standalone project.
4. Build FAOSTAT crop belts and connect production to trade.
5. Choose electricity, carbon, displacement, or maritime connectivity based on the story the portfolio needs next.
