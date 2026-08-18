import { describe, expect, it } from "vitest";

import { displayCountryName } from "./countryNames";

describe("displayCountryName", () => {
  it("replaces long official trade labels with concise display names", () => {
    expect(displayCountryName("BOL", "Bolivia (Plurinational State of)")).toBe("Bolivia");
    expect(displayCountryName("KOR", "Rep. of Korea")).toBe("South Korea");
  });

  it("preserves ordinary country names", () => {
    expect(displayCountryName("NAM", "Namibia")).toBe("Namibia");
  });
});
