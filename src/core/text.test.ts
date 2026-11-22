import { describe, expect, it } from 'vitest';
import {
  countLatinNamed,
  featureLabelText,
  formatPopulation,
  isCyrillicOnly,
  isLatinOnly,
  parsePopulation,
} from './text';
import type { CityFeature, Feature, LabelFeature } from './types';

const city = (name: string): CityFeature => ({
  kind: 'city',
  id: `c-${name}`,
  name,
  pos: { x: 0, y: 0 },
  type: 'town',
  size: 1,
  labelSize: 14,
});

const label = (text: string): LabelFeature => ({
  kind: 'label',
  id: `l-${text}`,
  name: text,
  text,
  pos: { x: 0, y: 0 },
  size: 20,
  rotation: 0,
  color: '#000',
});

describe('язык подписей', () => {
  it('отличает латиницу от кириллицы', () => {
    expect(isLatinOnly('Rheingen')).toBe(true);
    expect(isLatinOnly('Laden-nivis')).toBe(true);
    expect(isLatinOnly('Иштарра')).toBe(false);
    expect(isLatinOnly('Аннароз (Фортпард)')).toBe(false);
    expect(isLatinOnly('')).toBe(false);
    expect(isLatinOnly('123')).toBe(false);
  });

  it('смешанное название не считается латиницей', () => {
    expect(isLatinOnly('New Велдрин')).toBe(false);
    expect(isCyrillicOnly('New Велдрин')).toBe(false);
  });

  it('берёт текст подписи, а не имя объекта', () => {
    const f = label('Mare Tenebrarum');
    expect(featureLabelText(f)).toBe('Mare Tenebrarum');
    expect(featureLabelText(city('Велдрин'))).toBe('Велдрин');
  });

  it('считает только города и подписи', () => {
    const features: Feature[] = [
      city('Rheingen'),
      city('Иштарра'),
      label('MARE TENEBRARUM'),
      label('МОРЕ ТУМАНОВ'),
      { kind: 'region', id: 'r1', name: 'Nordland', points: [], fill: '#fff', stroke: '#000', opacity: 1, strokeWidth: 1, smooth: false },
    ];
    expect(countLatinNamed(features)).toBe(2);
  });
});

describe('население', () => {
  it('показывает число с разделителем разрядов', () => {
    // ru-RU разделяет разряды неразрывным пробелом
    expect(formatPopulation(60633)).toMatch(/^60\s633$/);
    expect(formatPopulation(1200)).toMatch(/^1\s200$/);
    expect(formatPopulation(undefined)).toBe('');
  });

  it('разбирает обратно и «60 633», и «60633»', () => {
    expect(parsePopulation('60 633')).toBe(60633);
    expect(parsePopulation('60633')).toBe(60633);
    expect(parsePopulation('')).toBeUndefined();
    expect(parsePopulation('abc')).toBeUndefined();
  });
});
