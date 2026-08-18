interface Point {
  x: number;
  y: number;
}

export interface RouteCurve {
  path: string;
  control: Point;
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** Build a restrained, north-bending flight path between two projected map points. */
export function makeRouteCurve(start: Point, end: Point): RouteCurve {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const bend = Math.min(150, Math.max(28, distance * 0.22));
  const control = {
    x: (start.x + end.x) / 2,
    y: Math.min(start.y, end.y) - bend,
  };
  return {
    control,
    path: `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`,
  };
}

export function routeLineWidth(share: number): number {
  return Math.min(5.4, 1.15 + Math.sqrt(Math.max(0, share)) * 5.2);
}
