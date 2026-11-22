/** Цветовые утилиты: осветление и затемнение hex-цветов. */

export function shade(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (full.length !== 6) return hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (v: number) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  return `#${[mix(r), mix(g), mix(b)]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
    .join('')}`;
}
