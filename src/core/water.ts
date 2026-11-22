import { boundsOf, pointInPolygon, polygonArea, type Bounds } from './geometry';
import { PATH_DEFAULT_COLORS, PATH_DEFAULT_WIDTH, type MapDoc, type PathFeature, type Vec2 } from './types';

interface LandArea {
  points: Vec2[];
  hole: boolean;
  bbox: Bounds;
  area: number;
}

const areaCache = new WeakMap<Vec2[], LandArea>();

function prepareLand(doc: MapDoc): LandArea[] {
  const out: LandArea[] = [];
  for (const f of doc.features) {
    if (f.kind !== 'land' || f.points.length < 3) continue;
    let prepared = areaCache.get(f.points);
    if (!prepared) {
      prepared = {
        points: f.points,
        hole: Boolean(f.hole),
        bbox: boundsOf(f.points),
        area: Math.abs(polygonArea(f.points)),
      };
      areaCache.set(f.points, prepared);
    }
    out.push(prepared);
  }
  // от меньших к большим: озеро внутри острова проверяем раньше самого острова
  out.sort((a, b) => a.area - b.area);
  return out;
}

/**
 * Возвращает проверку «точка на воде». null — если суши в документе нет,
 * тогда судить не о чем.
 */
export function buildWaterTest(doc: MapDoc): ((p: Vec2) => boolean) | null {
  const land = prepareLand(doc);
  if (land.length === 0) return null;
  return (p: Vec2): boolean => {
    for (const area of land) {
      if (p.x < area.bbox.minX || p.x > area.bbox.maxX || p.y < area.bbox.minY || p.y > area.bbox.maxY) {
        continue;
      }
      if (pointInPolygon(p, area.points)) return area.hole;
    }
    return true;
  };
}

/** Доля точек линии, лежащих на воде. */
export function waterShare(isWater: (p: Vec2) => boolean, points: Vec2[]): number {
  if (points.length === 0) return 0;
  let wet = 0;
  for (const p of points) if (isWater(p)) wet += 1;
  return wet / points.length;
}

const CONVERTIBLE: ReadonlySet<string> = new Set(['road', 'rail']);
/** Больше половины точек линии — на воде. */
const WATER_THRESHOLD = 0.5;

export function isWaterPath(f: PathFeature, isWater: (p: Vec2) => boolean): boolean {
  if (!CONVERTIBLE.has(f.pathKind)) return false;
  return waterShare(isWater, f.points) >= WATER_THRESHOLD;
}

export interface WaterPathReport {
  ids: string[];
  count: number;
}

/** Ищет дороги, тропы и ж/д, которые фактически идут по воде. */
export function findWaterPaths(doc: MapDoc): WaterPathReport {
  const isWater = buildWaterTest(doc);
  if (!isWater) return { ids: [], count: 0 };
  const ids: string[] = [];
  for (const f of doc.features) {
    if (f.kind !== 'path') continue;
    if (isWaterPath(f, isWater)) ids.push(f.id);
  }
  return { ids, count: ids.length };
}

export function seaDefaults(): { width: number; color: string } {
  return { width: PATH_DEFAULT_WIDTH.sea, color: PATH_DEFAULT_COLORS.sea };
}
