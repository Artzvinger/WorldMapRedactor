import { beforeEach, describe, expect, it } from 'vitest';
import { cityLabelBox, cityRadius, hitTest } from './query';
import { useEditor } from './store';
import { DEFAULT_STYLE, emptyDoc, type CityFeature, type MapDoc } from './types';

function city(overrides: Partial<CityFeature> = {}): CityFeature {
  return {
    kind: 'city',
    id: 'c1',
    name: 'Велдрин',
    pos: { x: 100, y: 100 },
    type: 'city',
    size: 1,
    labelSize: 20,
    ...overrides,
  };
}

function docWith(features: MapDoc['features'], iconScale?: number): MapDoc {
  const base = emptyDoc('Иконки');
  return {
    ...base,
    style: { ...DEFAULT_STYLE, ...(iconScale === undefined ? {} : { iconScale }) },
    features,
  };
}

beforeEach(() => {
  useEditor.getState().loadDoc(emptyDoc('Тест'));
});

describe('масштаб значков городов', () => {
  it('радиус значка умножается на общий коэффициент', () => {
    const c = city();
    expect(cityRadius(c, 1)).toBeCloseTo(10);
    expect(cityRadius(c, 0.5)).toBeCloseTo(5);
    expect(cityRadius(c, 1.5)).toBeCloseTo(15);
  });

  it('попадание по значку считается с учётом коэффициента', () => {
    const c = city();
    // точка в 9 единицах от центра: при полном значке попадает, при уменьшенном — нет
    expect(hitTest(docWith([c], 1), { x: 109, y: 100 }, 0)).toBeTruthy();
    expect(hitTest(docWith([c], 0.5), { x: 109, y: 100 }, 0)).toBeNull();
  });

  it('подпись прижимается ближе к уменьшенному значку', () => {
    const c = city();
    const full = cityLabelBox(c, 'bottom', 1, 1);
    const small = cityLabelBox(c, 'bottom', 1, 0.5);
    expect(small.minY).toBeLessThan(full.minY);
  });

  it('по умолчанию значки чуть уменьшены', () => {
    expect(DEFAULT_STYLE.iconScale).toBeLessThan(1);
    expect(DEFAULT_STYLE.iconScale).toBeGreaterThan(0.5);
  });
});
