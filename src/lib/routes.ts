interface Point {
  x: number;
  y: number;
}

export interface RouteCurve {
  path: string;
  reversePath: string;
  points: Point[];
}

const round = (value: number): number => Math.round(value * 10) / 10;

function pathFromPoints(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`)
    .join(" ");
}

function circularOrder(endpoints: Point[], origin: Point): number[] {
  if (endpoints.length < 2) return endpoints.map((_, index) => index);

  const entries = endpoints
    .map((point, index) => ({
      index,
      angle: Math.atan2(point.y - origin.y, point.x - origin.x),
    }))
    .sort((a, b) => a.angle - b.angle);
  let seam = 0;
  let largestGap = -1;

  entries.forEach((entry, index) => {
    const next = entries[(index + 1) % entries.length];
    const nextAngle = index === entries.length - 1 ? next.angle + Math.PI * 2 : next.angle;
    const gap = nextAngle - entry.angle;
    if (gap > largestGap) {
      largestGap = gap;
      seam = (index + 1) % entries.length;
    }
  });

  return [...entries.slice(seam), ...entries.slice(0, seam)].map((entry) => entry.index);
}

function unwrapAngles(endpoints: Point[], origin: Point, order: number[]): number[] {
  const angles = new Array<number>(endpoints.length);
  let previous = Number.NEGATIVE_INFINITY;

  order.forEach((index) => {
    let angle = Math.atan2(endpoints[index].y - origin.y, endpoints[index].x - origin.x);
    while (angle < previous) angle += Math.PI * 2;
    angles[index] = angle;
    previous = angle;
  });
  return angles;
}

function buildFanPoints(
  origin: Point,
  endpoint: Point,
  destinationAngle: number,
  departureAngle: number,
): Point[] {
  const distance = Math.hypot(endpoint.x - origin.x, endpoint.y - origin.y);
  const segments = 32;
  return Array.from({ length: segments + 1 }, (_, index) => {
    if (index === 0) return origin;
    if (index === segments) return endpoint;
    const progress = index / segments;
    const eased = progress * progress * (3 - 2 * progress);
    const angle = departureAngle + (destinationAngle - departureAngle) * eased;
    const radius = distance * progress;
    return {
      x: origin.x + Math.cos(angle) * radius,
      y: origin.y + Math.sin(angle) * radius,
    };
  });
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first * second < 0 && third * fourth < 0;
}

function fanIntersects(curves: Point[][]): boolean {
  for (let first = 0; first < curves.length; first += 1) {
    for (let second = first + 1; second < curves.length; second += 1) {
      // The first few segments intentionally meet at the selected country.
      for (let a = 3; a < curves[first].length; a += 1) {
        for (let b = 3; b < curves[second].length; b += 1) {
          if (segmentsIntersect(
            curves[first][a - 1],
            curves[first][a],
            curves[second][b - 1],
            curves[second][b],
          )) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Build one coordinated route fan. Angular order is preserved across the
 * whole group, and curvature is reduced automatically if projected routes
 * would otherwise cross.
 */
export function makeRouteFan(origin: Point, endpoints: Point[]): RouteCurve[] {
  if (endpoints.length === 0) return [];
  const order = circularOrder(endpoints, origin);
  const destinationAngles = unwrapAngles(endpoints, origin, order);
  const firstAngle = destinationAngles[order[0]];
  const lastAngle = destinationAngles[order[order.length - 1]];
  const centerAngle = (firstAngle + lastAngle) / 2;
  const maximumBends = [0.18, 0.14, 0.1, 0.06, 0.03, 0];
  let points: Point[][] = [];

  for (const maximumBend of maximumBends) {
    points = endpoints.map((endpoint, index) => {
      const destinationAngle = destinationAngles[index];
      const naturalBend = (destinationAngle - centerAngle) * 0.12;
      const departureAngle = destinationAngle
        + Math.max(-maximumBend, Math.min(maximumBend, naturalBend));
      return buildFanPoints(origin, endpoint, destinationAngle, departureAngle);
    });
    if (!fanIntersects(points)) break;
  }

  return points.map((routePoints) => ({
    path: pathFromPoints(routePoints),
    reversePath: pathFromPoints([...routePoints].reverse()),
    points: routePoints,
  }));
}

export function routeLineWidth(share: number): number {
  return Math.min(5.4, 1.15 + Math.sqrt(Math.max(0, share)) * 5.2);
}
