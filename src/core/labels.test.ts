import { beforeEach, describe, expect, it } from 'vitest';
import { cityLabelAnchor, cityLabelBox } from './query';
import { useEditor } from './store';
import { emptyDoc, type CityFeature, type LabelSide } from './types';

function makeCity(x: number, y: number, overrides: Partial<CityFeature> = {}): CityFeature {
  return {
    kind: 'city',
    id: `c-${x}-${y}`,
    name: 'Город',
    pos: { x, y },
    type: 'town',
    size: 1,
    labelSize: 20,
    ...overrides,
  };
}

beforeEach(() => {
  useEditor.getState().loadDoc(emptyDoc('Тест'));
});

describe('сторона подписи', () => {
  it('ставит подпись с выбранной стороны от значка', () => {
    const city = makeCity(100, 100);
    const bottom = cityLabelAnchor(city, 'bottom');
    const top = cityLabelAnchor(city, 'top');
    const left = cityLabelAnchor(city, 'left');
    const right = cityLabelAnchor(city, 'right');

    expect(bottom.y).toBeGreaterThan(100);
    expect(bottom.baseline).toBe('top');
    expect(top.y).toBeLessThan(100);
    expect(top.baseline).toBe('bottom');
    expect(left.x).toBeLessThan(100);
    expect(left.align).toBe('right');
    expect(right.x).toBeGreaterThan(100);
    expect(right.align).toBe('left');
  });

  it('считает прямоугольник с правильной стороны', () => {
    const city = makeCity(100, 100);
    const bottom = cityLabelBox(city, 'bottom');
    expect(bottom.minY).toBeGreaterThan(100);

    const top = cityLabelBox(city, 'top');
    expect(top.maxY).toBeLessThan(100);

    const right = cityLabelBox(city, 'right');
    expect(right.minX).toBeGreaterThan(100);

    const left = cityLabelBox(city, 'left');
    expect(left.maxX).toBeLessThan(100);
  });

  it('по умолчанию подпись снизу', () => {
    const city = makeCity(100, 100);
    expect(cityLabelAnchor(city).baseline).toBe('top');
    expect(cityLabelAnchor(city).y).toBeGreaterThan(100);
  });

  it('масштаб уменьшает и кегль, и отступ', () => {
    const city = makeCity(100, 100);
    const full = cityLabelBox(city, 'bottom', 1);
    const small = cityLabelBox(city, 'bottom', 0.6);

    expect(small.maxY - small.minY).toBeLessThan(full.maxY - full.minY);
    expect(small.maxX - small.minX).toBeLessThan(full.maxX - full.minX);
    // подпись прижимается ближе к значку
    expect(small.minY).toBeLessThan(full.minY);
  });
});

describe('авторасстановка подписей', () => {
  it('разводит близкие города по разным сторонам', () => {
    const store = useEditor.getState();
    store.addCity({ x: 500, y: 500 });
    store.addCity({ x: 512, y: 504 });
    store.addCity({ x: 506, y: 516 });

    const changed = useEditor.getState().autoPlaceCityLabels();
    expect(changed).toBeGreaterThan(0);

    const sides = useEditor
      .getState()
      .doc.features.filter((f): f is CityFeature => f.kind === 'city')
      .map((c) => c.labelSide ?? 'bottom');
    expect(new Set<LabelSide>(sides).size).toBeGreaterThan(1);
  });

  it('далеко стоящие города оставляет снизу', () => {
    const store = useEditor.getState();
    store.addCity({ x: 100, y: 100 });
    store.addCity({ x: 1800, y: 1200 });

    expect(useEditor.getState().autoPlaceCityLabels()).toBe(0);
    const sides = useEditor
      .getState()
      .doc.features.filter((f): f is CityFeature => f.kind === 'city')
      .map((c) => c.labelSide ?? 'bottom');
    expect(sides).toEqual(['bottom', 'bottom']);
  });

  it('отменяется одной операцией', () => {
    const store = useEditor.getState();
    store.addCity({ x: 300, y: 300 });
    store.addCity({ x: 308, y: 302 });
    const before = useEditor
      .getState()
      .doc.features.filter((f): f is CityFeature => f.kind === 'city')
      .map((c) => c.labelSide ?? 'bottom');

    useEditor.getState().autoPlaceCityLabels();
    useEditor.getState().undo();

    const after = useEditor
      .getState()
      .doc.features.filter((f): f is CityFeature => f.kind === 'city')
      .map((c) => c.labelSide ?? 'bottom');
    expect(after).toEqual(before);
  });
});
