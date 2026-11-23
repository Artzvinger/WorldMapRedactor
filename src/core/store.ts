import { create } from 'zustand';
import { fitCamera, panBy as camPanBy, zoomAtScreen, clampCamera, type Camera } from './camera';
import { dist, distToSegment, rectFromPoints, type Bounds } from './geometry';
import { hitTest, hitVertex, labelHalfWidth, nearestCity, cityLabelBox, cityRadius } from './query';
import { featureLabelText, hasVisibleLabel, isLatinOnly } from './text';
import { findWaterPaths, seaDefaults } from './water';
import { resetPaintCache } from './paint';
import { demoDoc } from './demo';
import {
  CITY_DEFAULT_LABEL,
  CITY_DEFAULT_SIZE,
  DEFAULT_STYLE,
  defaultLayers,
  emptyDoc,
  LABEL_SIDES,
  LAYER_ORDER,
  migrateDoc,
  layerOf,
  newId,
  PATH_DEFAULT_COLORS,
  PATH_DEFAULT_WIDTH,
  type CityFeature,
  type Draft,
  type Feature,
  type LabelFeature,
  type LandDab,
  type LayerId,
  type LabelSide,
  type MapDoc,
  type PathFeature,
  type RegionFeature,
  type ToolId,
  type Vec2,
} from './types';

/** Площадь пересечения двух прямоугольников (0, если не пересекаются). */
function overlapArea(a: Bounds, b: Bounds): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

export const SNAP_PX = 18;
const HISTORY_LIMIT = 80;
const STORAGE_KEY = 'map-redactor:doc:v1';

function cloneDoc(doc: MapDoc): MapDoc {
  return structuredClone(doc);
}

/**
 * Мазки для одной точки штриха. При noise > 0 к основному кругу добавляются
 * кружки поменьше со смещением — край перестаёт быть ровным.
 */
function brushDabs(at: Vec2, r: number, erase: boolean, noise: number): LandDab[] {
  if (noise <= 0) return [{ x: at.x, y: at.y, r, erase }];
  const main = { x: at.x, y: at.y, r: r * (1 - noise * 0.3 * Math.random()), erase };
  const dabs: LandDab[] = [main];
  const extra = Math.round(noise * 3);
  for (let i = 0; i < extra; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spread = r * noise * (0.35 + 0.55 * Math.random());
    const size = r * (0.3 + 0.45 * Math.random());
    dabs.push({
      x: at.x + Math.cos(angle) * spread,
      y: at.y + Math.sin(angle) * spread,
      r: Math.max(1, size),
      erase,
    });
  }
  return dabs;
}

function saveState(doc: MapDoc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* переполнение localStorage не должно ломать редактор */
  }
}

export function loadStoredDoc(): MapDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapDoc;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.features)) return null;
    // старые сохранения не знают про новые слои и поля стиля — дополняем
    return migrateDoc({
      ...parsed,
      style: { ...DEFAULT_STYLE, ...(parsed.style ?? {}) },
      layers: { ...defaultLayers(), ...(parsed.layers ?? {}) },
    });
  } catch {
    return null;
  }
}

export type SaveState = 'saved' | 'dirty';

export interface EditorState {
  doc: MapDoc;
  camera: Camera;
  tool: ToolId;
  selection: string[];
  draft: Draft | null;
  past: MapDoc[];
  future: MapDoc[];
  dragBase: MapDoc | null;
  marquee: Bounds | null;
  cursorWorld: Vec2 | null;
  lastTag: string | null;
  lastTs: number;
  viewport: { width: number; height: number };
  /** радиус кисти в мировых единицах */
  brushRadius: number;
  /** неровность края кисти: 0 — ровный круг, 1 — рваный край */
  brushNoise: number;
  /** мазки текущего штриха — до отпускания мыши */
  stroke: LandDab[] | null;
  /** радиус и последняя точка текущего штриха */
  strokeR: number;
  strokeNoise: number;
  strokeLast: Vec2 | null;
  setBrushRadius: (radius: number) => void;
  setBrushNoise: (noise: number) => void;
  beginStroke: (erase: boolean, at: Vec2) => void;
  extendStroke: (at: Vec2) => void;
  endStroke: () => void;

  setTool: (tool: ToolId) => void;
  setCamera: (camera: Camera) => void;
  setViewport: (width: number, height: number) => void;
  centerOn: (pos: Vec2, zoom?: number) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (sx: number, sy: number, factor: number, vw: number, vh: number) => void;
  fitToScreen: (vw: number, vh: number) => void;

  commit: (mutator: (doc: MapDoc) => void, tag?: string) => void;
  addCity: (pos: Vec2) => void;
  addLabel: (pos: Vec2) => void;
  select: (ids: string[], additive?: boolean) => void;
  updateFeature: (id: string, patch: Record<string, unknown>) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  /** Удаляет города и подписи, названные латиницей. Возвращает, сколько удалил. */
  deleteLatinNamed: () => number;
  /** Переводит дороги, тропы и ж/д, идущие по воде, в морские пути. */
  convertWaterPathsToSea: () => number;
  /** Расставляет подписи городов по сторонам, чтобы они не наезжали друг на друга. */
  autoPlaceCityLabels: () => number;
  /** Убирает крайнюю точку линии: side = начало или конец. */
  trimPath: (id: string, side: 'start' | 'end') => void;
  /** Убирает конкретную точку линии или контура. */
  removeVertex: (id: string, index: number) => void;

  beginTransform: () => void;
  transformSelection: (dx: number, dy: number) => void;
  transformVertex: (id: string, index: number, dx: number, dy: number) => void;
  endTransform: () => void;

  startDraft: (tool: ToolId, at: Vec2) => void;
  addDraftPoint: (at: Vec2) => void;
  moveDraftCursor: (at: Vec2 | null) => void;
  finishDraft: () => void;
  cancelDraft: () => void;
  undo: () => void;
  redo: () => void;

  toggleLayerVisible: (id: LayerId) => void;
  toggleLayerLocked: (id: LayerId) => void;
  setLayerOpacity: (id: LayerId, value: number) => void;

  setMarquee: (m: Bounds | null) => void;
  finishMarquee: (additive: boolean) => void;
  setCursorWorld: (p: Vec2 | null) => void;

  loadDoc: (doc: MapDoc) => void;
  newDoc: () => void;
  loadDemo: () => void;
  setName: (name: string) => void;
  setDocStyle: (patch: Partial<MapDoc['style']>) => void;
}

function initialDoc(): MapDoc {
  return loadStoredDoc() ?? demoDoc();
}

export const useEditor = create<EditorState>()((set, get) => ({
  doc: initialDoc(),
  camera: { ox: 0, oy: 0, zoom: 0.5 },
  tool: 'select',
  selection: [],
  draft: null,
  past: [],
  future: [],
  dragBase: null,
  marquee: null,
  cursorWorld: null,
  lastTag: null,
  lastTs: 0,
  viewport: { width: 1200, height: 800 },
  brushRadius: 40,
  brushNoise: 0.45,
  stroke: null,
  strokeR: 0,
  strokeNoise: 0,
  strokeLast: null,

  setBrushRadius: (radius) => set({ brushRadius: Math.max(3, Math.min(400, Math.round(radius))) }),
  setBrushNoise: (noise) => set({ brushNoise: Math.max(0, Math.min(1, noise)) }),

  beginStroke: (erase, at) => {
    const r = get().brushRadius;
    const noise = get().brushNoise;
    set({ stroke: brushDabs(at, r, erase, noise), strokeR: r, strokeNoise: noise, strokeLast: { ...at } });
  },

  extendStroke: (at) => {
    const stroke = get().stroke;
    const from = get().strokeLast;
    const r = get().strokeR;
    if (!stroke || !from || r <= 0) return;
    const d = dist(from, at);
    const step = Math.max(2, r * 0.3);
    if (d < step) return;
    const steps = Math.floor(d / step);
    const noise = get().strokeNoise;
    const erase = stroke[0]?.erase ?? false;
    const next = stroke.slice();
    let last = from;
    for (let i = 1; i <= steps; i++) {
      const t = (i * step) / d;
      const p = { x: from.x + (at.x - from.x) * t, y: from.y + (at.y - from.y) * t };
      next.push(...brushDabs(p, r, erase, noise));
      last = p;
    }
    set({ stroke: next, strokeLast: last });
  },

  endStroke: () => {
    const stroke = get().stroke;
    set({ stroke: null, strokeR: 0, strokeNoise: 0, strokeLast: null });
    if (!stroke || stroke.length === 0) return;
    get().commit((d) => {
      d.paint.push(...stroke);
    });
  },

  setTool: (tool) => set({ tool, draft: null, marquee: null }),
  setCamera: (camera) => set({ camera }),

  setViewport: (width, height) => set({ viewport: { width, height } }),

  centerOn: (pos, zoom) =>
    set((s) => {
      const z = Math.max(zoom ?? s.camera.zoom, 0.6);
      return {
        camera: {
          zoom: z,
          ox: s.viewport.width / 2 - pos.x * z,
          oy: s.viewport.height / 2 - pos.y * z,
        },
      };
    }),

  panBy: (dx, dy) => set((s) => ({ camera: camPanBy(s.camera, dx, dy) })),

  zoomAt: (sx, sy, factor, vw, vh) =>
    set((s) => ({
      camera: clampCamera(zoomAtScreen(s.camera, sx, sy, factor), s.doc.meta.width, s.doc.meta.height, vw, vh),
    })),

  fitToScreen: (vw, vh) =>
    set((s) => ({ camera: fitCamera(s.doc.meta.width, s.doc.meta.height, vw, vh) })),

  commit: (mutator, tag) =>
    set((s) => {
      const next = cloneDoc(s.doc);
      mutator(next);
      // быстрые правки одного и того же поля (перетаскивание ползунка, набор текста)
      // склеиваем в один шаг истории
      const coalesce = Boolean(tag) && s.lastTag === tag && Date.now() - s.lastTs < 700;
      const past = coalesce ? s.past : [...s.past, s.doc].slice(-HISTORY_LIMIT);
      saveState(next);
      return { doc: next, past, future: [], lastTag: coalesce ? s.lastTag : (tag ?? null), lastTs: Date.now() };
    }),

  addCity: (pos) => {
    const city: CityFeature = {
      kind: 'city',
      id: newId('city'),
      name: 'Новый город',
      pos: { ...pos },
      type: 'town',
      size: CITY_DEFAULT_SIZE.town,
      labelSize: CITY_DEFAULT_LABEL.town,
    };
    get().commit((d) => {
      d.features.push(city);
    });
    set({ selection: [city.id] });
  },

  addLabel: (pos) => {
    const label: LabelFeature = {
      kind: 'label',
      id: newId('label'),
      name: 'Подпись',
      text: 'Новая подпись',
      pos: { ...pos },
      size: 28,
      rotation: 0,
      color: '#3a2f22',
    };
    get().commit((d) => {
      d.features.push(label);
    });
    set({ selection: [label.id] });
  },

  select: (ids, additive = false) =>
    set((s) => {
      if (!additive) return { selection: ids };
      const next = new Set(s.selection);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { selection: [...next] };
    }),

  updateFeature: (id, patch) =>
    get().commit((d) => {
      const f = d.features.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
      if (f && f.kind === 'city' && typeof patch.type === 'string' && !('size' in patch)) {
        // размер и кегль подписи подтягиваем под новый тип
        const t = f.type;
        f.size = CITY_DEFAULT_SIZE[t];
        f.labelSize = CITY_DEFAULT_LABEL[t];
      }
    }, `f:${id}:${Object.keys(patch).join(',')}`),

  deleteSelection: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().commit((d) => {
      d.features = d.features.filter((f) => !ids.has(f.id));
      for (const f of d.features) {
        if (f.kind === 'path') {
          if (f.startCityId && ids.has(f.startCityId)) f.startCityId = null;
          if (f.endCityId && ids.has(f.endCityId)) f.endCityId = null;
        }
      }
    });
    set({ selection: [] });
  },

  duplicateSelection: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    const created: string[] = [];
    get().commit((d) => {
      const copies: Feature[] = [];
      for (const f of d.features) {
        if (!ids.has(f.id)) continue;
        const copy = structuredClone(f);
        copy.id = newId(f.kind);
        if (copy.kind === 'city') copy.pos = { x: copy.pos.x + 40, y: copy.pos.y + 40 };
        if (copy.kind === 'label') copy.pos = { x: copy.pos.x + 40, y: copy.pos.y + 40 };
        if (copy.kind === 'path' || copy.kind === 'region') {
          copy.points = copy.points.map((p) => ({ x: p.x + 40, y: p.y + 40 }));
        }
        copies.push(copy);
        created.push(copy.id);
      }
      d.features.push(...copies);
    });
    set({ selection: created });
  },

  deleteLatinNamed: () => {
    const doomed = new Set(
      get()
        .doc.features.filter((f) => hasVisibleLabel(f) && isLatinOnly(featureLabelText(f)))
        .map((f) => f.id),
    );
    if (doomed.size === 0) return 0;
    get().commit((d) => {
      d.features = d.features.filter((f) => !doomed.has(f.id));
      // не оставляем у дорог ссылки на удалённые города
      for (const f of d.features) {
        if (f.kind !== 'path') continue;
        if (f.startCityId && doomed.has(f.startCityId)) f.startCityId = null;
        if (f.endCityId && doomed.has(f.endCityId)) f.endCityId = null;
      }
    });
    set({ selection: get().selection.filter((id) => !doomed.has(id)) });
    return doomed.size;
  },

  convertWaterPathsToSea: () => {
    const doc = get().doc;
    const { ids } = findWaterPaths(doc);
    if (ids.length === 0) return 0;
    const target = new Set(ids);
    const defaults = seaDefaults();
    get().commit((d) => {
      for (const f of d.features) {
        if (f.kind !== 'path' || !target.has(f.id)) continue;
        f.pathKind = 'sea';
        f.width = defaults.width;
        f.color = defaults.color;
        if (!f.name || f.name === 'Дорога' || f.name === 'Тропа' || f.name === 'Новая дорога' || f.name === 'Новая тропа') {
          f.name = 'Морской путь';
        }
      }
    });
    return ids.length;
  },

  autoPlaceCityLabels: () => {
    const doc = get().doc;
    const cities = doc.features.filter((f): f is CityFeature => f.kind === 'city' && Boolean(f.name));
    if (cities.length === 0) return 0;

    const rank = (c: CityFeature): number =>
      c.type === 'capital' ? 0 : c.type === 'city' ? 1 : c.type === 'town' ? 2 : c.type === 'village' ? 3 : 4;
    const ordered = [...cities].sort((a, b) => rank(a) - rank(b) || b.labelSize - a.labelSize);

    const scale = doc.style.labelScale ?? 1;
    const iconScale = doc.style.iconScale ?? 1;
    const placed: Bounds[] = [];
    // значки городов тоже занимают место: подпись не должна лечь на соседний значок
    for (const city of cities) {
      const r = cityRadius(city, iconScale);
      placed.push({ minX: city.pos.x - r, minY: city.pos.y - r, maxX: city.pos.x + r, maxY: city.pos.y + r });
    }
    // свободные подписи (моря, государства) — тоже препятствия
    for (const f of doc.features) {
      if (f.kind !== 'label' || !f.text) continue;
      const halfW = labelHalfWidth(f.text, f.size);
      const halfH = f.size * 0.55;
      placed.push({
        minX: f.pos.x - halfW,
        minY: f.pos.y - halfH,
        maxX: f.pos.x + halfW,
        maxY: f.pos.y + halfH,
      });
    }

    const chosen = new Map<string, LabelSide>();
    let changed = 0;
    for (const city of ordered) {
      // если свободной стороны нет, берём ту, где подпись перекрывает меньше всего
      let side: LabelSide = 'bottom';
      let bestScore = Infinity;
      for (const candidate of LABEL_SIDES) {
        const box = cityLabelBox(city, candidate, scale, iconScale);
        let score = 0;
        for (const p of placed) score += overlapArea(p, box);
        if (score < bestScore) {
          bestScore = score;
          side = candidate;
        }
        if (bestScore === 0) break;
      }
      placed.push(cityLabelBox(city, side, scale, iconScale));
      chosen.set(city.id, side);
      if ((city.labelSide ?? 'bottom') !== side) changed += 1;
    }

    if (changed === 0) return 0;
    get().commit((d) => {
      for (const f of d.features) {
        if (f.kind !== 'city') continue;
        const side = chosen.get(f.id);
        if (side && (f.labelSide ?? 'bottom') !== side) f.labelSide = side;
      }
    });
    return changed;
  },

  trimPath: (id, side) => {
    const feature = get().doc.features.find((f) => f.id === id);
    if (!feature || (feature.kind !== 'path' && feature.kind !== 'region')) return;
    if (feature.points.length <= 2) {
      // от линии из двух точек останется одна — проще убрать объект целиком
      get().commit((d) => {
        d.features = d.features.filter((f) => f.id !== id);
      });
      set({ selection: get().selection.filter((s) => s !== id) });
      return;
    }
    get().commit((d) => {
      const f = d.features.find((x) => x.id === id);
      if (!f || (f.kind !== 'path' && f.kind !== 'region')) return;
      if (side === 'start') {
        f.points = f.points.slice(1);
        if (f.kind === 'path') f.startCityId = null;
      } else {
        f.points = f.points.slice(0, -1);
        if (f.kind === 'path') f.endCityId = null;
      }
    });
  },

  removeVertex: (id, index) => {
    const feature = get().doc.features.find((f) => f.id === id);
    if (!feature || (feature.kind !== 'path' && feature.kind !== 'region')) return;
    if (feature.points.length <= 2 || index < 0 || index >= feature.points.length) {
      get().trimPath(id, index === 0 ? 'start' : 'end');
      return;
    }
    get().commit((d) => {
      const f = d.features.find((x) => x.id === id);
      if (!f || (f.kind !== 'path' && f.kind !== 'region')) return;
      f.points = f.points.filter((_, i) => i !== index);
      if (f.kind === 'path') {
        if (index === 0) f.startCityId = null;
        if (index === f.points.length) f.endCityId = null;
      }
    });
  },

  beginTransform: () => set({ dragBase: cloneDoc(get().doc) }),
  transformSelection: (dx, dy) => {
    const base = get().dragBase;
    if (!base) return;
    const ids = new Set(get().selection);
    const doc = cloneDoc(base);
    for (const f of doc.features) {
      if (!ids.has(f.id)) continue;
      if (f.kind === 'city' || f.kind === 'label') {
        f.pos = { x: f.pos.x + dx, y: f.pos.y + dy };
      } else if (f.kind === 'path' || f.kind === 'region' || f.kind === 'land') {
        f.points = f.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
    }
    set({ doc });
  },

  transformVertex: (id, index, dx, dy) => {
    const base = get().dragBase;
    if (!base) return;
    const doc = cloneDoc(base);
    const f = doc.features.find((x) => x.id === id);
    if (f && (f.kind === 'path' || f.kind === 'region')) {
      const p = f.points[index];
      if (p) f.points[index] = { x: p.x + dx, y: p.y + dy };
    }
    set({ doc });
  },

  endTransform: () =>
    set((s) => {
      if (!s.dragBase) return {};
      const changed = JSON.stringify(s.dragBase) !== JSON.stringify(s.doc);
      const past = changed ? [...s.past, s.dragBase].slice(-HISTORY_LIMIT) : s.past;
      if (changed) saveState(s.doc);
      return { dragBase: null, past, future: changed ? [] : s.future };
    }),

  startDraft: (tool, at) => set({ draft: { tool, points: [at], cursor: at } }),

  addDraftPoint: (at) =>
    set((s) => {
      if (!s.draft) return {};
      return { draft: { ...s.draft, points: [...s.draft.points, at], cursor: at } };
    }),

  moveDraftCursor: (at) =>
    set((s) => (s.draft ? { draft: { ...s.draft, cursor: at } } : {})),

  finishDraft: () => {
    const { draft } = get();
    if (!draft) return;
    const pts = draft.points.filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 0.5);
    const tool = draft.tool;

    if (tool === 'region') {
      if (pts.length < 3) {
        set({ draft: null });
        return;
      }
      const region: RegionFeature = {
        kind: 'region',
        id: newId('region'),
        name: 'Новый регион',
        points: pts,
        fill: '#7d9b62',
        stroke: '#4f6a3c',
        opacity: 0.45,
        strokeWidth: 2,
        smooth: true,
      };
      get().commit((d) => {
        d.features.push(region);
      });
      set({ draft: null, selection: [region.id] });
      return;
    }

    const kindMap: Record<string, PathFeature['pathKind']> = {
      road: 'road',
      rail: 'rail',
      sea: 'sea',
      river: 'river',
    };
    const pathKind = kindMap[tool];
    if (!pathKind || pts.length < 2) {
      set({ draft: null });
      return;
    }
    const zoom = get().camera.zoom;
    const snapDist = 30 / zoom;
    const startCity = nearestCity(get().doc, pts[0], snapDist);
    const endCity = nearestCity(get().doc, pts[pts.length - 1], snapDist);
    const path: PathFeature = {
      kind: 'path',
      id: newId('path'),
      name:
        pathKind === 'road'
          ? 'Новая дорога'
          : pathKind === 'rail'
            ? 'Новая железная дорога'
            : pathKind === 'river'
              ? 'Новая река'
              : 'Новый морской путь',
      pathKind,
      points: pts,
      width: PATH_DEFAULT_WIDTH[pathKind],
      color: PATH_DEFAULT_COLORS[pathKind],
      smooth: true,
      startCityId: startCity?.id ?? null,
      endCityId: endCity?.id ?? null,
    };
    get().commit((d) => {
      d.features.push(path);
    });
    set({ draft: null, selection: [path.id] });
  },

  cancelDraft: () => set({ draft: null }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      saveState(prev);
      return {
        doc: prev,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
        selection: [],
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      saveState(next);
      return {
        doc: next,
        past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        selection: [],
      };
    }),

  toggleLayerVisible: (id) =>
    get().commit((d) => {
      d.layers[id].visible = !d.layers[id].visible;
    }),

  toggleLayerLocked: (id) =>
    get().commit((d) => {
      d.layers[id].locked = !d.layers[id].locked;
    }),

  setLayerOpacity: (id, value) =>
    get().commit((d) => {
      d.layers[id].opacity = Math.max(0, Math.min(1, value));
    }, `layer:${id}:opacity`),

  setMarquee: (m) => set({ marquee: m }),

  finishMarquee: (additive) => {
    const m = get().marquee;
    if (!m) return;
    const hits: string[] = [];
    for (const f of get().doc.features) {
      if (f.kind === 'land') continue;
      if (!get().doc.layers[layerOf(f)].visible) continue;
      if (f.kind === 'city' || f.kind === 'label') {
        if (f.pos.x >= m.minX && f.pos.x <= m.maxX && f.pos.y >= m.minY && f.pos.y <= m.maxY) {
          hits.push(f.id);
        }
      } else {
        const inside = f.points.every(
          (p) => p.x >= m.minX && p.x <= m.maxX && p.y >= m.minY && p.y <= m.maxY,
        );
        if (inside) hits.push(f.id);
      }
    }
    get().select(hits, additive);
    set({ marquee: null });
  },

  setCursorWorld: (p) => set({ cursorWorld: p }),

  loadDoc: (doc) => {
    resetPaintCache();
    const migrated = migrateDoc(doc);
    saveState(migrated);
    set({ doc: migrated, selection: [], past: [], future: [], draft: null, dragBase: null });
  },

  newDoc: () => get().loadDoc(emptyDoc()),

  loadDemo: () => get().loadDoc(demoDoc()),

  setName: (name) =>
    get().commit((d) => {
      d.meta.name = name;
    }, 'doc:name'),

  setDocStyle: (patch) =>
    get().commit((d) => {
      Object.assign(d.style, patch);
    }, `doc:style:${Object.keys(patch).join(',')}`),
}));

/* ------------------------------------------------------------------ утилиты */

export function snapRadius(zoom: number): number {
  return SNAP_PX / zoom;
}

export function clickTolerance(zoom: number): number {
  return 7 / zoom;
}

export function pickAt(pos: Vec2): Feature | null {
  const { doc, camera } = useEditor.getState();
  return hitTest(doc, pos, clickTolerance(camera.zoom));
}

export function pickVertexAt(f: Feature, pos: Vec2): number | null {
  const { camera } = useEditor.getState();
  return hitVertex(f, pos, 9 / camera.zoom);
}

export function snapPoint(pos: Vec2): Vec2 {
  const { doc, camera } = useEditor.getState();
  const city = nearestCity(doc, pos, snapRadius(camera.zoom));
  return city ? { ...city.pos } : pos;
}

export function nearestCityAt(pos: Vec2): CityFeature | null {
  const { doc, camera } = useEditor.getState();
  return nearestCity(doc, pos, snapRadius(camera.zoom));
}

/** Для отладки/статуса: расстояние от точки до объекта. */
export function distanceToFeature(f: Feature, pos: Vec2): number {
  if (f.kind === 'city' || f.kind === 'label') return dist(f.pos, pos);
  let best = Infinity;
  for (let i = 1; i < f.points.length; i++) {
    best = Math.min(best, distToSegment(pos, f.points[i - 1], f.points[i]));
  }
  return best;
}

export function makeMarqueeFromDrag(a: Vec2, b: Vec2): Bounds {
  return rectFromPoints(a, b);
}

export { LAYER_ORDER };
