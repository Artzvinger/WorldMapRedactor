import { pointInPolygon } from './geometry';
import {
  CITY_DEFAULT_LABEL,
  CITY_DEFAULT_SIZE,
  DEFAULT_STYLE,
  defaultLayers,
  emptyDoc,
  newId,
  type CityFeature,
  type CityType,
  type LandFeature,
  type MapDoc,
  type PathFeature,
  type RegionFeature,
  type Vec2,
} from './types';

/* ---------------------------------------------------------------------------
 * Импорт «векторных» сохранений Azgaar — старый формат, где в JSON лежал
 * pack.cells (полигоны Вороного) и pack.vertices. Новые версии так не сохраняют,
 * но файлы тех лет ещё встречаются.
 * ------------------------------------------------------------------------ */

type Json = Record<string, unknown> | null | undefined;

function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    // typed array, сериализованный как объект с числовыми ключами
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      return keys.sort((a, b) => Number(a) - Number(b)).map((k) => obj[k]);
    }
  }
  return null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Плоский массив координат [x0,y0,x1,y1,...] → список точек. */
function flatToPoints(flat: unknown[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = num(flat[i]);
    const y = num(flat[i + 1]);
    if (x === null || y === null) break;
    out.push({ x, y });
  }
  return out;
}

interface RawMap {
  vertices: Vec2[];
  cellPolys: number[][];
  cellHeights: number[];
  cellCenters: Vec2[];
  cellState: number[];
  cellRiver: number[];
  cellFlux: number[];
}

function readPack(root: Json): Record<string, unknown> | null {
  if (!root || typeof root !== 'object') return null;
  const pack = (root as Record<string, unknown>).pack;
  if (pack && typeof pack === 'object') return pack as Record<string, unknown>;
  if ((root as Record<string, unknown>).cells) return root as Record<string, unknown>;
  return null;
}

function readRaw(pack: Record<string, unknown>, report: string[]): RawMap {
  const cells = (pack.cells ?? {}) as Record<string, unknown>;
  const verticesObj = (pack.vertices ?? {}) as Record<string, unknown>;

  const vertexFlat = asArray(verticesObj.p);
  const vertices = vertexFlat ? flatToPoints(vertexFlat) : [];
  if (vertices.length === 0) throw new Error('в файле нет координат вершин (pack.vertices.p)');

  const cellV = asArray(cells.v) ?? [];
  const cellPolys: number[][] = [];
  for (const entry of cellV) {
    const list = asArray(entry);
    if (!list) continue;
    const ids: number[] = [];
    for (const v of list) {
      const n = num(v);
      if (n !== null && n < vertices.length) ids.push(n);
    }
    cellPolys.push(ids);
  }
  if (cellPolys.length === 0) throw new Error('в файле нет полигонов ячеек (pack.cells.v)');

  const centerFlat = asArray(cells.p);
  let cellCenters: Vec2[] = centerFlat ? flatToPoints(centerFlat) : [];
  if (cellCenters.length < cellPolys.length) {
    cellCenters = cellPolys.map((poly) => {
      let sx = 0;
      let sy = 0;
      for (const v of poly) {
        sx += vertices[v].x;
        sy += vertices[v].y;
      }
      const n = Math.max(1, poly.length);
      return { x: sx / n, y: sy / n };
    });
  }

  const heightArr = asArray(cells.h) ?? [];
  const cellHeights = cellPolys.map((_, i) => num(heightArr[i]) ?? 20);

  const stateArr = asArray(cells.state) ?? [];
  const cellState = cellPolys.map((_, i) => {
    const n = num(stateArr[i]);
    return n === null ? 0 : n;
  });

  const riverArr = asArray(cells.r) ?? [];
  const fluxArr = asArray(cells.fl) ?? [];
  const cellRiver = cellPolys.map((_, i) => {
    const n = num(riverArr[i]);
    return n === null ? 0 : n;
  });
  const cellFlux = cellPolys.map((_, i) => {
    const n = num(fluxArr[i]);
    return n === null ? 0 : n;
  });
  if (riverArr.length === 0) report.push('Реки: в файле нет разметки рек по ячейкам — пропущено.');
  if (heightArr.length === 0) report.push('Высоты ячеек не найдены — считаю всю карту сушей.');

  return { vertices, cellPolys, cellHeights, cellCenters, cellState, cellRiver, cellFlux };
}

/* --------------------------------------------------------------- контуры */

interface Edge {
  a: number;
  b: number;
  count: number;
}

/**
 * Граница объединения набора ячеек: ребро, встречающееся один раз, — внешнее.
 * Возвращает замкнутые контуры (списки индексов вершин).
 */
function boundaryLoops(cellPolys: number[][], indices: number[]): number[][] {
  const edges = new Map<string, Edge>();
  for (const ci of indices) {
    const poly = cellPolys[ci];
    if (!poly || poly.length < 3) continue;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a === b) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const existing = edges.get(key);
      if (existing) existing.count += 1;
      else edges.set(key, { a, b, count: 1 });
    }
  }

  const adjacency = new Map<number, number[]>();
  const used = new Set<string>();
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    const listA = adjacency.get(edge.a) ?? [];
    listA.push(edge.b);
    adjacency.set(edge.a, listA);
    const listB = adjacency.get(edge.b) ?? [];
    listB.push(edge.a);
    adjacency.set(edge.b, listB);
  }

  const loops: number[][] = [];
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  for (const [start, neighbors] of adjacency) {
    for (const firstStep of neighbors) {
      if (used.has(edgeKey(start, firstStep))) continue;
      const loop: number[] = [start];
      let prev = start;
      let current = firstStep;
      used.add(edgeKey(prev, current));
      let guard = 0;
      while (current !== start && guard++ < 200000) {
        loop.push(current);
        const nexts = adjacency.get(current) ?? [];
        let next = -1;
        for (const candidate of nexts) {
          if (candidate === prev) continue;
          if (!used.has(edgeKey(current, candidate))) {
            next = candidate;
            break;
          }
        }
        if (next === -1) break;
        used.add(edgeKey(current, next));
        prev = current;
        current = next;
      }
      if (loop.length >= 3 && current === start) loops.push(loop);
    }
  }
  return loops;
}

function signedArea(points: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/* ---------------------------------------------------------------- импорт */

export interface AzgaarResult {
  doc: MapDoc;
  report: string[];
}

export function importAzgaarVector(text: string): AzgaarResult {
  const root = JSON.parse(text) as Json;
  const pack = readPack(root);
  if (!pack) throw new Error('это не похоже на карту Azgaar: нет блока pack');

  const report: string[] = [];
  const raw = readRaw(pack, report);

  /* --- координаты: сдвигаем к (0,0) и приводим к удобному масштабу --- */
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of raw.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const k = 2200 / Math.max(spanX, spanY);
  const pad = 60;
  const tx = (p: Vec2): Vec2 => ({ x: (p.x - minX) * k + pad, y: (p.y - minY) * k + pad });

  const worldW = Math.round(spanX * k + pad * 2);
  const worldH = Math.round(spanY * k + pad * 2);

  const info = (root as Record<string, unknown> | null)?.info as Record<string, unknown> | undefined;
  const mapName = typeof info?.mapName === 'string' && info.mapName ? info.mapName : 'Карта из Azgaar';

  const features: MapDoc['features'] = [];

  /* --- суша --- */
  const landCells: number[] = [];
  for (let i = 0; i < raw.cellPolys.length; i++) {
    if (raw.cellHeights[i] >= 20 && raw.cellPolys[i].length >= 3) landCells.push(i);
  }
  const landLoops = boundaryLoops(raw.cellPolys, landCells);
  const landPolys: Vec2[][] = landLoops.map((loop) => loop.map((vi) => tx(raw.vertices[vi])));

  // озёра и дырки внутри суши: контур, лежащий внутри другого контура
  const outer: Vec2[][] = [];
  const holes: Vec2[][] = [];
  for (let i = 0; i < landPolys.length; i++) {
    const poly = landPolys[i];
    let inside = false;
    for (let j = 0; j < landPolys.length; j++) {
      if (i === j) continue;
      if (Math.abs(signedArea(landPolys[j])) <= Math.abs(signedArea(poly))) continue;
      if (pointInPolygon(poly[0], landPolys[j])) {
        inside = true;
        break;
      }
    }
    (inside ? holes : outer).push(poly);
  }

  for (const poly of outer) {
    if (poly.length < 3) continue;
    const land: LandFeature = { kind: 'land', id: newId('land'), points: poly, hole: false };
    features.push(land);
  }
  for (const poly of holes) {
    if (poly.length < 3) continue;
    const land: LandFeature = { kind: 'land', id: newId('land'), points: poly, hole: true };
    features.push(land);
  }
  report.push(
    `Суша: ${landCells.length} ячеек, ${outer.length} береговых контуров${holes.length ? `, ${holes.length} озёр` : ''}.`,
  );

  /* --- регионы государств --- */
  const states = asArray(pack.states) ?? [];
  const byState = new Map<number, number[]>();
  for (const ci of landCells) {
    const sid = raw.cellState[ci];
    if (!sid) continue;
    const list = byState.get(sid) ?? [];
    list.push(ci);
    byState.set(sid, list);
  }
  let stateCount = 0;
  for (const [sid, cells] of byState) {
    const state = states[sid] as Record<string, unknown> | undefined;
    const name = typeof state?.name === 'string' && state.name ? state.name : `Государство ${sid}`;
    const color = typeof state?.color === 'string' && state.color.startsWith('#') ? state.color : '#b58a5a';
    const loops = boundaryLoops(raw.cellPolys, cells);
    if (loops.length === 0) continue;
    // берём самый крупный контур государства
    const best = loops
      .map((loop) => loop.map((vi) => tx(raw.vertices[vi])))
      .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0];
    if (best.length < 3) continue;
    const region: RegionFeature = {
      kind: 'region',
      id: newId('region'),
      name,
      points: best,
      fill: color,
      stroke: color,
      opacity: 0.22,
      strokeWidth: 2.4,
      smooth: false,
    };
    features.push(region);
    stateCount += 1;
  }
  if (stateCount > 0) report.push(`Государства: ${stateCount}.`);

  /* --- реки --- */
  const rivers = asArray(pack.rivers) ?? [];
  const riverCells = new Map<number, number[]>();
  for (let i = 0; i < raw.cellRiver.length; i++) {
    const rid = raw.cellRiver[i];
    if (!rid) continue;
    const list = riverCells.get(rid) ?? [];
    list.push(i);
    riverCells.set(rid, list);
  }
  let riverCount = 0;
  for (const [rid, cells] of riverCells) {
    if (cells.length < 2) continue;
    const meta = rivers[rid] as Record<string, unknown> | undefined;
    const name = typeof meta?.name === 'string' && meta.name ? meta.name : `Река ${rid}`;
    const ordered = cells
      .slice()
      .sort((a, b) => raw.cellFlux[a] - raw.cellFlux[b])
      .map((ci) => tx(raw.cellCenters[ci]));
    const path: PathFeature = {
      kind: 'path',
      id: newId('path'),
      name,
      pathKind: 'river',
      points: ordered,
      width: 6,
      color: '#4e7f9f',
      smooth: true,
    };
    features.push(path);
    riverCount += 1;
  }
  if (riverCount > 0) report.push(`Реки: ${riverCount}.`);

  /* --- города --- */
  const burgs = asArray(pack.burgs) ?? [];
  let cityCount = 0;
  for (const item of burgs) {
    const burg = item as Record<string, unknown> | null;
    if (!burg) continue;
    const x = num(burg.x);
    const y = num(burg.y);
    if (x === null || y === null) continue;
    const name = typeof burg.name === 'string' ? burg.name : '';
    if (!name) continue;
    const population = num(burg.population) ?? 0;
    const capital = burg.capital === true;
    const type: CityType = capital ? 'capital' : population > 20 ? 'city' : population > 8 ? 'town' : 'village';
    const city: CityFeature = {
      kind: 'city',
      id: newId('city'),
      name,
      pos: tx({ x, y }),
      type,
      size: CITY_DEFAULT_SIZE[type],
      labelSize: CITY_DEFAULT_LABEL[type],
    };
    // в Azgaar население в тысячах человек
    if (population > 0) city.population = Math.round(population * 1000);
    features.push(city);
    cityCount += 1;
  }
  if (cityCount > 0) report.push(`Города: ${cityCount}.`);

  /* --- дороги Azgaar, если они сохранены отдельными путями --- */
  const routes = asArray(pack.routes) ?? [];
  let routeCount = 0;
  for (const item of routes) {
    const route = item as Record<string, unknown> | null;
    if (!route) continue;
    const pointsRaw = asArray(route.points);
    if (!pointsRaw) continue;
    const pts: Vec2[] = [];
    for (const p of pointsRaw) {
      const cellIndex = num(p);
      if (cellIndex === null) continue;
      const center = raw.cellCenters[cellIndex];
      if (center) pts.push(tx(center));
    }
    if (pts.length < 2) continue;
    const group = typeof route.group === 'string' ? route.group : 'roads';
    const path: PathFeature = {
      kind: 'path',
      id: newId('path'),
      name: group === 'searoutes' ? 'Морской путь' : 'Дорога',
      pathKind: 'road',
      points: pts,
      width: 3,
      smooth: true,
    };
    features.push(path);
    routeCount += 1;
  }
  if (routeCount > 0) report.push(`Пути: ${routeCount}.`);

  const base = emptyDoc(mapName);
  const doc: MapDoc = {
    ...base,
    version: 1,
    meta: { name: mapName, width: worldW, height: worldH },
    style: { ...DEFAULT_STYLE },
    layers: defaultLayers(),
    features,
  };

  if (features.length === 0) report.push('Ничего не удалось извлечь — пришли файл, поправлю разбор.');
  return { doc, report };
}
