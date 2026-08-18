import { describe, expect, it } from "vitest";

import { makeRouteFan, routeLineWidth } from "./routes";

function orientation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersects(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  return orientation(a, b, c) * orientation(a, b, d) < 0
    && orientation(c, d, a) * orientation(c, d, b) < 0;
}

describe("makeRouteFan", () => {
  it("creates directional paths that all share one origin", () => {
    const routes = makeRouteFan(
      { x: 200, y: 200 },
      [{ x: 40, y: 80 }, { x: 420, y: 120 }, { x: 360, y: 390 }],
    );
    expect(routes).toHaveLength(3);
    expect(routes.every((route) => route.path.startsWith("M 200 200"))).toBe(true);
    expect(routes[0].reversePath.startsWith("M 40 80")).toBe(true);
  });

  it("avoids intersections away from the shared origin", () => {
    const routes = makeRouteFan(
      { x: 300, y: 240 },
      [
        { x: 40, y: 80 }, { x: 180, y: 40 }, { x: 540, y: 70 },
        { x: 590, y: 260 }, { x: 470, y: 450 }, { x: 90, y: 410 },
      ],
    );

    routes.forEach((first, firstIndex) => {
      routes.slice(firstIndex + 1).forEach((second) => {
        for (let a = 3; a < first.points.length; a += 1) {
          for (let b = 3; b < second.points.length; b += 1) {
            expect(intersects(
              first.points[a - 1], first.points[a],
              second.points[b - 1], second.points[b],
            )).toBe(false);
          }
        }
      });
    });
  });
});

describe("routeLineWidth", () => {
  it("uses a bounded square-root scale", () => {
    expect(routeLineWidth(0)).toBe(1.15);
    expect(routeLineWidth(0.25)).toBeCloseTo(3.75);
    expect(routeLineWidth(1)).toBe(5.4);
  });
});
