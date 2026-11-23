import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './store';
import { emptyDoc, migrateDoc, type MapDoc } from './types';

beforeEach(() => {
  useEditor.getState().loadDoc(emptyDoc('Кисти'));
  useEditor.getState().setBrushRadius(40);
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
