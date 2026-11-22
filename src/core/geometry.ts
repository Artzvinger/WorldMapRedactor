import type { Vec2 } from './types';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

/** Расстояние от точки до отрезка. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    const intersects =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y || Number.EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Площадь полигона со знаком: положительная и отрицательная ориентация различаются. */
export function polygonArea(points: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Vec2[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function expandBounds(b: Bounds, pad: number): Bounds {
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

/* ------------------------------------------------- сглаживание (Catmull-Rom) */

function catmullPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return {
    x: f(p0.x, p1.x, p2.x, p3.x),
    y: f(p0.y, p1.y, p2.y, p3.y),
  };
}

/**
 * Сэмплирует сглаженную линию по точкам. Возвращает ломаную с густотой seg на пролёт.
 * Для 1-2 точек возвращает исходные точки без изменений.
 */
export function sampleSmooth(pts: Vec2[], closed = false, seg = 12): Vec2[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ ...p }));
  const at = (i: number): Vec2 => {
    if (closed) return pts[(i + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const out: Vec2[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < seg; s++) {
      out.push(catmullPoint(p0, p1, p2, p3, s / seg));
    }
  }
  if (closed) out.push({ ...out[0] });
  else out.push({ ...pts[n - 1] });
  return out;
}

export function polylineLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

export interface Tick {
  x: number;
  y: number;
  /** нормаль (единичный перпендикуляр) */
  nx: number;
  ny: number;
}

/** Расставляет насечки вдоль ломаной через равные интервалы (для шпал ж/д). */
export function ticksAlong(pts: Vec2[], spacing: number): Tick[] {
  const out: Tick[] = [];
  if (pts.length < 2 || spacing <= 0) return out;
  let walked = 0;
  let next = spacing * 0.5;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    if (segLen < 1e-6) continue;
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;
    while (next <= walked + segLen) {
      const d = next - walked;
      out.push({ x: a.x + dx * d, y: a.y + dy * d, nx: -dy, ny: dx });
      next += spacing;
    }
    walked += segLen;
  }
  return out;
}

/** Точка на ломаной по доле длины 0..1 (для подписи реки вдоль русла). */export function pointAtFraction(pts: Vec2[], frac: number): { x: number; y: number; angle: number } | null {
  const total = polylineLength(pts);
  if (total <= 0) return null;
  const target = clamp(frac, 0, 1) * total;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = dist(a, b);
    if (walked + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - walked) / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    walked += segLen;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

/** Пересечение двух прямоугольников в мировых координатах. */
export function rectFromPoints(a: Vec2, b: Vec2): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

/**
 * Упрощение ломаной (Дуглас—Пекер). Импортированные карты приносят десятки
 * тысяч точек на контур — без этого холст задыхается.
 */
export function simplifyPolyline(points: Vec2[], tolerance: number): Vec2[] {
  const n = points.length;
  if (n <= 2 || tolerance <= 0) return points.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    const a = points[first];
    const b = points[last];
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distToSegment(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}
