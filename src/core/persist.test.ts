import { describe, expect, it } from 'vitest';
import { demoDoc } from './demo';
import { parseDoc, serializeDoc } from './persist';
import { emptyDoc, migrateDoc, type MapDoc, type PathFeature } from './types';

describe('файл проекта', () => {
  it('сохраняет и читает карту без потерь', () => {
    const doc = demoDoc();
    const restored = parseDoc(serializeDoc(doc));
    expect(restored.meta).toEqual(doc.meta);
    expect(restored.style).toEqual(doc.style);
    expect(restored.features).toEqual(doc.features);
  });

  it('превращает старые тропы в дороги при загрузке файла', () => {
    const doc = emptyDoc('Старое');
    const trail = {
      kind: 'path',
      id: 't1',
      name: 'Тропа',
      pathKind: 'trail',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      width: 2,
      smooth: false,
    } as unknown as PathFeature;
    (doc as MapDoc).features.push(trail);

    const restored = parseDoc(serializeDoc(doc));
    const path = restored.features.find((f): f is PathFeature => f.kind === 'path');
    expect(path?.pathKind).toBe('road');
    expect(path?.name).toBe('Дорога');
  });

  it('migrateDoc не трогает остальные линии', () => {
    const doc = emptyDoc('Смесь');
    doc.features.push(
      { kind: 'path', id: 'a', name: 'Река', pathKind: 'river', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 4, smooth: true },
      { kind: 'path', id: 'b', name: 'ЖД', pathKind: 'rail', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 2, smooth: true },
    );
    const out = migrateDoc(doc);
    expect(out.features.map((f) => (f.kind === 'path' ? f.pathKind : ''))).toEqual(['river', 'rail']);
  });

  it('не падает на пустой карте', () => {
    const restored = parseDoc(serializeDoc(emptyDoc('Пусто')));
    expect(restored.features).toHaveLength(0);
    expect(restored.meta.name).toBe('Пусто');
  });

  it('дополняет недостающие слои значениями по умолчанию', () => {
    const doc = emptyDoc('Тест');
    const stripped = JSON.parse(serializeDoc(doc)) as Record<string, unknown>;
    delete stripped.layers;
    const restored = parseDoc(JSON.stringify(stripped));
    expect(restored.layers.cities.visible).toBe(true);
  });

  it('отказывается открывать чужие файлы', () => {
    expect(() => parseDoc('{"nope":1}')).toThrow();
  });
});
