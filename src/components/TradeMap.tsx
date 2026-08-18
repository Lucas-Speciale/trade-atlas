"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";

import { displayCountryName } from "@/lib/countryNames";
import { formatCurrency, formatMetric, formatPercent } from "@/lib/format";
import { makeRouteFan, routeLineWidth } from "@/lib/routes";
import type {
  ExplorerMode,
  OverlayMetric,
  TradeGeometry,
  TradeRoutePartner,
  TradeRouteView,
} from "@/types/trade";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// Next's client bundle does not preserve MapLibre's module URL, so the worker needs an explicit entry point.
const MAPLIBRE_WORKER_URL = "https://unpkg.com/maplibre-gl@6.4.0/dist/maplibre-gl-worker.mjs";
const SOURCE_ID = "trade-countries";
const FILL_LAYER = "trade-country-fill";
const ACTIVE_FILL_LAYER = "trade-country-active-fill";
const ACTIVE_LINE_LAYER = "trade-country-active-line";
const HOVER_LINE_LAYER = "trade-country-hover-line";

interface TradeMapProps {
  geometry: TradeGeometry;
  mode: ExplorerMode;
  activeIso3: string;
  overlayMetric: OverlayMetric;
  overlayValues: Map<string, { color: string; value: number }>;
  routeFlow: TradeRouteView | null;
  routeLoading: boolean;
  routeError: string | null;
  focusRequest: { iso3: string; center: [number, number]; zoom?: number; nonce: number } | null;
  onClearRoute: () => void;
  onCountryFocus: (iso3: string | null) => void;
}

interface TooltipState {
  x: number;
  y: number;
  iso3: string;
  name: string;
}

interface HitPolygon {
  rings: number[][][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  wrapsDateline: boolean;
}

interface HitCountry {
  iso3: string;
  polygons: HitPolygon[];
}

interface ProjectedRoute {
  partner: TradeRoutePartner;
  path: string;
  end: { x: number; y: number };
}

interface RouteProjection {
  width: number;
  height: number;
  origin: { x: number; y: number };
  routes: ProjectedRoute[];
}

function preparePolygon(rings: number[][][]): HitPolygon {
  const longitudes = rings[0].map((point) => point[0]);
  const wrapsDateline = Math.max(...longitudes) - Math.min(...longitudes) > 180;
  const preparedRings = rings.map((ring) => ring.map(([longitude, latitude]) => [
    wrapsDateline && longitude < 0 ? longitude + 360 : longitude,
    latitude,
  ]));
  const outer = preparedRings[0];
  return {
    rings: preparedRings,
    minX: Math.min(...outer.map((point) => point[0])),
    minY: Math.min(...outer.map((point) => point[1])),
    maxX: Math.max(...outer.map((point) => point[0])),
    maxY: Math.max(...outer.map((point) => point[1])),
    wrapsDateline,
  };
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonContains(polygon: HitPolygon, longitude: number, latitude: number): boolean {
  const x = polygon.wrapsDateline && longitude < 0 ? longitude + 360 : longitude;
  if (x < polygon.minX || x > polygon.maxX || latitude < polygon.minY || latitude > polygon.maxY) return false;
  if (!pointInRing(x, latitude, polygon.rings[0])) return false;
  return !polygon.rings.slice(1).some((ring) => pointInRing(x, latitude, ring));
}

function prepareHitCountries(geometry: TradeGeometry): HitCountry[] {
  return geometry.features.flatMap((feature) => {
    const iso3 = feature.properties.tradeIso3;
    if (!iso3) return [];
    if (feature.geometry.type === "Polygon") {
      return [{ iso3, polygons: [preparePolygon(feature.geometry.coordinates as number[][][])] }];
    }
    if (feature.geometry.type === "MultiPolygon") {
      return [{
        iso3,
        polygons: (feature.geometry.coordinates as number[][][][]).map(preparePolygon),
      }];
    }
    return [];
  });
}

function featureIso3(feature: MapGeoJSONFeature | undefined): string | null {
  const value = feature?.properties?.tradeIso3;
  return typeof value === "string" && value ? value : null;
}

function fillExpression(
  mode: ExplorerMode,
  values: Map<string, { color: string; value: number }>,
): unknown[] | string {
  if (mode !== "overlay") return "rgba(246, 241, 229, 0.08)";
  if (values.size === 0) return "rgba(224, 222, 213, 0.72)";
  const expression: unknown[] = ["match", ["get", "tradeIso3"]];
  values.forEach(({ color }, iso3) => expression.push(iso3, color));
  expression.push("rgba(224, 222, 213, 0.72)");
  return expression;
}

export function TradeMap({
  geometry,
  mode,
  activeIso3,
  overlayMetric,
  overlayValues,
  routeFlow,
  routeLoading,
  routeError,
  focusRequest,
  onClearRoute,
  onCountryFocus,
}: TradeMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const selectionFrameRef = useRef<number | null>(null);
  const suppressLensSelectionRef = useRef(false);
  const onCountryFocusRef = useRef(onCountryFocus);
  const modeRef = useRef(mode);
  const activeIso3Ref = useRef(activeIso3);
  const focusRequestRef = useRef(focusRequest);
  const overlayValuesRef = useRef(overlayValues);
  const routeFlowRef = useRef(routeFlow);
  const projectRoutesRef = useRef<(() => void) | null>(null);
  const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [routeProjection, setRouteProjection] = useState<RouteProjection | null>(null);
  const hitCountries = useMemo(() => prepareHitCountries(geometry), [geometry]);

  useEffect(() => {
    onCountryFocusRef.current = onCountryFocus;
  }, [onCountryFocus]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === "country") {
      mapRef.current?.getCanvas().style.setProperty("cursor", "grab");
      const frame = requestAnimationFrame(() => {
        setHoveredIso3(null);
        setTooltip(null);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [mode]);

  useEffect(() => {
    activeIso3Ref.current = activeIso3;
  }, [activeIso3]);

  useEffect(() => {
    focusRequestRef.current = focusRequest;
  }, [focusRequest]);

  useEffect(() => {
    overlayValuesRef.current = overlayValues;
  }, [overlayValues]);

  useEffect(() => {
    routeFlowRef.current = routeFlow;
    const frame = requestAnimationFrame(() => projectRoutesRef.current?.());
    return () => cancelAnimationFrame(frame);
  }, [routeFlow]);

  useEffect(() => {
    if (!frameRef.current || mapRef.current) return;

    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
    const map = new maplibregl.Map({
      container: frameRef.current,
      style: MAP_STYLE,
      center: [5, 22],
      zoom: 1.45,
      minZoom: 1,
      maxZoom: 5,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    const projectRoutes = () => {
      const flow = routeFlowRef.current;
      const frame = frameRef.current;
      if (!flow || !frame) {
        setRouteProjection(null);
        return;
      }
      const origin = map.project(flow.originCenter);
      const projectedPartners = flow.partners.map((partner) => {
        const partnerCandidates = [-360, 0, 360].map((offset) =>
          map.project([partner.center[0] + offset, partner.center[1]]),
        );
        const endpoint = partnerCandidates.reduce((nearest, candidate) =>
          Math.abs(candidate.x - origin.x) < Math.abs(nearest.x - origin.x) ? candidate : nearest,
        );
        return { partner, endpoint };
      });
      const curves = makeRouteFan(origin, projectedPartners.map(({ endpoint }) => endpoint));
      const routes = projectedPartners.map(({ partner, endpoint }, index) => {
        return {
          partner,
          path: flow.direction === "exports" ? curves[index].path : curves[index].reversePath,
          end: endpoint,
        };
      });
      setRouteProjection({
        width: frame.clientWidth,
        height: frame.clientHeight,
        origin,
        routes,
      });
    };
    projectRoutesRef.current = projectRoutes;

    const selectAtLens = () => {
      if (
        !readyRef.current ||
        modeRef.current !== "country" ||
        suppressLensSelectionRef.current ||
        !frameRef.current
      ) return;
      const point = [frameRef.current.clientWidth / 2, frameRef.current.clientHeight * 0.48] as [number, number];
      const coordinate = map.unproject(point);
      const country = hitCountries.find((candidate) =>
        candidate.polygons.some((polygon) => polygonContains(polygon, coordinate.lng, coordinate.lat)),
      );
      onCountryFocusRef.current(country?.iso3 ?? null);
    };

    const requestLensSelection = () => {
      if (selectionFrameRef.current !== null) return;
      selectionFrameRef.current = requestAnimationFrame(() => {
        selectionFrameRef.current = null;
        selectAtLens();
      });
    };

    const handleHover = (event: maplibregl.MapLayerMouseEvent) => {
      if (modeRef.current !== "overlay") return;
      const feature = event.features?.[0];
      const iso3 = featureIso3(feature);
      if (!iso3 || !frameRef.current) return;
      map.getCanvas().style.cursor = "pointer";
      setHoveredIso3(iso3);
      setTooltip({
        x: event.point.x,
        y: event.point.y,
        iso3,
        name: displayCountryName(iso3, String(feature?.properties?.name ?? iso3)),
      });
    };

    const clearHover = () => {
      map.getCanvas().style.cursor = "grab";
      setHoveredIso3(null);
      setTooltip(null);
    };

    const handleClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (modeRef.current !== "overlay") return;
      const iso3 = featureIso3(event.features?.[0]);
      if (!iso3) return;
      onCountryFocusRef.current(iso3);
    };

    const setupTradeLayers = () => {
      if (map.getSource(SOURCE_ID)) return;
      const firstSymbol = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      const boundaryLayer = map.getLayer("boundary_2") ? "boundary_2" : firstSymbol;
      map.addSource(SOURCE_ID, { type: "geojson", data: geometry });
      map.addLayer({
        id: FILL_LAYER,
        source: SOURCE_ID,
        type: "fill",
        paint: {
          "fill-color": fillExpression(modeRef.current, overlayValuesRef.current) as never,
          "fill-opacity": modeRef.current === "overlay" ? 0.44 : 1,
        },
      }, boundaryLayer);
      map.addLayer({
        id: ACTIVE_FILL_LAYER,
        source: SOURCE_ID,
        type: "fill",
        filter: ["==", ["get", "tradeIso3"], activeIso3Ref.current],
        paint: { "fill-color": "#dd6f47", "fill-opacity": modeRef.current === "country" ? 0.36 : 0 },
      }, boundaryLayer);
      map.addLayer({
        id: ACTIVE_LINE_LAYER,
        source: SOURCE_ID,
        type: "line",
        filter: ["==", ["get", "tradeIso3"], activeIso3Ref.current],
        paint: {
          "line-color": "#273530",
          "line-width": modeRef.current === "country" ? 1.35 : 0.9,
          "line-opacity": modeRef.current === "country" ? 0.82 : 0.58,
        },
      });
      map.addLayer({
        id: HOVER_LINE_LAYER,
        source: SOURCE_ID,
        type: "line",
        filter: ["==", ["get", "tradeIso3"], ""],
        paint: { "line-color": "#273530", "line-width": 0.9, "line-opacity": 0.68 },
      });
      readyRef.current = true;
      map.on("move", requestLensSelection);
      map.on("move", projectRoutes);
      map.on("moveend", selectAtLens);
      map.on("resize", projectRoutes);
      map.on("mousemove", FILL_LAYER, handleHover);
      map.on("mouseleave", FILL_LAYER, clearHover);
      map.on("click", FILL_LAYER, handleClick);
      requestLensSelection();
      projectRoutes();
      const pendingFocus = focusRequestRef.current;
      if (pendingFocus) {
        map.jumpTo({ center: pendingFocus.center, zoom: pendingFocus.zoom ?? Math.max(map.getZoom(), 2.2) });
      }
    };

    map.on("style.load", setupTradeLayers);
    if (map.isStyleLoaded()) setupTradeLayers();

    map.on("dragstart", () => {
      suppressLensSelectionRef.current = false;
      setTooltip(null);
    });

    return () => {
      if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
      readyRef.current = false;
      projectRoutesRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [geometry, hitCountries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setPaintProperty(FILL_LAYER, "fill-color", fillExpression(mode, overlayValues) as never);
    map.setPaintProperty(FILL_LAYER, "fill-opacity", mode === "overlay" ? 0.44 : 1);
    map.setPaintProperty(ACTIVE_FILL_LAYER, "fill-opacity", mode === "country" ? 0.36 : 0);
    map.setPaintProperty(ACTIVE_LINE_LAYER, "line-width", mode === "country" ? 1.35 : 0.9);
    map.setPaintProperty(ACTIVE_LINE_LAYER, "line-opacity", mode === "country" ? 0.82 : 0.58);
  }, [mode, overlayValues]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter(ACTIVE_FILL_LAYER, ["==", ["get", "tradeIso3"], activeIso3]);
    map.setFilter(ACTIVE_LINE_LAYER, ["==", ["get", "tradeIso3"], activeIso3]);
  }, [activeIso3]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter(HOVER_LINE_LAYER, ["==", ["get", "tradeIso3"], hoveredIso3 ?? ""]);
  }, [hoveredIso3]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !focusRequest) return;
    suppressLensSelectionRef.current = true;
    map.jumpTo({
      center: focusRequest.center,
      zoom: focusRequest.zoom ?? Math.max(map.getZoom(), 2.2),
    });
    suppressLensSelectionRef.current = false;
  }, [focusRequest]);

  const tooltipValue = tooltip ? overlayValues.get(tooltip.iso3)?.value : undefined;
  const routePanelWidth = routeProjection
    ? Math.min(routeProjection.width <= 700 ? 300 : 320, routeProjection.width - 20)
    : 320;
  const routePanelDefaultLeft = routeProjection
    ? routeProjection.width - routePanelWidth - (routeProjection.width <= 700 ? 10 : 22)
    : 0;
  const routePanelLeft = routeProjection
    ? routeProjection.width > 700 && routeProjection.origin.x > routePanelDefaultLeft - 24
      ? Math.max(360, routeProjection.origin.x - routePanelWidth - 86)
      : routePanelDefaultLeft
    : 0;
  const routePanelTop = routeProjection
    ? routeProjection.width <= 700
      ? Math.max(150, routeProjection.height - 405)
      : Math.min(230, Math.max(130, routeProjection.height - 510))
    : 0;
  const routeCoverage = Math.min(
    1,
    routeFlow?.partners.reduce((sum, partner) => sum + partner.share, 0) ?? 0,
  );

  return (
    <div ref={frameRef} className="map-canvas" aria-label="Interactive world trade map">
      {routeFlow && routeProjection && (
        <svg
          className={`trade-route-layer is-${routeFlow.direction}`}
          width={routeProjection.width}
          height={routeProjection.height}
          aria-hidden="true"
        >
          <g key={routeFlow.key} className="trade-route-paths">
            {routeProjection.routes.map((route, index) => (
              <g key={route.partner.iso3}>
                <path
                  className="trade-route-shadow"
                  d={route.path}
                  pathLength={1}
                  style={{
                    animationDelay: `${index * 55}ms`,
                    strokeWidth: routeLineWidth(route.partner.share) + 4,
                  }}
                />
                <path
                  className="trade-route-line"
                  d={route.path}
                  pathLength={1}
                  style={{
                    animationDelay: `${index * 55}ms`,
                    strokeWidth: routeLineWidth(route.partner.share),
                  }}
                />
                <circle className="trade-route-particle" r={2.2}>
                  <animateMotion
                    path={route.path}
                    begin={`${0.75 + index * 0.08}s`}
                    dur={`${2.1 + index * 0.07}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  className="trade-route-endpoint"
                  cx={route.end.x}
                  cy={route.end.y}
                  r={2.4 + Math.sqrt(route.partner.share) * 4}
                  style={{ animationDelay: `${500 + index * 55}ms` }}
                />
              </g>
            ))}
            <circle
              className="trade-route-origin-halo"
              cx={routeProjection.origin.x}
              cy={routeProjection.origin.y}
              r={10}
            />
            <circle
              className="trade-route-origin"
              cx={routeProjection.origin.x}
              cy={routeProjection.origin.y}
              r={4.5}
            />
          </g>
        </svg>
      )}

      {routeFlow && routeProjection && (
        <aside
          key={routeFlow.key}
          className={`trade-route-panel is-${routeFlow.direction}`}
          style={{ left: routePanelLeft, top: routePanelTop, width: routePanelWidth }}
          aria-live="polite"
        >
          <button className="trade-route-close" type="button" onClick={onClearRoute} aria-label="Close trade routes">×</button>
          <header>
            <span>{routeFlow.originName} · {routeFlow.year}</span>
            <strong>{routeFlow.productName}</strong>
            <em className={routeFlow.net >= 0 ? "positive" : "negative"}>
              {routeFlow.net >= 0 ? "Net exporter" : "Net importer"} · {formatCurrency(Math.abs(routeFlow.net))}
            </em>
          </header>
          <div className="trade-route-summary">
            <span>{routeFlow.direction === "exports" ? "Top export destinations" : "Top import sources"}</span>
            <strong>{formatCurrency(routeFlow.total)}</strong>
          </div>
          {routeFlow.partners.length > 0 ? (
            <>
              <ol>
                {routeFlow.partners.map((partner, index) => (
                  <li key={partner.iso3} style={{ animationDelay: `${260 + index * 48}ms` }}>
                    <small>{index + 1}</small>
                    <span>{partner.name}</span>
                    <strong>{formatPercent(partner.share)}</strong>
                    <em>{formatCurrency(partner.value)}</em>
                  </li>
                ))}
              </ol>
              <footer>
                Top {routeFlow.partners.length} account for {formatPercent(routeCoverage)} of {routeFlow.direction}.
              </footer>
            </>
          ) : (
            <p className="trade-route-empty">
              Route detail is shown when this product flow exceeds {formatCurrency(routeFlow.minimumTradeValue)}.
            </p>
          )}
        </aside>
      )}

      {!routeFlow && routeLoading && (
        <div className="trade-route-status"><i />Tracing product routes…</div>
      )}
      {!routeFlow && routeError && (
        <div className="trade-route-status is-error">
          Route data could not be loaded.
          <button type="button" onClick={onClearRoute}>Dismiss</button>
        </div>
      )}

      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <strong>{tooltip.name}</strong>
          {mode === "overlay" && tooltipValue !== undefined ? (
            <span>{formatMetric(overlayMetric, tooltipValue)}</span>
          ) : (
            <span>Click to center</span>
          )}
        </div>
      )}
    </div>
  );
}
