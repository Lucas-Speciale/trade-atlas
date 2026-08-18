import type { FeatureCollection, Geometry } from "geojson";

export type ExplorerMode = "country" | "overlay";
export type OverlayMetric = "worldExportShare" | "exportShare" | "net" | "rca";

export interface Manifest {
  schemaVersion: number;
  source: {
    name: string;
    publisher: string;
    classification: string;
    version: string;
    valueUnit: string;
  };
  map: { name: string; version: string; scale: string };
  years: number[];
  defaultYear: number;
  provisionalYears: number[];
  files: {
    countries: string;
    products: string;
    hs4Products: string;
    geometry: string;
    yearPattern: string;
    hs4LensYearPattern: string;
    hs4PartitionPattern: string;
  };
}

export interface CountryMeta {
  iso3: string;
  sourceIso3: string;
  iso2: string | null;
  name: string;
  hasGeometry: boolean;
}

export interface AgricultureGroup {
  id: string;
  name: string;
}

export interface Hs2Meta {
  id: string;
  name: string;
  sectionId: string;
  sectionName: string;
  agricultureGroup: AgricultureGroup | null;
}

export interface Hs4Meta {
  id: string;
  name: string;
  hs2: string;
  sectionId: string;
  sectionName: string;
}

export interface ProductMetric {
  hs2: string;
  exports: number;
  imports: number;
}

export interface CountryYear {
  iso3: string;
  exports: number;
  imports: number;
  net: number;
  leadingDestination: string | null;
  leadingDestinationExports: number | null;
  products: ProductMetric[];
}

export interface YearData {
  schemaVersion: number;
  year: number;
  provisional: boolean;
  worldExports: number;
  worldImports: number;
  countries: CountryYear[];
}

export interface Hs4LensMetric {
  hs4: string;
  exports: number;
  exportShare: number;
}

export interface Hs4LensCountry {
  iso3: string;
  leadingHs4: string | null;
  products: Hs4LensMetric[];
}

export interface Hs4LensYear {
  schemaVersion: number;
  year: number;
  countries: Hs4LensCountry[];
}

export type Hs4CountryFlow = [iso3: string, exports: number, imports: number];

export interface Hs4Partition {
  schemaVersion: number;
  year: number;
  hs2: string;
  products: Record<string, Hs4CountryFlow[]>;
}

export interface MapProperties {
  mapIso3: string;
  tradeIso3: string | null;
  sourceIso3: string | null;
  name: string;
  labelX: number;
  labelY: number;
}

export type TradeGeometry = FeatureCollection<Geometry, MapProperties>;

export interface ProductSelection {
  id: string;
  label: string;
  hs2Ids: string[];
  hs4Id?: string;
  kind: "hs2" | "hs4" | "group";
}

export interface OverlayDatum {
  iso3: string;
  exports: number;
  imports: number;
  net: number;
  exportShare: number;
  worldExportShare: number;
  rca: number;
  ranks: Record<OverlayMetric, number>;
}
