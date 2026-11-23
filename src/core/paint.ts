import { shade } from './color';
import type { LandDab, MapDoc } from './types';

/**
 * Растровый слой кистей. Мазки хранятся крошечными объектами, а на экран
 * попадают через offscreen-канвы, которые дорисовываются только новыми
 * мазками — при рисовании это дешево даже на тысячи точек.
 *
 * Суша живёт в двух канвах: `edge` (кружки на пару единиц больше, тёмного
 * цвета) и `fill` (обычные кружки цвета суши). Если нарисовать сначала edge,
 * а потом fill, видимой остаётся только внешняя кайма — это и есть
 * береговая линия нарисованной суши. Вода — отдельная канва, её рисуем
 * поверх полигонов, чтобы кисть воды закрашивала импортированный берег.
 */

const MAX_PX = 4096;
/** толщина контура нарисованной суши в мировых единицах */
const EDGE_W = 2;

export interface PaintCanvases {
  fill: HTMLCanvasElement | null;
  edge: HTMLCanvasElement | null;
  water: HTMLCanvasElement | null;
}

interface PaintCache {
  fill: HTMLCanvasElement;
  edge: HTMLCanvasElement;
  water: HTMLCanvasElement;
  scale: number;
  drawn: number;
  width: number;
  height: number;
  landColor: string;
  waterColor: string;
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

export function paintCanvases(doc: MapDoc, extra: LandDab[]): PaintCanvases {
  const base = doc.paint ?? [];
  const total = base.length + extra.length;
  if (total === 0) return { fill: null, edge: null, water: null };

  const width = Math.max(1, doc.meta.width);
  const height = Math.max(1, doc.meta.height);
  const scale = Math.min(1, MAX_PX / Math.max(width, height));
  const landColor = doc.style.land;
  const waterColor = doc.style.water;

  if (
    !cache ||
    cache.width !== width ||
    cache.height !== height ||
    cache.landColor !== landColor ||
    cache.waterColor !== waterColor ||
    total < cache.drawn
  ) {
    cache = {
      fill: makeCanvas(width * scale, height * scale),
      edge: makeCanvas(width * scale, height * scale),
      water: makeCanvas(width * scale, height * scale),
      scale,
      drawn: 0,
      width,
      height,
      landColor,
      waterColor,
    };
  }

  if (total === cache.drawn) return { fill: cache.fill, edge: cache.edge, water: cache.water };

  if (cache.drawn === 0) {
    for (const canvas of [cache.fill, cache.edge, cache.water]) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  const fillCtx = cache.fill.getContext('2d');
  const edgeCtx = cache.edge.getContext('2d');
  const waterCtx = cache.water.getContext('2d');
  const coast = shade(waterColor, -0.5);

  for (let i = cache.drawn; i < total; i++) {
    const dab = i < base.length ? base[i] : extra[i - base.length];
    if (!dab) continue;
    const x = dab.x * cache.scale;
    const y = dab.y * cache.scale;
    const r = Math.max(0.6, dab.r * cache.scale);

    if (dab.erase) {
      if (!waterCtx) continue;
      waterCtx.beginPath();
      waterCtx.arc(x, y, r, 0, Math.PI * 2);
      waterCtx.fillStyle = waterColor;
      waterCtx.fill();
      continue;
    }

    // сначала кайма, потом заливка: край остаётся резким
    if (edgeCtx) {
      edgeCtx.beginPath();
      edgeCtx.arc(x, y, r + EDGE_W * cache.scale, 0, Math.PI * 2);
      edgeCtx.fillStyle = coast;
      edgeCtx.fill();
    }
    if (fillCtx) {
      fillCtx.beginPath();
      fillCtx.arc(x, y, r, 0, Math.PI * 2);
      fillCtx.fillStyle = landColor;
      fillCtx.fill();
    }
  }

  cache.drawn = total;
  return { fill: cache.fill, edge: cache.edge, water: cache.water };
}
