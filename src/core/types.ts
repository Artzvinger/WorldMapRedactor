export type Vec2 = { x: number; y: number };

/* ---------------------------------------------------------------- инструменты */

export const TOOL_IDS = [
  'select',
  'pan',
  'city',
  'road',
  'rail',
  'sea',
  'river',
  'region',
  'label',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_LABELS: Record<ToolId, string> = {
  select: 'Выбор',
  pan: 'Прокрутка',
  city: 'Город',
  road: 'Дорога',
  rail: 'Железная дорога',
  sea: 'Морской путь',
  river: 'Река',
  region: 'Регион',
  label: 'Подпись',
};

export interface Draft {
  tool: ToolId;
  points: Vec2[];
  cursor: Vec2 | null;
}

/* ------------------------------------------------------------------ города */

export const CITY_TYPES = ['capital', 'city', 'town', 'village', 'poi'] as const;
export type CityType = (typeof CITY_TYPES)[number];

export const CITY_TYPE_LABELS: Record<CityType, string> = {
  capital: 'Столица',
  city: 'Город',
  town: 'Городок',
  village: 'Деревня',
  poi: 'Точка интереса',
};

/* ----------------------------------------------------------- линии и реки */

export const PATH_KINDS = ['road', 'rail', 'river', 'sea', 'border', 'province'] as const;
export type PathKind = (typeof PATH_KINDS)[number];

export const PATH_KIND_LABELS: Record<PathKind, string> = {
  road: 'Дорога',
  rail: 'Железная дорога',
  river: 'Река',
  sea: 'Морской путь',
  border: 'Граница страны',
  province: 'Граница области',
};

/* ------------------------------------------------------------------- слои */

export type LayerId =
  | 'land'
  | 'regions'
  | 'borders'
  | 'provinces'
  | 'rivers'
  | 'roads'
  | 'rail'
  | 'cities'
  | 'labels';

export const LAYER_ORDER: LayerId[] = [
  'land',
  'regions',
  'borders',
  'provinces',
  'rivers',
  'roads',
  'rail',
  'cities',
  'labels',
];

export const LAYER_LABELS: Record<LayerId, string> = {
  land: 'Суша',
  regions: 'Регионы',
  borders: 'Границы стран',
  provinces: 'Границы областей',
  rivers: 'Реки',
  roads: 'Дороги',
  rail: 'Железные дороги',
  cities: 'Города',
  labels: 'Подписи',
};

export interface LayerState {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

/* ---------------------------------------------------------------- объекты */

export interface FeatureBase {
  id: string;
  notes?: string;
}

/** С какой стороны от значка стоит подпись города. */
export const LABEL_SIDES = ['bottom', 'top', 'left', 'right'] as const;
export type LabelSide = (typeof LABEL_SIDES)[number];

export const LABEL_SIDE_LABELS: Record<LabelSide, string> = {
  bottom: 'Снизу',
  top: 'Сверху',
  left: 'Слева',
  right: 'Справа',
};

export const LABEL_SIDE_ARROWS: Record<LabelSide, string> = {
  bottom: '↓',
  top: '↑',
  left: '←',
  right: '→',
};

export interface CityFeature extends FeatureBase {
  kind: 'city';
  name: string;
  pos: Vec2;
  type: CityType;
  /** множитель размера значка */
  size: number;
  color?: string;
  /** размер подписи в мировых единицах */
  labelSize: number;
  /** сторона подписи; не задана — значит снизу */
  labelSide?: LabelSide;
  /** население, человек (в Azgaar хранится в тысячах) */
  population?: number;
}

export interface PathFeature extends FeatureBase {
  kind: 'path';
  name: string;
  pathKind: PathKind;
  points: Vec2[];
  width: number;
  color?: string;
  smooth: boolean;
  startCityId?: string | null;
  endCityId?: string | null;
}

export interface RegionFeature extends FeatureBase {
  kind: 'region';
  name: string;
  points: Vec2[];
  fill: string;
  stroke: string;
  opacity: number;
  strokeWidth: number;
  smooth: boolean;
}

export interface LabelFeature extends FeatureBase {
  kind: 'label';
  name: string;
  pos: Vec2;
  text: string;
  size: number;
  rotation: number;
  color: string;
}

/** Полигон суши, полученный импортом (Азгаар и т.п.). Только визуал. */
export interface LandFeature extends FeatureBase {
  kind: 'land';
  points: Vec2[];
  /** true — это озеро/дырка внутри суши: заливается цветом моря */
  hole?: boolean;
}

export type Feature = CityFeature | PathFeature | RegionFeature | LabelFeature | LandFeature;

export type FeatureKind = Feature['kind'];

export function layerOf(f: Feature): LayerId {
  switch (f.kind) {
    case 'land':
      return 'land';
    case 'region':
      return 'regions';
    case 'path':
      return f.pathKind === 'river'
        ? 'rivers'
        : f.pathKind === 'rail'
          ? 'rail'
          : f.pathKind === 'border'
            ? 'borders'
            : f.pathKind === 'province'
              ? 'provinces'
              : 'roads';
    case 'city':
      return 'cities';
    case 'label':
      return 'labels';
  }
}

export function featureHasLabel(f: Feature): f is CityFeature | LabelFeature | RegionFeature | PathFeature {
  return f.kind !== 'land';
}

/* ----------------------------------------------------------------- документ */

/** Шрифт подписей: чистый без засечек или «книжный» с засечками. */
export const LABEL_FONTS = ['sans', 'serif'] as const;
export type LabelFont = (typeof LABEL_FONTS)[number];

export const LABEL_FONT_LABELS: Record<LabelFont, string> = {
  sans: 'Чёткий (без засечек)',
  serif: 'Книжный (с засечками)',
};

export interface MapStyle {
  water: string;
  land: string;
  /** цвет «бумаги» вокруг мира */
  paper: string;
  labelFont: LabelFont;
  /** общий множитель размера подписей городов */
  labelScale: number;
  /** общий множитель толщины линий (дороги, реки, границы) */
  lineScale: number;
  /** общий множитель размера значков городов */
  iconScale: number;
  /** показывать население под названием города */
  showPopulation: boolean;
}

export interface MapDoc {
  version: 1;
  meta: {
    name: string;
    width: number;
    height: number;
  };
  style: MapStyle;
  layers: Record<LayerId, LayerState>;
  features: Feature[];
}

export const DEFAULT_STYLE: MapStyle = {
  water: '#9dbfd2',
  land: '#e8e0cb',
  paper: '#1b1e23',
  labelFont: 'sans',
  labelScale: 0.8,
  lineScale: 0.8,
  iconScale: 0.85,
  showPopulation: false,
};

export function defaultLayers(): Record<LayerId, LayerState> {
  return {
    land: { visible: true, locked: false, opacity: 1 },
    regions: { visible: true, locked: false, opacity: 1 },
    borders: { visible: true, locked: false, opacity: 1 },
    provinces: { visible: true, locked: false, opacity: 0.9 },
    rivers: { visible: true, locked: false, opacity: 1 },
    roads: { visible: true, locked: false, opacity: 1 },
    rail: { visible: true, locked: false, opacity: 1 },
    cities: { visible: true, locked: false, opacity: 1 },
    labels: { visible: true, locked: false, opacity: 1 },
  };
}

export function emptyDoc(name = 'Новый мир'): MapDoc {
  return {
    version: 1,
    meta: { name, width: 2400, height: 1600 },
    style: { ...DEFAULT_STYLE },
    layers: defaultLayers(),
    features: [],
  };
}

/* ---------------------------------------------------------------- утилиты */

export const PATH_DEFAULT_COLORS: Record<PathKind, string> = {
  road: '#94663f',
  rail: '#3a3630',
  river: '#5687a6',
  sea: '#4a7ba3',
  border: '#4a3f63',
  province: '#7f7499',
};

export const PATH_DEFAULT_WIDTH: Record<PathKind, number> = {
  road: 2.2,
  rail: 2.4,
  river: 4,
  sea: 2.4,
  border: 2.4,
  province: 1,
};

export const CITY_DEFAULT_SIZE: Record<CityType, number> = {
  capital: 1.5,
  city: 1.1,
  town: 0.9,
  village: 0.75,
  poi: 0.8,
};

export const CITY_DEFAULT_LABEL: Record<CityType, number> = {
  capital: 26,
  city: 21,
  town: 17,
  village: 14,
  poi: 13,
};

let idCounter = 0;
export function newId(prefix = 'f'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * Приводит старый документ к текущей модели. Троп как типа больше нет —
 * такие линии становятся обычными дорогами, чтобы ничего не потерялось.
 */
export function migrateDoc(doc: MapDoc): MapDoc {
  for (const f of doc.features) {
    if (f.kind !== 'path') continue;
    if ((f.pathKind as string) !== 'trail') continue;
    f.pathKind = 'road';
    if (!f.name || f.name === 'Тропа' || f.name === 'Новая тропа') f.name = 'Дорога';
  }
  return doc;
}
