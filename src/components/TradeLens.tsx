"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { displayCountryName } from "@/lib/countryNames";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { CountryMeta, CountryYear, Hs4LensCountry, Hs4Meta } from "@/types/trade";

const SECTION_COLORS = [
  "#cb6748", "#6e9b5a", "#b39639", "#d48645", "#78828d", "#967094", "#4f8986",
  "#91664f", "#886b43", "#5c8494", "#93677f", "#82725b", "#5c8094", "#ae8546",
  "#707983", "#39708e", "#55788f", "#607867", "#87545b", "#666b83", "#957058",
];

interface TradeLensProps {
  country: CountryYear | null;
  countryMeta: CountryMeta | null;
  fingerprint: Hs4LensCountry | null;
  products: Map<string, Hs4Meta>;
  destinationName: string | null;
  year: number;
  provisional: boolean;
  onSelectProduct: (hs4: string) => void;
}

interface LensBar {
  hs4: string;
  exports: number;
  exportShare: number;
  isOther: boolean;
}

function shortLabel(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

function useAnimatedLengths(targets: number[]): number[] {
  const [values, setValues] = useState(targets);
  const currentRef = useRef(targets);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => {
        currentRef.current = targets;
        setValues(targets);
      });
      return () => cancelAnimationFrame(frame);
    }
    const from = currentRef.current.length === targets.length ? currentRef.current : targets;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 320);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = targets.map((target, index) => (from[index] ?? target) + (target - (from[index] ?? target)) * eased);
      currentRef.current = next;
      setValues(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targets]);

  return values;
}

export function TradeLens({
  country,
  countryMeta,
  fingerprint,
  products,
  destinationName,
  year,
  provisional,
  onSelectProduct,
}: TradeLensProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 820 });
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setSize({ width: frame.clientWidth, height: frame.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const mobile = size.width < 700;
  const visibleCount = mobile ? 9 : 13;
  const bars = useMemo<LensBar[]>(() => {
    if (!country || !fingerprint) return [];
    const sorted = [...fingerprint.products].sort((a, b) => b.exports - a.exports);
    const top = sorted.slice(0, visibleCount).map((item) => ({
      hs4: item.hs4,
      exports: item.exports,
      exportShare: item.exportShare,
      isOther: false,
    }));
    const visibleExports = top.reduce((sum, item) => sum + item.exports, 0);
    const exports = Math.max(0, country.exports - visibleExports);
    if (exports > 0) {
      top.push({
        hs4: "other",
        exports,
        exportShare: country.exports ? exports / country.exports : 0,
        isOther: true,
      });
    }
    return top;
  }, [country, fingerprint, visibleCount]);

  const maxExports = bars[0]?.exports || 1;
  const targetLengths = useMemo(
    () => bars.map((bar) => bar.isOther ? (mobile ? 16 : 20) : 28 + Math.sqrt(bar.exports / maxExports) * (mobile ? 62 : 122)),
    [bars, maxExports, mobile],
  );
  const lengths = useAnimatedLengths(targetLengths);
  const center = { x: size.width / 2, y: size.height * (mobile ? 0.42 : 0.48) };
  const lensRadius = mobile ? 78 : Math.min(118, Math.max(96, size.height * 0.14));
  const innerRadius = lensRadius + (mobile ? 24 : 34);
  const startAngle = mobile ? 212 : 205;
  const endAngle = mobile ? 328 : 335;
  const angleStep = bars.length > 1 ? (endAngle - startAngle) / (bars.length - 1) : 0;
  const annotationTop = center.y + lensRadius + (mobile ? 17 : 20);
  const hoveredBar = hovered === null ? null : bars[hovered];
  const hoveredName = hoveredBar
    ? hoveredBar.isOther ? "Other exports" : products.get(hoveredBar.hs4)?.name ?? hoveredBar.hs4
    : null;
  const leadingName = fingerprint?.leadingHs4 ? products.get(fingerprint.leadingHs4)?.name ?? null : null;
  const countryName = countryMeta ? displayCountryName(countryMeta.iso3, countryMeta.name) : null;

  const facts = country ? [
    ["Exports", formatCurrency(country.exports)],
    ["Imports", formatCurrency(country.imports)],
    ["Net exports", formatCurrency(country.net)],
    ["Leading product", leadingName ?? "—"],
    ["Leading destination", destinationName ?? "—"],
  ] : [];

  return (
    <div ref={frameRef} className="trade-lens-layer">
      <svg
        className="trade-lens-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-label={countryName ? `${countryName} export fingerprint` : "Country selection lens"}
      >
        <defs>
          <mask id="trade-focus-mask">
            <rect width={size.width} height={size.height} fill="white" />
            <circle cx={center.x} cy={center.y} r={lensRadius} fill="black" />
          </mask>
          <filter id="lens-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#17231f" floodOpacity="0.2" />
          </filter>
        </defs>

        <rect
          width={size.width}
          height={size.height}
          className="trade-focus-wash"
          mask="url(#trade-focus-mask)"
        />
        <circle cx={center.x} cy={center.y} r={lensRadius} className="lens-ring" filter="url(#lens-shadow)" />
        <g className="lens-callout-line" aria-hidden="true">
          <line x1={center.x} y1={center.y} x2={center.x} y2={annotationTop} className="lens-callout-line-halo" />
          <line x1={center.x} y1={center.y} x2={center.x} y2={annotationTop} className="lens-callout-line-value" />
          <circle cx={center.x} cy={center.y} r={2.7} />
        </g>

        <g className="trade-bars">
          {bars.map((bar, index) => {
            const degrees = startAngle + index * angleStep;
            const angle = degrees * Math.PI / 180;
            const length = lengths[index] ?? targetLengths[index];
            const x1 = center.x + Math.cos(angle) * innerRadius;
            const y1 = center.y + Math.sin(angle) * innerRadius;
            const x2 = center.x + Math.cos(angle) * (innerRadius + length);
            const y2 = center.y + Math.sin(angle) * (innerRadius + length);
            const meta = products.get(bar.hs4);
            const sectionIndex = meta ? Math.max(0, Number(meta.sectionId) - 1) : 20;
            const name = bar.isOther ? "Other exports" : meta?.name ?? bar.hs4;
            const showLabel = !mobile && index < 5;
            const labelX = center.x + Math.cos(angle) * (innerRadius + length + 15);
            const labelY = center.y + Math.sin(angle) * (innerRadius + length + 15);
            return (
              <g
                key={`${bar.hs4}-${index}`}
                className={`trade-bar${bar.isOther ? " trade-bar-other" : ""}`}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="trade-bar-hit"
                  role={bar.isOther ? undefined : "button"}
                  tabIndex={bar.isOther ? undefined : 0}
                  aria-label={`${name}: ${formatCurrency(bar.exports)}, ${formatPercent(bar.exportShare)} of exports`}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  onClick={() => !bar.isOther && onSelectProduct(bar.hs4)}
                  onKeyDown={(event) => {
                    if (!bar.isOther && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onSelectProduct(bar.hs4);
                    }
                  }}
                />
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="trade-bar-track" />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="trade-bar-value"
                  stroke={bar.isOther ? "#8c9691" : SECTION_COLORS[sectionIndex]}
                  opacity={hovered !== null && hovered !== index ? 0.34 : 1}
                />
                {!bar.isOther && (
                  <text x={x1} y={y1} className="trade-bar-code" textAnchor="middle" dy="0.35em">
                    {bar.hs4}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={labelX}
                    y={labelY}
                    className="trade-bar-label"
                    textAnchor={labelX < center.x ? "end" : "start"}
                  >
                    {shortLabel(name, 20)}
                  </text>
                )}
                <title>{`${name}: ${formatCurrency(bar.exports)} (${formatPercent(bar.exportShare)})`}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {country && countryName && (
      <div className="lens-callout" style={{ left: center.x, top: annotationTop }} aria-live="polite">
        <div className="lens-callout-country">
          <span>Country / {year}{provisional ? " / provisional" : ""}</span>
          <h1>{countryName}</h1>
        </div>
        <div className="lens-callout-detail">
          {hoveredBar ? (
            <>
              <small>{hoveredBar.isOther ? "Export group" : `HS4 / ${hoveredBar.hs4}`}</small>
              <strong>{shortLabel(hoveredName ?? "", mobile ? 22 : 30)}</strong>
              <span>{formatCurrency(hoveredBar.exports)} · {formatPercent(hoveredBar.exportShare)}</span>
            </>
          ) : (
            <>
              <small>Merchandise exports</small>
              <strong>{formatCurrency(country.exports)}</strong>
            </>
          )}
        </div>
      </div>
      )}

      {country && (
      <dl className="country-facts">
        {facts.map(([label, value], index) => (
          <div key={label} className={index > 2 ? "secondary-fact" : undefined}>
            <dt>{label}</dt>
            <dd className={label === "Net exports" ? (country.net >= 0 ? "positive" : "negative") : undefined}>
              {shortLabel(value, 26)}
            </dd>
          </div>
        ))}
      </dl>
      )}
    </div>
  );
}
