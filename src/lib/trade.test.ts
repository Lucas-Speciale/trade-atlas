import { describe, expect, it } from "vitest";

import { computeHs4Overlay, computeOverlay, makeProductSelections, percentile } from "./trade";
import type { CountryYear, Hs4Meta, ProductSelection } from "@/types/trade";

const selection: ProductSelection = {
  id: "hs2:01",
  label: "Live animals",
  hs2Ids: ["01"],
  kind: "hs2",
};

const country = (iso3: string, total: number, productExports: number): CountryYear => ({
  iso3,
  exports: total,
  imports: 0,
  net: total,
  leadingDestination: null,
  leadingDestinationExports: null,
  products: [
    {
      hs2: "01",
      exports: productExports,
      imports: 0,
    },
  ],
});

describe("computeOverlay", () => {
  it("calculates shares, RCA, and independent ranks", () => {
    const result = computeOverlay([country("AAA", 100, 20), country("BBB", 300, 30)], selection, 400);
    const a = result.find((item) => item.iso3 === "AAA")!;
    const b = result.find((item) => item.iso3 === "BBB")!;

    expect(a.worldExportShare).toBeCloseTo(0.4);
    expect(a.exportShare).toBeCloseTo(0.2);
    expect(a.rca).toBeCloseTo(1.6);
    expect(a.ranks.rca).toBe(1);
    expect(b.ranks.worldExportShare).toBe(1);
  });

  it("calculates the same measures from a compact HS4 flow partition", () => {
    const result = computeHs4Overlay(
      [country("AAA", 100, 0), country("BBB", 300, 0)],
      [["AAA", 20, 5], ["BBB", 30, 40]],
      400,
    );
    const a = result.find((item) => item.iso3 === "AAA")!;
    const b = result.find((item) => item.iso3 === "BBB")!;

    expect(a.worldExportShare).toBeCloseTo(0.4);
    expect(a.net).toBe(15);
    expect(a.ranks.rca).toBe(1);
    expect(b.net).toBe(-10);
  });
});

describe("makeProductSelections", () => {
  it("preserves the official HS4 code and its parent HS2 chapter", () => {
    const hs4: Hs4Meta = {
      id: "7108",
      name: "Gold",
      hs2: "71",
      sectionId: "14",
      sectionName: "Precious metals & stones",
    };
    const result = makeProductSelections([], [hs4]).find((item) => item.id === "hs4:7108");

    expect(result).toMatchObject({ kind: "hs4", hs4Id: "7108", hs2Ids: ["71"] });
  });
});

describe("percentile", () => {
  it("returns a stable nearest-rank percentile", () => {
    expect(percentile([1, 4, 2, 3], 0.75)).toBe(3);
    expect(percentile([], 0.95)).toBe(0);
  });
});
