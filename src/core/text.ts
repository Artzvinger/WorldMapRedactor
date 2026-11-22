import type { Feature } from './types';

const CYRILLIC = /[А-Яа-яЁё]/;
const LATIN = /[A-Za-z]/;
const LETTER = /[A-Za-zА-Яа-яЁё]/g;

/** Название целиком латиницей (цифры и знаки не мешают). */
export function isLatinOnly(value: string): boolean {
  const letters = value.match(LETTER);
  if (!letters || letters.length === 0) return false;
  return letters.every((letter) => LATIN.test(letter));
}

/** Название целиком кириллицей. */
export function isCyrillicOnly(value: string): boolean {
  const letters = value.match(LETTER);
  if (!letters || letters.length === 0) return false;
  return letters.every((letter) => CYRILLIC.test(letter));
}

/** Подпись объекта: у подписи это текст, у остальных — имя. */
export function featureLabelText(f: Feature): string {
  if (f.kind === 'label') return f.text || f.name;
  if (f.kind === 'land') return '';
  return f.name;
}

/** Объекты, у которых есть подпись на карте. */
export function hasVisibleLabel(f: Feature): boolean {
  return f.kind === 'city' || f.kind === 'label';
}

export function countLatinNamed(features: Feature[]): number {
  return features.filter((f) => hasVisibleLabel(f) && isLatinOnly(featureLabelText(f))).length;
}

/** 60633 → «60 633». */
export function formatPopulation(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return Math.round(value).toLocaleString('ru-RU');
}

/** Разбирает «60 633» и «60633» обратно в число. */
export function parsePopulation(text: string): number | undefined {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
