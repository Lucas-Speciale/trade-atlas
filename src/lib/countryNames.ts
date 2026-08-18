const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  BOL: "Bolivia",
  CAF: "Central African Republic",
  CCK: "Cocos Islands",
  COD: "Democratic Republic of the Congo",
  COK: "Cook Islands",
  CXR: "Christmas Island",
  CYM: "Cayman Islands",
  DOM: "Dominican Republic",
  FLK: "Falkland Islands",
  FSM: "Micronesia",
  HKG: "Hong Kong",
  KOR: "South Korea",
  LAO: "Laos",
  MAC: "Macao",
  MDA: "Moldova",
  MHL: "Marshall Islands",
  MNP: "Northern Mariana Islands",
  NFK: "Norfolk Island",
  PRK: "North Korea",
  PSE: "Palestine",
  SLB: "Solomon Islands",
  TCA: "Turks and Caicos Islands",
  TZA: "Tanzania",
  VGB: "British Virgin Islands",
  WLF: "Wallis and Futuna",
};

export function displayCountryName(iso3: string, sourceName: string): string {
  return COUNTRY_NAME_OVERRIDES[iso3] ?? sourceName.replace(/\s*\(\.\.\.\d{4}\)$/, "");
}
