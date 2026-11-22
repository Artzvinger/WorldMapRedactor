import fs from 'node:fs';
import nodePath from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { importAzgaarMap } from './azgaar';
import { useEditor } from './store';
import { buildWaterTest, findWaterPaths, waterShare } from './water';
import { emptyDoc, type LandFeature, type MapDoc, type PathFeature, type RegionFeature } from './types';

function landRect(x: number, y: number, w: number, h: number, hole = false): LandFeature {
  return {
    kind: 'land',
    id: `land-${x}-${y}-${hole}`,
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    hole,
  };
}

function path(points: [number, number][], pathKind: PathFeature['pathKind'] = 'road'): PathFeature {
  return {
    kind: 'path',
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Дорога',
    pathKind,
    points: points.map(([x, y]) => ({ x, y })),
    width: 3,
    smooth: false,
  };
}

function docWith(features: MapDoc['features']): MapDoc {
  return { ...emptyDoc('Вода'), features };
}

describe('определение воды', () => {
  it('различает сушу, море и озеро', () => {
    const doc = docWith([landRect(0, 0, 100, 100), landRect(40, 40, 20, 20, true)]);
    const isWater = buildWaterTest(doc);
    expect(isWater).not.toBeNull();
    if (!isWater) return;
    expect(isWater({ x: 10, y: 10 })).toBe(false); // суша
    expect(isWater({ x: 200, y: 200 })).toBe(true); // море
    expect(isWater({ x: 50, y: 50 })).toBe(true); // озеро внутри суши
  });

  it('без суши не берётся судить', () => {
    expect(buildWaterTest(docWith([]))).toBeNull();
  });

  it('считает долю точек на воде', () => {
    const doc = docWith([landRect(0, 0, 100, 100)]);
    const isWater = buildWaterTest(doc);
    if (!isWater) return;
    const half = [
      { x: 10, y: 10 },
      { x: 90, y: 90 },
      { x: 150, y: 150 },
      { x: 200, y: 200 },
    ];
    expect(waterShare(isWater, half)).toBeCloseTo(0.5);
  });
});

describe('перевод путей на воду', () => {
  beforeEach(() => {
    useEditor.getState().loadDoc(emptyDoc('Тест'));
  });

  it('переводит только линии, лежащие на воде', () => {
    const inside = path([
      [10, 10],
      [30, 30],
    ]);
    const inSea = path([
      [200, 200],
      [260, 240],
    ]);
    const inLake = path([
      [45, 45],
      [55, 55],
    ]);
    const coastal = path([
      [80, 80],
      [95, 95],
      [110, 110],
    ]); // 1 точка из 3 на воде — не трогаем
    const river = path(
      [
        [200, 200],
        [260, 240],
      ],
      'river',
    );

    const doc = docWith([landRect(0, 0, 100, 100), landRect(40, 40, 20, 20, true), inside, inSea, inLake, coastal, river]);
    useEditor.getState().loadDoc(doc);

    expect(findWaterPaths(doc).count).toBe(2);

    const converted = useEditor.getState().convertWaterPathsToSea();
    expect(converted).toBe(2);

    const byId = new Map(
      useEditor
        .getState()
        .doc.features.filter((f): f is PathFeature => f.kind === 'path')
        .map((f) => [f.id, f]),
    );
    expect(byId.get(inSea.id)?.pathKind).toBe('sea');
    expect(byId.get(inSea.id)?.name).toBe('Морской путь');
    expect(byId.get(inLake.id)?.pathKind).toBe('sea');
    expect(byId.get(inside.id)?.pathKind).toBe('road');
    expect(byId.get(coastal.id)?.pathKind).toBe('road');
    expect(byId.get(river.id)?.pathKind).toBe('river');

    useEditor.getState().undo();
    const afterUndo = useEditor
      .getState()
      .doc.features.filter((f): f is PathFeature => f.kind === 'path')
      .find((f) => f.id === inSea.id);
    expect(afterUndo?.pathKind).toBe('road');
  });
});

/* --------------------------------------------------- на настоящей карте */

const fixture = nodePath.resolve(process.cwd(), '.fixtures/user.map');
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)('водные пути на карте Azgaar', () => {
  it('находит морские трассы, ошибочно импортированные как дороги', () => {
    const { doc } = importAzgaarMap(fs.readFileSync(fixture, 'utf8'));
    // так выглядела карта до появления типа «морской путь»:
    // searoutes приходили обычными дорогами
    const legacy = structuredClone(doc);
    let flipped = 0;
    for (const f of legacy.features) {
      if (f.kind === 'path' && f.pathKind === 'sea') {
        f.pathKind = 'road';
        flipped += 1;
      }
    }
    expect(flipped).toBeGreaterThan(50);

    const report = findWaterPaths(legacy);
    // почти все бывшие searoutes должны опознаться как вода
    expect(report.count).toBeGreaterThan(flipped * 0.9);

    useEditor.getState().loadDoc(legacy);
    const converted = useEditor.getState().convertWaterPathsToSea();
    expect(converted).toBe(report.count);

    const sea = useEditor
      .getState()
      .doc.features.filter((f): f is PathFeature => f.kind === 'path' && f.pathKind === 'sea');
    expect(sea.length).toBe(converted);
  }, 30000);
});

// заглушка, чтобы TS не ругался на неиспользуемый импорт
export type _Region = RegionFeature;
