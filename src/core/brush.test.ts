import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './store';
import { emptyDoc, migrateDoc, type MapDoc } from './types';

beforeEach(() => {
  useEditor.getState().loadDoc(emptyDoc('Кисти'));
  useEditor.getState().setBrushRadius(40);
  // тесты про шаг и радиусы считаем на ровной кисти, неровность проверяем отдельно
  useEditor.getState().setBrushNoise(0);
});

describe('кисти суши и воды', () => {
  it('штрих появляется только после отпускания мыши', () => {
    const store = useEditor.getState();
    store.beginStroke(false, { x: 100, y: 100 });
    expect(useEditor.getState().stroke).toHaveLength(1);
    expect(useEditor.getState().doc.paint).toHaveLength(0);

    useEditor.getState().extendStroke({ x: 200, y: 100 });
    expect(useEditor.getState().doc.paint).toHaveLength(0);

    const dabs = useEditor.getState().stroke ?? [];
    useEditor.getState().endStroke();
    expect(useEditor.getState().stroke).toBeNull();
    expect(useEditor.getState().doc.paint).toHaveLength(dabs.length);
  });

  it('мазки идут с шагом и не оставляют дыр', () => {
    useEditor.getState().beginStroke(false, { x: 0, y: 0 });
    useEditor.getState().extendStroke({ x: 100, y: 0 });
    const dabs = useEditor.getState().stroke ?? [];

    // радиус 40, шаг 12 — на 100 единиц выходит около 9 мазков
    expect(dabs.length).toBeGreaterThanOrEqual(8);
    expect(dabs.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < dabs.length; i++) {
      const dx = dabs[i].x - dabs[i - 1].x;
      expect(Math.abs(dx)).toBeLessThan(dabs[i].r);
    }
  });

  it('кисть воды ставит мазки-стирания', () => {
    useEditor.getState().beginStroke(true, { x: 50, y: 50 });
    useEditor.getState().endStroke();
    const [dab] = useEditor.getState().doc.paint;
    expect(dab.erase).toBe(true);
    expect(dab.r).toBe(40);
  });

  it('штрих отменяется одним движением', () => {
    useEditor.getState().beginStroke(false, { x: 0, y: 0 });
    useEditor.getState().extendStroke({ x: 300, y: 0 });
    useEditor.getState().endStroke();
    const count = useEditor.getState().doc.paint.length;
    expect(count).toBeGreaterThan(10);

    useEditor.getState().undo();
    expect(useEditor.getState().doc.paint).toHaveLength(0);

    useEditor.getState().redo();
    expect(useEditor.getState().doc.paint).toHaveLength(count);
  });

  it('радиус кисти ограничен разумными рамками', () => {
    useEditor.getState().setBrushRadius(1);
    expect(useEditor.getState().brushRadius).toBeGreaterThanOrEqual(3);
    useEditor.getState().setBrushRadius(9999);
    expect(useEditor.getState().brushRadius).toBeLessThanOrEqual(400);
  });

  it('старый документ без мазков мигрирует', () => {
    const doc = emptyDoc('Старое') as Partial<MapDoc>;
    delete doc.paint;
    expect(migrateDoc(doc as MapDoc).paint).toEqual([]);
  });
});

describe('неровность края кисти', () => {
  it('при нуле мазок остаётся ровным кругом', () => {
    useEditor.getState().beginStroke(false, { x: 10, y: 10 });
    const dabs = useEditor.getState().stroke ?? [];
    expect(dabs).toHaveLength(1);
    expect(dabs[0]).toEqual({ x: 10, y: 10, r: 40, erase: false });
  });

  it('чем больше неровность, тем больше кружков в мазке', () => {
    const countFor = (noise: number) => {
      useEditor.getState().setBrushNoise(noise);
      useEditor.getState().beginStroke(false, { x: 10, y: 10 });
      const n = (useEditor.getState().stroke ?? []).length;
      useEditor.getState().endStroke();
      useEditor.getState().undo();
      return n;
    };
    expect(countFor(0)).toBe(1);
    expect(countFor(0.5)).toBeGreaterThan(1);
    expect(countFor(1)).toBeGreaterThan(countFor(0.5));
  });

  it('кружки не вылезают далеко за радиус кисти', () => {
    useEditor.getState().setBrushNoise(1);
    useEditor.getState().beginStroke(false, { x: 0, y: 0 });
    const dabs = useEditor.getState().stroke ?? [];
    for (const dab of dabs) {
      expect(dab.r).toBeLessThanOrEqual(40 + 0.001);
      expect(dab.r).toBeGreaterThan(0);
      // смещение плюс радиус — не дальше полутора радиусов от центра
      expect(Math.hypot(dab.x, dab.y) + dab.r).toBeLessThan(40 * 1.6);
    }
  });

  it('неровность запоминается на весь штрих', () => {
    useEditor.getState().setBrushNoise(0);
    useEditor.getState().beginStroke(false, { x: 0, y: 0 });
    useEditor.getState().setBrushNoise(1); // поменяли посреди штриха
    useEditor.getState().extendStroke({ x: 200, y: 0 });
    const dabs = useEditor.getState().stroke ?? [];
    // штрих начался ровным — добавленные точки тоже ровные
    expect(dabs.every((d) => d.r === 40)).toBe(true);
  });
});
