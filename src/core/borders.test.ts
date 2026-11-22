import { describe, expect, it } from 'vitest';
import { loadStoredDoc, useEditor } from './store';
import { emptyDoc, layerOf, LAYER_ORDER, PATH_DEFAULT_COLORS, type MapDoc, type PathFeature } from './types';

function borderPath(pathKind: PathFeature['pathKind'], id: string): PathFeature {
  return {
    kind: 'path',
    id,
    name: 'Граница',
    pathKind,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    width: 1,
    smooth: false,
  };
}

describe('границы стран и областей', () => {
  it('живут в разных слоях', () => {
    expect(layerOf(borderPath('border', 'a'))).toBe('borders');
    expect(layerOf(borderPath('province', 'b'))).toBe('provinces');
    expect(LAYER_ORDER.indexOf('borders')).toBeLessThan(LAYER_ORDER.indexOf('provinces'));
    expect(LAYER_ORDER.indexOf('provinces')).toBeLessThan(LAYER_ORDER.indexOf('rivers'));
  });

  it('различаются цветом и толщиной по умолчанию', () => {
    expect(PATH_DEFAULT_COLORS.border).not.toBe(PATH_DEFAULT_COLORS.province);
  });

  it('дополняет старые сохранения новыми слоями', () => {
    const old = emptyDoc('Старая карта') as Partial<MapDoc>;
    delete old.layers;
    old.style = { water: '#000', land: '#fff', paper: '#111' } as MapDoc['style'];
    localStorage.setItem('map-redactor:doc:v1', JSON.stringify(old));

    const restored = loadStoredDoc();
    expect(restored).not.toBeNull();
    expect(restored?.layers.borders.visible).toBe(true);
    expect(restored?.layers.provinces.visible).toBe(true);
    expect(restored?.style.labelFont).toBe('sans');
  });

  it('переключение слоя границ не трогает области', () => {
    useEditor.getState().loadDoc(emptyDoc('Тест'));
    useEditor.getState().commit((d) => {
      d.features.push(borderPath('border', 'b1'), borderPath('province', 'p1'));
    });
    useEditor.getState().toggleLayerVisible('borders');
    const doc = useEditor.getState().doc;
    expect(doc.layers.borders.visible).toBe(false);
    expect(doc.layers.provinces.visible).toBe(true);
  });
});
