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
  moving: boolean;
  onSelectProduct: (hs4: string) => void;
}

interface LensProduct {
  hs4: string;
  name: string;
  exports: number;
  exportShare: number;
  color: string;
  isOther: boolean;
}

interface OtherBreakdownItem extends LensProduct {
  isResidual: boolean;
}

interface CountryFact {
  label: string;
  value: string;
  definition?: string;
  status?: string;
  tone?: "positive" | "negative";
}

function shortLabel(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

function percentDigits(value: number): number {
  return value > 0 && value < 0.01 ? 2 : 1;
}

function useAnimatedPercentages(targets: number[], resetKey: string): number[] {
  const [values, setValues] = useState(() => targets.map(() => 0));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setValues(targets));
      return () => cancelAnimationFrame(frame);
    }

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 560);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValues(targets.map((target) => target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [resetKey, targets]);

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
  moving,
  onSelectProduct,
}: TradeLensProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const closeOtherTimerRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 820 });
  const [hoveredHs4, setHoveredHs4] = useState<string | null>(null);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [settledReadout, setSettledReadout] = useState<{
    country: CountryYear;
    fingerprint: Hs4LensCountry;
    year: number;
  } | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setSize({ width: frame.clientWidth, height: frame.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (closeOtherTimerRef.current !== null) window.clearTimeout(closeOtherTimerRef.current);
  }, []);

  useEffect(() => {
    if (moving || !country || !fingerprint) return;
    const timer = window.setTimeout(() => {
      setSettledReadout({ country, fingerprint, year });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [country, fingerprint, moving, year]);

  const openOtherBreakdown = () => {
    if (closeOtherTimerRef.current !== null) window.clearTimeout(closeOtherTimerRef.current);
    closeOtherTimerRef.current = null;
    setHoveredHs4("other");
    setOtherExpanded(true);
  };

  const closeOtherBreakdown = () => {
    if (closeOtherTimerRef.current !== null) window.clearTimeout(closeOtherTimerRef.current);
    closeOtherTimerRef.current = window.setTimeout(() => {
      setHoveredHs4(null);
      setOtherExpanded(false);
      closeOtherTimerRef.current = null;
    }, 120);
  };

  const mobile = size.width < 700;
  const compact = size.width < 1050;
  const visibleProductCount = mobile ? 4 : compact ? 5 : 6;
  const { lensProducts, otherBreakdown } = useMemo<{
    lensProducts: LensProduct[];
    otherBreakdown: OtherBreakdownItem[];
  }>(() => {
    const readoutCountry = settledReadout?.country;
    const readoutFingerprint = settledReadout?.fingerprint;
    if (!readoutCountry || !readoutFingerprint) return { lensProducts: [], otherBreakdown: [] };
    const enrichProduct = (item: Hs4LensCountry["products"][number]): LensProduct => {
        const meta = products.get(item.hs4);
        const sectionIndex = meta ? Math.max(0, Number(meta.sectionId) - 1) : 20;
        return {
          ...item,
          name: meta?.name ?? item.hs4,
          color: SECTION_COLORS[sectionIndex],
          isOther: false,
        };
    };
    const rankedProducts = [...readoutFingerprint.products].sort((a, b) => b.exports - a.exports);
    const top = rankedProducts.slice(0, visibleProductCount).map(enrichProduct);
    const breakdown: OtherBreakdownItem[] = rankedProducts
      .slice(visibleProductCount)
      .map((item) => ({ ...enrichProduct(item), isResidual: false }));
    const visibleExports = top.reduce((sum, item) => sum + item.exports, 0);
    const otherExports = Math.max(0, readoutCountry.exports - visibleExports);
    if (otherExports > 0) {
      top.push({
        hs4: "other",
        name: "All other products",
        exports: otherExports,
        exportShare: readoutCountry.exports ? otherExports / readoutCountry.exports : 0,
        color: "#7b8782",
        isOther: true,
      });
    }
    const rankedExports = rankedProducts.reduce((sum, item) => sum + item.exports, 0);
    const residualExports = Math.max(0, readoutCountry.exports - rankedExports);
    if (residualExports > 0) {
      breakdown.push({
        hs4: "remainder",
        name: "Remaining products",
        exports: residualExports,
        exportShare: readoutCountry.exports ? residualExports / readoutCountry.exports : 0,
        color: "#7b8782",
        isOther: true,
        isResidual: true,
      });
    }
    return { lensProducts: top, otherBreakdown: breakdown };
  }, [products, settledReadout, visibleProductCount]);

  const readoutReady = Boolean(
    !moving &&
    country &&
    settledReadout &&
    settledReadout.country.iso3 === country.iso3 &&
    settledReadout.year === year,
  );

  const targetPercentages = useMemo(
    () => lensProducts.map((product) => product.exportShare),
    [lensProducts],
  );
  const animationKey = `${settledReadout?.country.iso3 ?? "ocean"}-${settledReadout?.year ?? year}`;
  const animatedPercentages = useAnimatedPercentages(targetPercentages, animationKey);
  const center = { x: size.width / 2, y: size.height * (mobile ? 0.43 : 0.48) };
  const lensRadius = mobile ? 78 : Math.min(118, Math.max(96, size.height * 0.14));
  const outerRadius = mobile ? 158 : compact ? 210 : Math.min(278, Math.max(238, size.height * 0.31));
  const startAngle = mobile ? 202 : 198;
  const endAngle = mobile ? 338 : 342;
  const angleStep = lensProducts.length > 1 ? (endAngle - startAngle) / (lensProducts.length - 1) : 0;
  const annotationTop = center.y + lensRadius + (mobile ? 12 : 13);
  const otherPanelWidth = mobile ? 178 : compact ? 220 : 248;
  const otherAngle = endAngle * Math.PI / 180;
  const otherLabelX = center.x + Math.cos(otherAngle) * outerRadius;
  const otherLabelY = center.y + Math.sin(otherAngle) * outerRadius;
  const otherPanelLeft = Math.min(otherLabelX, size.width - otherPanelWidth - 12);
  const otherPanelTop = otherLabelY + (mobile ? 27 : 30);
  const otherPanelHeight = Math.min(
    otherBreakdown.length * 12 + (mobile ? 27 : 28),
    Math.max(210, size.height - otherPanelTop - 70),
  );
  const hoveredProduct = lensProducts.find((product) => product.hs4 === hoveredHs4) ?? null;
  const leadingName = fingerprint?.leadingHs4 ? products.get(fingerprint.leadingHs4)?.name ?? null : null;
  const countryName = countryMeta ? displayCountryName(countryMeta.iso3, countryMeta.name) : null;
  const netStatus = country ? country.net >= 0 ? "Trade surplus" : "Trade deficit" : "";

  const facts: CountryFact[] = country ? [
    { label: "Exports", value: formatCurrency(country.exports) },
    { label: "Imports", value: formatCurrency(country.imports) },
    {
      label: "Net exports",
      definition: "Exports − imports",
      value: formatCurrency(country.net),
      status: netStatus,
      tone: country.net >= 0 ? "positive" : "negative",
    },
    { label: "Leading product", value: leadingName ?? "—" },
    { label: "Leading destination", value: destinationName ?? "—" },
  ] : [];

  return (
    <div ref={frameRef} className="trade-lens-layer">
      <svg
        className="trade-lens-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-label={countryName ? `${countryName} export basket` : "Country selection lens"}
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

        <g className="trade-readouts" aria-label="Leading HS4 products as a share of total merchandise exports">
          {readoutReady && lensProducts.map((product, index) => {
            const degrees = startAngle + index * angleStep;
            const angle = degrees * Math.PI / 180;
            const stemStart = lensRadius + (mobile ? 13 : 17);
            const stemEnd = outerRadius - (mobile ? 19 : 25);
            const x1 = center.x + Math.cos(angle) * stemStart;
            const y1 = center.y + Math.sin(angle) * stemStart;
            const x2 = center.x + Math.cos(angle) * stemEnd;
            const y2 = center.y + Math.sin(angle) * stemEnd;
            const labelX = center.x + Math.cos(angle) * outerRadius;
            const labelY = center.y + Math.sin(angle) * outerRadius;
            const horizontal = Math.cos(angle);
            const textAnchor = horizontal < -0.22 ? "end" : horizontal > 0.22 ? "start" : "middle";
            const name = shortLabel(product.name, mobile ? 17 : 23);
            const animatedShare = animatedPercentages[index] ?? product.exportShare;
            const percentage = formatPercent(animatedShare, percentDigits(product.exportShare));

            return (
              <g
                key={`${animationKey}-${product.hs4}`}
                className={`trade-readout${product.isOther ? " trade-readout-other" : ""}${hoveredHs4 === product.hs4 ? " is-active" : ""}${hoveredHs4 && hoveredHs4 !== product.hs4 ? " is-muted" : ""}`}
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="trade-readout-stem-halo" />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  pathLength={1}
                  className="trade-readout-stem"
                  stroke={product.color}
                />
                <circle cx={x1} cy={y1} r={mobile ? 3 : 4} fill={product.color} className="trade-readout-origin" />
                <g
                  className="trade-readout-label"
                  role="button"
                  tabIndex={0}
                  aria-expanded={product.isOther ? otherExpanded : undefined}
                  aria-haspopup={product.isOther ? "true" : undefined}
                  aria-label={`${product.name}: ${formatCurrency(product.exports)}, ${formatPercent(product.exportShare, percentDigits(product.exportShare))} of total exports`}
                  onPointerEnter={() => product.isOther ? openOtherBreakdown() : setHoveredHs4(product.hs4)}
                  onPointerLeave={() => product.isOther ? closeOtherBreakdown() : setHoveredHs4(null)}
                  onFocus={() => product.isOther ? openOtherBreakdown() : setHoveredHs4(product.hs4)}
                  onBlur={() => product.isOther ? closeOtherBreakdown() : setHoveredHs4(null)}
                  onClick={() => product.isOther ? openOtherBreakdown() : onSelectProduct(product.hs4)}
                  onKeyDown={(event) => {
                    if (!product.isOther && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onSelectProduct(product.hs4);
                    }
                  }}
                >
                  <rect
                    x={textAnchor === "end" ? labelX - (mobile ? 102 : 132) : textAnchor === "start" ? labelX : labelX - (mobile ? 51 : 66)}
                    y={labelY - (mobile ? 19 : 23)}
                    width={mobile ? 102 : 132}
                    height={mobile ? 56 : 65}
                    className="trade-readout-hit"
                  />
                  <text x={labelX} y={labelY} textAnchor={textAnchor} className="trade-readout-percent">
                    {percentage}
                  </text>
                  <text x={labelX} y={labelY + (mobile ? 13 : 15)} textAnchor={textAnchor} className="trade-readout-name">
                    {product.isOther ? name : `${product.hs4} · ${name}`}
                  </text>
                  <text x={labelX} y={labelY + (mobile ? 25 : 29)} textAnchor={textAnchor} className="trade-readout-value">
                    {formatCurrency(product.exports)} exports
                  </text>
                </g>
                <title>{`${product.name}: ${formatCurrency(product.exports)} (${formatPercent(product.exportShare, percentDigits(product.exportShare))} of total exports)`}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {readoutReady && country && otherBreakdown.length > 0 && (
        <section
          className={`other-breakdown${otherExpanded ? " is-open" : ""}`}
          style={{
            left: otherPanelLeft,
            top: otherPanelTop,
            width: otherPanelWidth,
            maxHeight: otherExpanded ? otherPanelHeight : 0,
          }}
          aria-label="All other products breakdown"
          aria-hidden={!otherExpanded}
          onPointerEnter={openOtherBreakdown}
          onPointerLeave={closeOtherBreakdown}
        >
          <header>
            <strong>Next {otherBreakdown.filter((item) => !item.isResidual).length} products</strong>
            <span>Share of total exports</span>
          </header>
          <ol>
            {otherBreakdown.map((item, index) => (
              <li
                key={item.hs4}
                className={item.isResidual ? "is-residual" : undefined}
                style={{
                  transitionDelay: otherExpanded
                    ? `${index * 18}ms`
                    : `${(otherBreakdown.length - index) * 7}ms`,
                }}
              >
                <span className="other-breakdown-rank">{item.isResidual ? "…" : index + visibleProductCount + 1}</span>
                <span className="other-breakdown-name">
                  {item.isResidual ? item.name : `${item.hs4} · ${shortLabel(item.name, mobile ? 19 : 27)}`}
                </span>
                <strong>{formatPercent(item.exportShare, percentDigits(item.exportShare))}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      {country && countryName && (
        <div className="lens-callout" style={{ left: center.x, top: annotationTop }} aria-live="polite">
          <div className="lens-callout-country">
            <span>Country / {year}{provisional ? " / provisional" : ""}</span>
            <h1>{countryName}</h1>
          </div>
          <div className="lens-callout-detail">
            {hoveredProduct ? (
              <>
                <small>{hoveredProduct.isOther ? "Export basket remainder" : `HS4 ${hoveredProduct.hs4} / share of exports`}</small>
                <strong>{shortLabel(hoveredProduct.name, mobile ? 24 : 36)}</strong>
                <span>{formatCurrency(hoveredProduct.exports)} · {formatPercent(hoveredProduct.exportShare, percentDigits(hoveredProduct.exportShare))} of total exports</span>
              </>
            ) : (
              <>
                <small>Total merchandise exports</small>
                <strong>{formatCurrency(country.exports)}</strong>
                <span>Product % = share of this country&apos;s total exports.</span>
              </>
            )}
          </div>
        </div>
      )}

      {country && (
        <dl className="country-facts">
          {facts.map((fact, index) => (
            <div key={fact.label} className={index > 2 ? "secondary-fact" : undefined}>
              <dt>
                {fact.label}
                {fact.definition && <small>{fact.definition}</small>}
              </dt>
              <dd className={fact.tone}>
                {shortLabel(fact.value, 26)}
                {fact.status && <small className="fact-status">{fact.status}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
