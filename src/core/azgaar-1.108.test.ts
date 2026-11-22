import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importAzgaarMap } from './azgaar';

/**
 * Регрессия на карту, сохранённую Azgaar 1.108 (файл пользователя).
 * Фикстура лежит вне репозитория — тест пропускается, если её нет.
 */
const fixture = path.resolve(process.cwd(), '.fixtures/user.map');
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)('карта Azgaar 1.108', () => {
  const result = hasFixture ? importAzgaarMap(fs.readFileSync(fixture, 'utf8')) : null;

  it('не затягивает в озёра чужие слои', () => {
    if (!result) return;
    const land = result.doc.features.filter((f) => f.kind === 'land');
    // в этом файле featurePaths содержит 12 контуров; до исправления групп
    // сюда попадали сотни путей из соседних слоёв
    expect(land.length).toBeGreaterThan(0);
    expect(land.length).toBeLessThan(60);
    expect(land.some((f) => f.kind === 'land' && f.hole)).toBe(true);
  });

  it('переносит реки, дороги и города', () => {
    if (!result) return;
    const paths = result.doc.features.filter((f) => f.kind === 'path' && f.kind === 'path');
    const rivers = paths.filter((p) => p.kind === 'path' && p.pathKind === 'river');
    const roads = paths.filter((p) => p.kind === 'path' && (p.pathKind === 'road'));
    const sea = paths.filter((p) => p.kind === 'path' && p.pathKind === 'sea');
    const cities = result.doc.features.filter((f) => f.kind === 'city');

    expect(rivers.length).toBeGreaterThan(100);
    expect(roads.length).toBeGreaterThan(100);
    expect(sea.length).toBeGreaterThan(0);
    expect(cities.length).toBeGreaterThan(500);
    // имена рек берутся из списка рек, а не «Река»
    expect(rivers.some((r) => r.kind === 'path' && r.name !== 'Река')).toBe(true);
  });

  it('не оставляет гигантских координат', () => {
    if (!result) return;
    for (const f of result.doc.features) {
      const points = f.kind === 'city' || f.kind === 'label' ? [f.pos] : f.points;
      for (const p of points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(Math.abs(p.x)).toBeLessThan(200000);
      }
    }
  });

  it('переносит население городов', () => {
    if (!result) return;
    const cities = result.doc.features.filter((f) => f.kind === 'city');
    const withPopulation = cities.filter(
      (c) => c.kind === 'city' && typeof c.population === 'number' && c.population > 0,
    );
    expect(withPopulation.length).toBeGreaterThan(cities.length * 0.9);

    // в файле Иштарра — крупный город: население должно быть в людях, а не в тысячах
    const capital = cities.find((c) => c.kind === 'city' && c.name === 'Иштарра');
    if (capital && capital.kind === 'city') {
      expect(capital.population).toBeGreaterThan(1000);
    }
  });
});
