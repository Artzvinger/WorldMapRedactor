import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importAzgaarMap } from './azgaar';

/**
 * Настоящий файл карты из репозитория Azgaar (tests/fixtures/1.154.0.map).
 * Фикстура не хранится в репозитории, поэтому тест пропускается, если её нет.
 */
const fixture = path.resolve(process.cwd(), '.fixtures/sample.map');
const hasFixture = fs.existsSync(fixture);

describe('импорт формата Azgaar', () => {
  it('понимает старый векторный формат с pack.cells', () => {
    const vertices = { p: [0, 0, 10, 0, 20, 0, 0, 10, 10, 10, 20, 10, 0, 20, 10, 20, 20, 20] };
    const cells = {
      v: [
        [0, 1, 4, 3],
        [1, 2, 5, 4],
        [3, 4, 7, 6],
        [4, 5, 8, 7],
      ],
      p: [4, 4, 16, 4, 4, 16, 16, 16],
      h: [30, 30, 30, 30],
      state: [1, 1, 0, 0],
      r: [0, 0, 0, 0],
      fl: [0, 0, 0, 0],
    };
    const text = JSON.stringify({
      info: { mapName: 'Синтетика' },
      pack: {
        cells,
        vertices,
        states: [{ i: 0 }, { i: 1, name: 'Королевство', color: '#aa8866' }],
        burgs: [{ i: 0 }, { i: 1, name: 'Столица', x: 5, y: 5, capital: true, population: 40 }],
        rivers: [],
        routes: [],
      },
    });
    const { doc } = importAzgaarMap(text);
    expect(doc.features.filter((f) => f.kind === 'land')).toHaveLength(1);
    expect(doc.features.filter((f) => f.kind === 'city')).toHaveLength(1);
  });

  it('ругается понятно, если это не карта', () => {
    expect(() => importAzgaarMap('{"foo":1}')).toThrow(/Azgaar|pack/i);
  });
});

describe.skipIf(!hasFixture)('настоящая карта Azgaar 1.154', () => {
  const text = hasFixture ? fs.readFileSync(fixture, 'utf8') : '';
  const result = hasFixture ? importAzgaarMap(text) : null;

  it('извлекает сушу, города, дороги и границы', () => {
    expect(result).not.toBeNull();
    if (!result) return;
    const { doc, report } = result;
    const land = doc.features.filter((f) => f.kind === 'land');
    const cities = doc.features.filter((f) => f.kind === 'city');
    const paths = doc.features.filter((f) => f.kind === 'path');

    expect(land.length).toBeGreaterThan(3);
    expect(land.some((f) => f.kind === 'land' && f.hole)).toBe(true);
    expect(cities.length).toBeGreaterThan(300);
    expect(cities.some((f) => f.kind === 'city' && f.type === 'capital')).toBe(true);
    expect(paths.filter((f) => f.kind === 'path' && f.pathKind === 'road').length).toBeGreaterThan(10);
    expect(paths.filter((f) => f.kind === 'path' && f.pathKind === 'border').length).toBeGreaterThan(1);
    expect(report.join(' ')).toContain('Города');
  });

  it('держит все точки внутри мира и не плодит гигантских координат', () => {
    if (!result) return;
    const { doc } = result;
    expect(doc.meta.width).toBeGreaterThan(2000);
    expect(doc.meta.width).toBeLessThan(3000);

    let bad = 0;
    let total = 0;
    for (const f of doc.features) {
      const points = f.kind === 'city' || f.kind === 'label' ? [f.pos] : f.points;
      for (const p of points) {
        total += 1;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad += 1;
        else if (Math.abs(p.x) > 200000 || Math.abs(p.y) > 200000) bad += 1;
      }
    }
    console.log('точек:', total, 'плохих:', bad, 'объектов:', doc.features.length);
    expect(bad).toBe(0);
  });
});
