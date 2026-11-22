import { importAzgaarVector } from './azgaarLegacy';
import { shade } from './color';
import { boundsOf, pointInPolygon, polygonArea, simplifyPolyline } from './geometry';
import { extractGroup, extractPathData, extractPaths, parsePathData } from './svgpath';
import {
  DEFAULT_STYLE,
  defaultLayers,
  emptyDoc,
  newId,
  PATH_DEFAULT_COLORS,
  PATH_DEFAULT_WIDTH,
  type CityFeature,
  type CityType,
  type Feature,
  type LandFeature,
  type MapDoc,
  type PathFeature,
  type Vec2,
} from './types';

/* ---------------------------------------------------------------------------
 * Импорт карт Azgaar Fantasy Map Generator (.map).
 *
 * Актуальный формат — не цельный JSON, а «секции», разделённые пустой строкой:
 *   1.154.0|File can be loaded in ...|дата|seed|ширина|высота|timestamp
 *   {"seed":..., "graph":{...}, "geography":{...}}
 *
 *   [биомы]
 *
 *   <svg id="map"> ... </svg>          <- вся геометрия: берега, границы, дороги
 *
 *   [государства]
 *   [города]
 *   [маршруты]
 *   [маркеры]
 *   ...
 * Геометрии суши в данных нет — только в SVG-слое featurePaths. Поэтому контуры
 * разбираем из SVG, а города/дороги/государства берём из JSON-секций.
 *
 * Старый формат (цельный JSON с pack.cells) уходит в azgaarLegacy.
 * ------------------------------------------------------------------------ */

export interface AzgaarResult {
  doc: MapDoc;
  report: string[];
}

type Rec = Record<string, unknown>;

interface Sections {
  version: string | null;
  svg: string | null;
  values: unknown[];
}

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Массив, из которого можно достать записи (нулевой элемент часто пустой заглушкой). */
function recordsOf(value: unknown): Rec[] | null {
  if (!Array.isArray(value)) return null;
  const records = value.filter(isRec);
  return records.length > 0 ? records : null;
}

/**
 * Файл Azgaar — построчный: заголовок, затем по одной секции на строку.
 * Исключение — SVG, он занимает много строк и внутри него есть пустые.
 */
function parseSections(text: string): Sections {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let version: string | null = null;
  let svg: string | null = null;
  const values: unknown[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('<svg')) {
      let buffer = line;
      while (!buffer.includes('</svg>') && i + 1 < lines.length) {
        buffer += `\n${lines[i + 1]}`;
        i += 1;
      }
      svg = buffer;
      continue;
    }

    if (i === 0 && line.includes('|')) {
      version = line.split('|')[0].trim();
      continue;
    }

    if (!line.startsWith('{') && !line.startsWith('[')) continue;

    // обычно секция — одна строка, но на всякий случай дочитываем многострочный JSON
    let buffer = line;
    let parsed = false;
    let extra = 0;
    for (;;) {
      try {
        values.push(JSON.parse(buffer));
        parsed = true;
        break;
      } catch {
        if (extra >= 60 || i + 1 >= lines.length) break;
        const next = lines[i + 1].trim();
        if (!next) break;
        buffer += `\n${lines[i + 1]}`;
        i += 1;
        extra += 1;
      }
    }
    void parsed;
  }

  return { version, svg, values };
}

/** Ищет самый крупный массив объектов, элементы которого похожи на нужное. */
function findArray(values: unknown[], test: (sample: Rec) => boolean): Rec[] | null {
  let best: Rec[] | null = null;
  for (const value of values) {
    const records = recordsOf(value);
    if (!records) continue;
    if (!records.slice(0, 3).some(test)) continue;
    if (!best || records.length > best.length) best = records;
  }
  return best;
}

const isBurg = (s: Rec) =>
  typeof s.x === 'number' && typeof s.y === 'number' && 'cell' in s && !('icon' in s) && !('area' in s);
const isState = (s: Rec) => 'area' in s && 'cells' in s && typeof s.name === 'string';
const isRoute = (s: Rec) => typeof s.group === 'string' && Array.isArray(s.points);
const isMarker = (s: Rec) => typeof s.icon === 'string' && typeof s.x === 'number' && typeof s.y === 'number';
const isRiver = (s: Rec) => 'discharge' in s && 'mouth' in s && !('cell' in s);

/* ------------------------------------------------------------- геометрия SVG */

function ringsFromGroup(svg: string, groupId: string): Vec2[][] {
  const group = extractGroup(svg, groupId);
  if (!group) return [];
  const rings: Vec2[][] = [];
  for (const d of extractPathData(group)) {
    for (const sub of parsePathData(d)) {
      if (sub.points.length >= 3) rings.push(sub.points);
    }
  }
  return rings;
}

/**
 * Вложенность колец определяет сушу и воду: чётная глубина — остров, нечётная —
 * озеро внутри острова (и так далее). Так не нужны метаданные о фичах.
 */
function classifyByDepth(rings: Vec2[][]): { points: Vec2[]; depth: number }[] {
  const prepared = rings.map((points) => ({
    points,
    area: Math.abs(polygonArea(points)),
    bbox: boundsOf(points),
  }));

  const classified = prepared.map((ring, i) => {
    let depth = 0;
    const probe = ring.points[0];
    for (let j = 0; j < prepared.length; j++) {
      if (i === j) continue;
      const other = prepared[j];
      if (other.area <= ring.area) continue;
      if (
        probe.x < other.bbox.minX ||
        probe.x > other.bbox.maxX ||
        probe.y < other.bbox.minY ||
        probe.y > other.bbox.maxY
      ) {
        continue;
      }
      if (pointInPolygon(probe, other.points)) depth += 1;
    }
    return { points: ring.points, depth };
  });

  classified.sort((a, b) => a.depth - b.depth);
  return classified;
}

function citySizing(population: number, capital: boolean): { type: CityType; size: number; labelSize: number } {
  if (capital) return { type: 'capital', size: 1.5, labelSize: 26 };
  if (population > 25) return { type: 'city', size: 1.15, labelSize: 21 };
  if (population > 8) return { type: 'town', size: 0.95, labelSize: 17 };
  return { type: 'village', size: 0.78, labelSize: 13 };
}

/* -------------------------------------------------------------- сборка карты */

export function importAzgaarMap(text: string): AzgaarResult {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    // старый формат: цельный JSON с pack.cells
    return importAzgaarVector(trimmed);
  }

  const sections = parseSections(text);
  if (!sections.svg && sections.values.length === 0) {
    throw new Error('файл не похож на карту Azgaar: нет ни SVG, ни данных');
  }

  const report: string[] = [];
  if (sections.version) report.push(`Версия файла Azgaar: ${sections.version}.`);

  const burgs = findArray(sections.values, isBurg);
  const states = findArray(sections.values, isState);
  const routes = findArray(sections.values, isRoute);
  const markers = findArray(sections.values, isMarker);

  const svg = sections.svg ?? '';

  /* --- контуры: суша, озёра, границы, реки --- */
  let landRings = ringsFromGroup(svg, 'featurePaths');
  if (landRings.length === 0) landRings = ringsFromGroup(svg, 'coastline');
  const lakeRings = ringsFromGroup(svg, 'lakes');
  const classified = classifyByDepth([...landRings, ...lakeRings]);

  interface BorderLine {
    points: Vec2[];
    level: 'state' | 'province';
  }
  const borderLines: BorderLine[] = [];
  for (const [groupId, level] of [
    ['stateBorders', 'state'],
    ['provinceBorders', 'province'],
  ] as const) {
    const group = extractGroup(svg, groupId);
    if (!group) continue;
    for (const d of extractPathData(group)) {
      for (const sub of parsePathData(d)) {
        if (sub.points.length >= 2) borderLines.push({ points: sub.points, level });
      }
    }
  }

  /* --- реки: геометрия в SVG, толщина и имя — в списке рек --- */
  const riversMeta = findArray(sections.values, isRiver);
  interface RiverLine {
    points: Vec2[];
    width: number;
    name: string;
  }
  const riverLines: RiverLine[] = [];
  const riverGroup = extractGroup(svg, 'rivers');
  if (riverGroup) {
    for (const path of extractPaths(riverGroup)) {
      const idMatch = path.id ? /river(\d+)/.exec(path.id) : null;
      const meta =
        idMatch && riversMeta && riversMeta.length > 0
          ? riversMeta.find((r) => Number(r.i) === Number(idMatch[1]))
          : undefined;
      const rawWidth = meta && typeof meta.width === 'number' ? meta.width : null;
      // ширина у Azgaar в своих единицах (0.03…1.1) — переводим в наши
      const width = rawWidth === null ? 2.4 : Math.max(0.9, 0.8 + rawWidth * 6);
      const name = meta && typeof meta.name === 'string' && meta.name ? meta.name : 'Река';
      for (const sub of parsePathData(path.d)) {
        if (sub.points.length >= 2) riverLines.push({ points: sub.points, width, name });
      }
    }
  }

  /* --- габариты: по всему, что будем рисовать --- */
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  const growAll = (lists: Vec2[][]) => {
    for (const list of lists) for (const p of list) grow(p);
  };
  growAll(classified.map((c) => c.points));
  growAll(borderLines.map((l) => l.points));
  growAll(riverLines.map((l) => l.points));
  for (const r of routes ?? []) {
    for (const p of r.points as unknown[]) {
      if (Array.isArray(p) && p.length >= 2) grow({ x: Number(p[0]), y: Number(p[1]) });
    }
  }
  for (const b of burgs ?? []) {
    if (typeof b.x === 'number' && typeof b.y === 'number') grow({ x: b.x, y: b.y });
  }
  if (!Number.isFinite(minX)) throw new Error('в файле не нашлось координат для геометрии');

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const k = 2400 / Math.max(spanX, spanY);
  const pad = 60;
  const tx = (p: Vec2): Vec2 => ({ x: (p.x - minX) * k + pad, y: (p.y - minY) * k + pad });
  const worldW = Math.round(spanX * k + pad * 2);
  const worldH = Math.round(spanY * k + pad * 2);

  const features: Feature[] = [];

  let landCount = 0;
  let lakeCount = 0;
  for (const ring of classified) {
    const isHole = ring.depth % 2 === 1;
    const mins = Math.abs(polygonArea(ring.points)) * k * k;
    if (mins < 4) continue; // мусорные точки-однодневки
    const land: LandFeature = {
      kind: 'land',
      id: newId('land'),
      points: simplifyPolyline(ring.points.map(tx), 0.9),
      hole: isHole,
    };
    features.push(land);
    if (isHole) lakeCount += 1;
    else landCount += 1;
  }
  if (landRings.length === 0) {
    report.push('Не нашёл слой с береговой линией (featurePaths) — суши на карте не будет.');
  } else {
    report.push(`Суша: ${landCount} массивов${lakeCount ? `, ${lakeCount} озёр` : ''}.`);
  }

  let stateBorderCount = 0;
  let provinceBorderCount = 0;
  for (const line of borderLines) {
    const isState = line.level === 'state';
    const path: PathFeature = {
      kind: 'path',
      id: newId('path'),
      name: isState ? 'Граница страны' : 'Граница области',
      pathKind: isState ? 'border' : 'province',
      points: simplifyPolyline(line.points.map(tx), 0.7),
      width: isState ? PATH_DEFAULT_WIDTH.border : PATH_DEFAULT_WIDTH.province,
      color: isState ? PATH_DEFAULT_COLORS.border : PATH_DEFAULT_COLORS.province,
      smooth: false,
    };
    features.push(path);
    if (isState) stateBorderCount += 1;
    else provinceBorderCount += 1;
  }
  if (stateBorderCount > 0) report.push(`Границы стран: ${stateBorderCount} линий.`);
  if (provinceBorderCount > 0) report.push(`Границы областей: ${provinceBorderCount} линий.`);

  for (const line of riverLines) {
    const path: PathFeature = {
      kind: 'path',
      id: newId('path'),
      name: line.name,
      pathKind: 'river',
      points: simplifyPolyline(line.points.map(tx), 0.6),
      width: line.width * k,
      color: '#4e7f9f',
      smooth: true,
    };
    features.push(path);
  }
  if (riverLines.length > 0) {
    report.push(`Реки: ${riverLines.length}.`);
  } else if (riversMeta && riversMeta.length > 0) {
    report.push(`Реки: в файле ${riversMeta.length}, но без геометрии — слой рек был выключен при сохранении.`);
  }

  /* --- дороги --- */
  let roadCount = 0;
  let seaCount = 0;
  for (const route of routes ?? []) {
    const group = typeof route.group === 'string' ? route.group : 'roads';
    const raw = Array.isArray(route.points) ? route.points : [];
    const points: Vec2[] = [];
    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const x = Number(item[0]);
      const y = Number(item[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push(tx({ x, y }));
    }
    if (points.length < 2) continue;
    const isSea = group === 'searoutes';
    const path: PathFeature = {
      kind: 'path',
      id: newId('path'),
      // троп в редакторе нет — они приходят обычными дорогами
      name: isSea ? 'Морской путь' : 'Дорога',
      pathKind: isSea ? 'sea' : 'road',
      points,
      width: isSea ? 2.4 : 3,
      smooth: true,
    };
    features.push(path);
    if (isSea) seaCount += 1;
    else roadCount += 1;
  }
  if (roadCount > 0) report.push(`Дороги и тропы: ${roadCount}.`);
  if (seaCount > 0) report.push(`Морские пути: ${seaCount}.`);

  /* --- города --- */
  let cityCount = 0;
  for (const burg of burgs ?? []) {
    const name = typeof burg.name === 'string' ? burg.name.trim() : '';
    const x = typeof burg.x === 'number' ? burg.x : NaN;
    const y = typeof burg.y === 'number' ? burg.y : NaN;
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const population = typeof burg.population === 'number' ? burg.population : 0;
    const capital = burg.capital === 1 || burg.capital === true;
    const sizing = citySizing(population, capital);
    const city: CityFeature = {
      kind: 'city',
      id: newId('city'),
      name,
      pos: tx({ x, y }),
      type: sizing.type,
      size: sizing.size,
      labelSize: sizing.labelSize,
    };
    if (burg.port === 1 || burg.port === true) {
      city.notes = 'Порт';
    }
    // в Azgaar население хранится в тысячах человек
    if (Number.isFinite(population) && population > 0) {
      city.population = Math.round(population * 1000);
    }
    features.push(city);
    cityCount += 1;
  }
  if (cityCount > 0) report.push(`Города: ${cityCount}${states ? ` (государств: ${states.length - 1})` : ''}.`);

  /* --- названия государств: у Azgaar есть якорь подписи pole — берём его --- */
  let stateLabelCount = 0;
  for (const state of states ?? []) {
    const name = typeof state.name === 'string' ? state.name.trim() : '';
    const pole = state.pole;
    if (!name || !Array.isArray(pole) || pole.length < 2) continue;
    const x = Number(pole[0]);
    const y = Number(pole[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const color = typeof state.color === 'string' && state.color.startsWith('#') ? state.color : '#4a4458';
    const label: Feature = {
      kind: 'label',
      id: newId('label'),
      name,
      text: name.toUpperCase(),
      pos: tx({ x, y }),
      size: 26,
      rotation: 0,
      // цвет государства на светлой суше бывает почти невидим — притемняем
      color: shade(color, -0.45),
    };
    features.push(label);
    stateLabelCount += 1;
  }
  if (stateLabelCount > 0) report.push(`Названия государств: ${stateLabelCount}.`);

  /* --- именованные маркеры (руины, данжи, вулканы) как точки интереса --- */
  let markerCount = 0;
  for (const marker of markers ?? []) {
    const name = typeof marker.name === 'string' ? marker.name.trim() : '';
    const x = typeof marker.x === 'number' ? marker.x : NaN;
    const y = typeof marker.y === 'number' ? marker.y : NaN;
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const city: CityFeature = {
      kind: 'city',
      id: newId('city'),
      name,
      pos: tx({ x, y }),
      type: 'poi',
      size: 0.8,
      labelSize: 11,
    };
    if (typeof marker.type === 'string') city.notes = marker.type;
    features.push(city);
    markerCount += 1;
  }
  if (markerCount > 0) report.push(`Метки интереса: ${markerCount}.`);

  const base = emptyDoc();
  const doc: MapDoc = {
    ...base,
    version: 1,
    meta: { name: 'Карта из Azgaar', width: worldW, height: worldH },
    style: { ...DEFAULT_STYLE },
    layers: defaultLayers(),
    features,
  };

  if (features.length === 0) {
    report.push('Не удалось извлечь ни одного объекта — пришли файл, разберусь.');
  }
  return { doc, report };
}

export { importAzgaarVector };
