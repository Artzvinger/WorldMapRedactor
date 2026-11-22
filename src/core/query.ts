import {
  LAYER_ORDER,
  layerOf,
  type CityFeature,
  type Feature,
  type MapDoc,
  type Vec2,
} from './types';
import {
  boundsOf,
  dist,
  distToSegment,
  pointInPolygon,
  type Bounds,
} from './geometry';

export const CITY_BASE_RADIUS = 10;

/** Радиус значка города в мировых единицах (с учётом общего множителя карты). */
export function cityRadius(city: CityFeature, iconScale = 1): number {
  return CITY_BASE_RADIUS * city.size * iconScale;
}

export function nearestCity(doc: MapDoc, p: Vec2, maxDist: number): CityFeature | null {
  let best: CityFeature | null = null;
  let bestD = maxDist;
  for (const f of doc.features) {
    if (f.kind !== 'city') continue;
    const d = dist(f.pos, p);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

export function labelHalfWidth(text: string, size: number): number {
  return Math.max(1, text.length) * size * 0.27;
}

export type LabelAlign = 'left' | 'center' | 'right';
export type LabelBaseline = 'top' | 'middle' | 'bottom';

export interface LabelAnchor {
  x: number;
  y: number;
  align: LabelAlign;
  baseline: LabelBaseline;
}

/** Где рисовать подпись города при выбранной стороне. */
export function cityLabelAnchor(
  city: CityFeature,
  side = city.labelSide ?? 'bottom',
  scale = 1,
  iconScale = 1,
): LabelAnchor {
  const r = cityRadius(city, iconScale);
  const gap = r + city.labelSize * scale * 0.3;
  switch (side) {
    case 'top':
      return { x: city.pos.x, y: city.pos.y - gap, align: 'center', baseline: 'bottom' };
    case 'left':
      return { x: city.pos.x - gap, y: city.pos.y, align: 'right', baseline: 'middle' };
    case 'right':
      return { x: city.pos.x + gap, y: city.pos.y, align: 'left', baseline: 'middle' };
    default:
      return { x: city.pos.x, y: city.pos.y + gap, align: 'center', baseline: 'top' };
  }
}

/** Прямоугольник, который займёт подпись города (для проверки пересечений). */
export function cityLabelBox(
  city: CityFeature,
  side = city.labelSide ?? 'bottom',
  scale = 1,
  iconScale = 1,
): Bounds {
  const anchor = cityLabelAnchor(city, side, scale, iconScale);
  const halfW = labelHalfWidth(city.name, city.labelSize * scale);
  const h = city.labelSize * scale * 1.1;
  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;
  if (anchor.align === 'center') {
    minX = anchor.x - halfW;
    maxX = anchor.x + halfW;
  } else if (anchor.align === 'left') {
    minX = anchor.x;
    maxX = anchor.x + halfW * 2;
  } else {
    minX = anchor.x - halfW * 2;
    maxX = anchor.x;
  }
  if (anchor.baseline === 'top') {
    minY = anchor.y;
    maxY = anchor.y + h;
  } else if (anchor.baseline === 'bottom') {
    minY = anchor.y - h;
    maxY = anchor.y;
  } else {
    minY = anchor.y - h / 2;
    maxY = anchor.y + h / 2;
  }
  return { minX, minY, maxX, maxY };
}

const boundsCache = new WeakMap<Vec2[], Bounds>();

function cachedBounds(points: Vec2[]): Bounds {
  const hit = boundsCache.get(points);
  if (hit) return hit;
  const computed = boundsOf(points);
  boundsCache.set(points, computed);
  return computed;
}

export function featureBounds(f: Feature): Bounds {
  switch (f.kind) {
    case 'city': {
      const r = cityRadius(f) + f.labelSize * 2;
      return { minX: f.pos.x - r, minY: f.pos.y - r, maxX: f.pos.x + r, maxY: f.pos.y + r };
    }
    case 'path': {
      const b = cachedBounds(f.points);
      const pad = f.width + 4;
      return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
    }
    case 'region': {
      const b = cachedBounds(f.points);
      const pad = f.strokeWidth + 4;
      return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
    }
    case 'label': {
      const hw = labelHalfWidth(f.text, f.size) + f.size;
      const hh = f.size * 1.2;
      return { minX: f.pos.x - hw, minY: f.pos.y - hh, maxX: f.pos.x + hw, maxY: f.pos.y + hh };
    }
    case 'land':
      return cachedBounds(f.points);
  }
}

function hitCity(f: CityFeature, p: Vec2, tol: number, iconScale = 1): boolean {
  return dist(f.pos, p) <= cityRadius(f, iconScale) + tol;
}

function hitPath(f: Extract<Feature, { kind: 'path' }>, p: Vec2, tol: number): boolean {
  const reach = f.width / 2 + tol;
  for (let i = 1; i < f.points.length; i++) {
    if (distToSegment(p, f.points[i - 1], f.points[i]) <= reach) return true;
  }
  return false;
}

/** Поиск верхнего объекта под точкой (в мировых координатах). tol — допуск в мировых единицах. */
export function hitTest(doc: MapDoc, p: Vec2, tol: number): Feature | null {
  const iconScale = doc.style.iconScale ?? 1;
  for (let li = LAYER_ORDER.length - 1; li >= 0; li--) {
    const layerId = LAYER_ORDER[li];
    const layer = doc.layers[layerId];
    if (!layer.visible || layer.locked) continue;
    for (let i = doc.features.length - 1; i >= 0; i--) {
      const f = doc.features[i];
      if (layerOf(f) !== layerId) continue;
      if (f.kind === 'city') {
        if (hitCity(f, p, tol, iconScale)) return f;
      } else if (f.kind === 'path') {
        if (hitPath(f, p, tol)) return f;
      } else if (f.kind === 'region') {
        if (pointInPolygon(p, f.points)) return f;
      } else if (f.kind === 'label') {
        const b = featureBounds(f);
        if (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY) return f;
      }
      // land не выделяется: это импортированная подложка
    }
  }
  return null;
}

/** Индекс вершины линии под курсором (для правки формы). */
export function hitVertex(f: Feature, p: Vec2, tol: number): number | null {
  if (f.kind !== 'path' && f.kind !== 'region') return null;
  const pts = f.points;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (dist(pts[i], p) <= tol) return i;
  }
  return null;
}

export function featuresInLayer(doc: MapDoc, layerId: string): Feature[] {
  return doc.features.filter((f) => layerOf(f) === layerId);
}
