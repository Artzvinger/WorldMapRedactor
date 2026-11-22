import {
  CITY_DEFAULT_LABEL,
  CITY_DEFAULT_SIZE,
  DEFAULT_STYLE,
  defaultLayers,
  type CityFeature,
  type CityType,
  type LabelFeature,
  type MapDoc,
  type PathFeature,
  type PathKind,
  type RegionFeature,
  type Vec2,
} from './types';

const W = 2400;
const H = 1600;

let seq = 0;
const uid = (p: string) => `${p}_demo_${(seq += 1)}`;

function city(name: string, x: number, y: number, type: CityType): CityFeature {
  return {
    kind: 'city',
    id: uid('city'),
    name,
    pos: { x, y },
    type,
    size: CITY_DEFAULT_SIZE[type],
    labelSize: CITY_DEFAULT_LABEL[type],
  };
}

function route(
  name: string,
  pathKind: PathKind,
  points: [number, number][],
  extra: Partial<PathFeature> = {},
): PathFeature {
  return {
    kind: 'path',
    id: uid('path'),
    name,
    pathKind,
    points: points.map(([x, y]) => ({ x, y }) as Vec2),
    width: pathKind === 'river' ? 7 : pathKind === 'rail' ? 2.6 : 3,
    smooth: true,
    ...extra,
  };
}

const COAST: [number, number][] = [
  [380, 620],
  [340, 520],
  [400, 430],
  [470, 340],
  [600, 290],
  [690, 210],
  [830, 190],
  [960, 150],
  [1100, 190],
  [1240, 150],
  [1380, 180],
  [1520, 160],
  [1680, 200],
  [1810, 270],
  [1930, 340],
  [2020, 470],
  [2040, 620],
  [2100, 730],
  [2060, 860],
  [1960, 950],
  [1900, 1080],
  [1780, 1180],
  [1650, 1270],
  [1500, 1330],
  [1320, 1300],
  [1180, 1360],
  [1020, 1330],
  [880, 1360],
  [740, 1300],
  [620, 1220],
  [520, 1130],
  [470, 1000],
  [400, 900],
  [370, 760],
];

export function demoDoc(): MapDoc {
  seq = 0;
  const capital = city('Велдрин', 1180, 700, 'capital');
  const east = city('Соль-Марис', 1660, 560, 'city');
  const west = city('Остхейвен', 760, 480, 'city');
  const south = city('Три-Ключа', 1060, 1040, 'town');
  const brod = city('Каменный Брод', 1500, 1010, 'town');
  const lisy = city('Лисий Лог', 620, 830, 'village');
  const mostki = city('Мостки', 1830, 760, 'village');
  const pass = city('Перевал Студёный', 1980, 420, 'poi');

  const roads: PathFeature[] = [
    route('Тракт Велдрин — Остхейвен', 'road', [
      [1180, 700],
      [1080, 640],
      [950, 560],
      [830, 500],
      [760, 480],
    ]),
    route('Соляной тракт', 'road', [
      [1180, 700],
      [1320, 660],
      [1480, 610],
      [1660, 560],
    ]),
    route('Южный тракт', 'road', [
      [1180, 700],
      [1140, 820],
      [1090, 930],
      [1060, 1040],
    ]),
    route('Бродский тракт', 'road', [
      [1060, 1040],
      [1200, 1050],
      [1360, 1030],
      [1500, 1010],
    ]),
    route('Просёлок к Лисьему Логу', 'road', [
      [760, 480],
      [700, 620],
      [650, 730],
      [620, 830],
    ]),
    route('Просёлок к Мосткам', 'road', [
      [1660, 560],
      [1740, 650],
      [1800, 710],
      [1830, 760],
    ]),
    route('Дорога в перевал', 'road', [
      [1660, 560],
      [1800, 500],
      [1900, 450],
      [1980, 420],
    ]),
  ];

  const rails: PathFeature[] = [
    route('Северная железная дорога', 'rail', [
      [760, 480],
      [920, 430],
      [1080, 470],
      [1180, 560],
      [1180, 700],
    ]),
    route('Юго-восточная ветка', 'rail', [
      [1180, 700],
      [1300, 790],
      [1420, 880],
      [1500, 1010],
    ]),
  ];

  const seaRoutes: PathFeature[] = [
    route(
      'Южный торговый путь',
      'sea',
      [
        [1180, 1520],
        [1420, 1560],
        [1680, 1520],
        [1900, 1420],
      ],
      { width: 3 },
    ),
  ];

  const rivers: PathFeature[] = [
    route('Река Студёная', 'river', [
      [1960, 430],
      [1800, 520],
      [1620, 600],
      [1440, 640],
      [1300, 660],
      [1180, 700],
      [1120, 800],
      [1080, 900],
      [1000, 980],
      [900, 1060],
      [800, 1130],
      [700, 1180],
      [600, 1220],
    ]),
    route('Ручей Лисьий', 'river', [
      [900, 480],
      [860, 600],
      [790, 720],
      [700, 800],
      [620, 830],
    ]),
  ];

  const regions: RegionFeature[] = [
    {
      kind: 'region',
      id: uid('region'),
      name: 'Тёмный Лес',
      points: [
        { x: 880, y: 300 },
        { x: 1060, y: 270 },
        { x: 1180, y: 330 },
        { x: 1230, y: 440 },
        { x: 1150, y: 520 },
        { x: 1000, y: 540 },
        { x: 880, y: 470 },
        { x: 840, y: 370 },
      ],
      fill: '#5d7f4a',
      stroke: '#3f5c33',
      opacity: 0.42,
      strokeWidth: 2,
      smooth: true,
    },
    {
      kind: 'region',
      id: uid('region'),
      name: 'Соляные болота',
      points: [
        { x: 1620, y: 900 },
        { x: 1780, y: 880 },
        { x: 1900, y: 960 },
        { x: 1880, y: 1120 },
        { x: 1720, y: 1180 },
        { x: 1580, y: 1100 },
        { x: 1560, y: 980 },
      ],
      fill: '#6f8f7d',
      stroke: '#4c6a5b',
      opacity: 0.34,
      strokeWidth: 2,
      smooth: true,
    },
    {
      kind: 'region',
      id: uid('region'),
      name: 'Королевство Велдрин',
      points: [
        { x: 820, y: 470 },
        { x: 940, y: 430 },
        { x: 1010, y: 500 },
        { x: 1090, y: 455 },
        { x: 1170, y: 520 },
        { x: 1250, y: 470 },
        { x: 1330, y: 530 },
        { x: 1300, y: 620 },
        { x: 1380, y: 660 },
        { x: 1330, y: 760 },
        { x: 1400, y: 830 },
        { x: 1300, y: 900 },
        { x: 1200, y: 860 },
        { x: 1120, y: 920 },
        { x: 1030, y: 880 },
        { x: 960, y: 930 },
        { x: 900, y: 840 },
        { x: 860, y: 740 },
        { x: 800, y: 650 },
        { x: 830, y: 560 },
      ],
      fill: '#b98f5a',
      stroke: '#8a6b3a',
      opacity: 0.2,
      strokeWidth: 2.4,
      smooth: false,
    },
  ];

  const labels: LabelFeature[] = [
    {
      kind: 'label',
      id: uid('label'),
      name: 'Море Туманов',
      text: 'Море Туманов',
      pos: { x: 1600, y: 1450 },
      size: 46,
      rotation: -4,
      color: '#2f4a5c',
    },
    {
      kind: 'label',
      id: uid('label'),
      name: 'Пустошь',
      text: 'Студёные горы',
      pos: { x: 1700, y: 350 },
      size: 34,
      rotation: 8,
      color: '#4a4034',
    },
  ];

  return {
    version: 1,
    meta: { name: 'Демо: Велдрин', width: W, height: H },
    style: { ...DEFAULT_STYLE },
    layers: defaultLayers(),
    features: [
      { kind: 'land', id: uid('land'), points: COAST.map(([x, y]) => ({ x, y })) },
      ...regions,
      ...rivers,
      ...roads,
      ...rails,
      ...seaRoutes,
      ...labels,
      capital,
      east,
      west,
      south,
      brod,
      lisy,
      mostki,
      pass,
    ],
  };
}
