import type {
  CountryYear,
  Hs4CountryFlow,
  Hs4Meta,
  Hs2Meta,
  OverlayDatum,
  OverlayMetric,
  ProductSelection,
} from "@/types/trade";

export const makeProductSelections = (
  products: Hs2Meta[],
  hs4Products: Hs4Meta[] = [],
): ProductSelection[] => [
  ...products.map((product) => ({
    id: `hs2:${product.id}`,
    label: `${product.id} · ${product.name}`,
    hs2Ids: [product.id],
    kind: "hs2" as const,
  })),
  ...hs4Products.map((product) => ({
    id: `hs4:${product.id}`,
    label: `${product.id} · ${product.name}`,
    hs2Ids: [product.hs2],
    hs4Id: product.id,
    kind: "hs4" as const,
  })),
];

const rankValues = (values: Array<{ iso3: string; value: number }>): Map<string, number> => {
  const sorted = [...values].sort((a, b) => b.value - a.value || a.iso3.localeCompare(b.iso3));
  const ranks = new Map<string, number>();
  let previous: number | undefined;
  let rank = 0;
  sorted.forEach((item, index) => {
    if (previous === undefined || item.value !== previous) rank = index + 1;
    ranks.set(item.iso3, rank);
    previous = item.value;
  });
  return ranks;
};

const finalizeOverlay = (
  countries: CountryYear[],
  valuesByCountry: Map<string, { exports: number; imports: number }>,
  worldExports: number,
): OverlayDatum[] => {
  const base = countries.map((country) => {
    const values = valuesByCountry.get(country.iso3);
    const exports = values?.exports ?? 0;
    const imports = values?.imports ?? 0;
    return { country, exports, imports };
  });
  const categoryWorldExports = base.reduce((sum, item) => sum + item.exports, 0);
  const worldCategoryShare = worldExports ? categoryWorldExports / worldExports : 0;
  const values = base.map(({ country, exports, imports }) => ({
    iso3: country.iso3,
    exports,
    imports,
    net: exports - imports,
    exportShare: country.exports ? exports / country.exports : 0,
    worldExportShare: categoryWorldExports ? exports / categoryWorldExports : 0,
    rca: worldCategoryShare && country.exports ? exports / country.exports / worldCategoryShare : 0,
  }));

  const metrics: OverlayMetric[] = ["worldExportShare", "exportShare", "net", "rca"];
  const rankMaps = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      rankValues(values.map((item) => ({ iso3: item.iso3, value: item[metric] }))),
    ]),
  ) as Record<OverlayMetric, Map<string, number>>;

  return values.map((item) => ({
    ...item,
    ranks: {
      worldExportShare: rankMaps.worldExportShare.get(item.iso3) ?? 0,
      exportShare: rankMaps.exportShare.get(item.iso3) ?? 0,
      net: rankMaps.net.get(item.iso3) ?? 0,
      rca: rankMaps.rca.get(item.iso3) ?? 0,
    },
  }));
};

export const computeOverlay = (
  countries: CountryYear[],
  selection: ProductSelection,
  worldExports: number,
): OverlayDatum[] => {
  const selected = new Set(selection.hs2Ids);
  const valuesByCountry = new Map<string, { exports: number; imports: number }>();
  countries.forEach((country) => {
    const rows = country.products.filter((product) => selected.has(product.hs2));
    valuesByCountry.set(country.iso3, {
      exports: rows.reduce((sum, row) => sum + row.exports, 0),
      imports: rows.reduce((sum, row) => sum + row.imports, 0),
    });
  });
  return finalizeOverlay(countries, valuesByCountry, worldExports);
};

export const computeHs4Overlay = (
  countries: CountryYear[],
  flows: Hs4CountryFlow[],
  worldExports: number,
): OverlayDatum[] => {
  const valuesByCountry = new Map(
    flows.map(([iso3, exports, imports]) => [iso3, { exports, imports }]),
  );
  return finalizeOverlay(countries, valuesByCountry, worldExports);
};

export const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
};
