import type { LandDab, MapDoc } from './types';

/**
 * Растровый слой кистей: мазки хранятся крошечными объектами, а на экран
 * попадают через одну offscreen-канву. Канва перерисовывается только на
 * новые мазки — при рисовании это дешево даже на тысячи точек.
 */

const MAX_PX = 4096;

interface PaintCache {
  canvas: HTMLCanvasElement;
  scale: number;
  drawn: number;
  width: number;
  height: number;
  land: string;
  water: string;
}

let cache: PaintCache | null = null;

export function resetPaintCache(): void {
  cache = null;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

export function paintCanvas(doc: MapDoc, extra: LandDab[]): HTMLCanvasElement | null {
  const base = doc.paint ?? [];
  const total = base.length + extra.length;
  if (total === 0) return null;

  const width = Math.max(1, doc.meta.width);
  const height = Math.max(1, doc.meta.height);
  const scale = Math.min(1, MAX_PX / Math.max(width, height));
  const land = doc.style.land;
  const water = doc.style.water;

  if (
    !cache ||
    cache.width !== width ||
    cache.height !== height ||
    cache.land !== land ||
    cache.water !== water ||
    total < cache.drawn
  ) {
    cache = {
      canvas: makeCanvas(width * scale, height * scale),
      scale,
      drawn: 0,
      width,
      height,
      land,
      water,
    };
  }

  if (total === cache.drawn) return cache.canvas;

  const ctx = cache.canvas.getContext('2d');
  if (!ctx) return cache.canvas;

  if (cache.drawn === 0) ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);

  const dabAt = (i: number): LandDab | undefined => (i < base.length ? base[i] : extra[i - base.length]);

  for (let i = cache.drawn; i < total; i++) {
    const dab = dabAt(i);
    if (!dab) continue;
    ctx.beginPath();
    ctx.arc(dab.x * cache.scale, dab.y * cache.scale, Math.max(0.6, dab.r * cache.scale), 0, Math.PI * 2);
    ctx.fillStyle = dab.erase ? water : land;
    ctx.fill();
  }

  cache.drawn = total;
  return cache.canvas;
}
