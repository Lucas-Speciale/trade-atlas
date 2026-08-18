export const formatCurrency = (value: number): string => {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (absolute >= 1e12) return `${sign}$${(absolute / 1e12).toFixed(2)}T`;
  if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(1)}M`;
  if (absolute >= 1e3) return `${sign}$${(absolute / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(absolute).toLocaleString()}`;
};
export const formatPercent = (value: number, digits = 1): string =>
  `${(value * 100).toFixed(digits)}%`;

export const formatRca = (value: number): string => `${value.toFixed(2)}×`;

export const formatMetric = (
  metric: "worldExportShare" | "exportShare" | "net" | "rca",
  value: number,
): string => {
  if (metric === "net") return formatCurrency(value);
  if (metric === "rca") return formatRca(value);
  return formatPercent(value, value < 0.001 ? 2 : 1);
};
