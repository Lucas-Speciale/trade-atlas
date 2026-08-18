import { describe, expect, it } from "vitest";

import { makeRouteCurve, routeLineWidth } from "./routes";

describe("makeRouteCurve", () => {
  it("keeps the requested direction while bending above the endpoints", () => {
    const curve = makeRouteCurve({ x: 100, y: 200 }, { x: 500, y: 240 });
    expect(curve.path).toBe("M 100 200 Q 300 111.6 500 240");
    expect(curve.control.y).toBeLessThan(200);
  });
});

describe("routeLineWidth", () => {
  it("uses a bounded square-root scale", () => {
    expect(routeLineWidth(0)).toBe(1.15);
    expect(routeLineWidth(0.25)).toBeCloseTo(3.75);
    expect(routeLineWidth(1)).toBe(5.4);
  });
});
