import { shade } from './color';
import type { LandDab, MapDoc } from './types';

/**
 * Растровый слой кистей. Мазки хранятся крошечными объектами, а на экран
 * попадают через offscreen-канвы, которые дорисовываются только новыми
 * мазками — при рисовании это дешево даже на тысячи точек.
 *
 * Суша живёт в двух канвах: `edge` (кружки на ширину береговой линии больше,
 * тёмного цвета) и `fill` (обычные кружки цвета суши). Если нарисовать сначала
 * edge, а потом fill, видимой остаётся только внешняя кайма — это и есть
 * береговая линия нарисованной суши.
 *
 * Ширина каймы задана в экранных пикселях (как у полигонов суши: там stroke
 * рисуется толщиной 1.3 / zoom), поэтому при смене зума канву edge приходится
 * перерисовывать — но только её и только когда зум уехал заметно.
 */

const MAX_PX = 4096;
/** толщина береговой линии нарисованной суши в экранных пикселях */
const COAST_PX = 1.3;
/** во сколько раз должен измениться зум, чтобы перерисовать кайму */
const ZOOM_TOLERANCE = 0.2;

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
  /** сколько всего мазков уже разложено по канвам fill и water */
  drawn: number;
  /** сколько мазков обведено в канве edge */
  edgeDrawn: number;
  /** зум, при котором нарисована канва edge */
  edgeZoom: number;
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

export function paintCanvases(doc: MapDoc, extra: LandDab[], zoom = 1): PaintCanvases {
  const base = doc.paint ?? [];
  const total = base.length + extra.length;
  if (total === 0) return { fill: null, edge: null, water: null };

  const width = Math.max(1, doc.meta.width);
  const height = Math.max(1, doc.meta.height);
  const scale = Math.min(1, MAX_PX / Math.max(width, height));
  const landColor = doc.style.land;
  const waterColor = doc.style.water;
  const safeZoom = Math.max(0.01, zoom);

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
      edgeDrawn: 0,
      edgeZoom: safeZoom,
      width,
      height,
      landColor,
      waterColor,
    };
  }

  const dabAt = (i: number): LandDab | undefined => (i < base.length ? base[i] : extra[i - base.length]);
  const fillCtx = cache.fill.getContext('2d');
  const edgeCtx = cache.edge.getContext('2d');
  const waterCtx = cache.water.getContext('2d');
  const coast = shade(waterColor, -0.5);
  // кружки каймы на столько больше: ровно толщина линии в мировых единицах
  const edgeGrow = COAST_PX / safeZoom;

  // зум уехал — кайму перерисовываем целиком под новую толщину
  if (Math.abs(Math.log2(safeZoom / cache.edgeZoom)) > ZOOM_TOLERANCE) {
    cache.edgeZoom = safeZoom;
    cache.edgeDrawn = 0;
    edgeCtx?.clearRect(0, 0, cache.edge.width, cache.edge.height);
  }

  if (cache.drawn === 0) {
    fillCtx?.clearRect(0, 0, cache.fill.width, cache.fill.height);
    waterCtx?.clearRect(0, 0, cache.water.width, cache.water.height);
  }

  for (let i = cache.drawn; i < total; i++) {
    const dab = dabAt(i);
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

    if (fillCtx) {
      fillCtx.beginPath();
      fillCtx.arc(x, y, r, 0, Math.PI * 2);
      fillCtx.fillStyle = landColor;
      fillCtx.fill();
    }
  }
  cache.drawn = total;

  // кайма рисуется отдельным проходом: её толщина зависит от зума
  if (cache.edgeDrawn < total) {
    for (let i = cache.edgeDrawn; i < total; i++) {
      const dab = dabAt(i);
      if (!dab || dab.erase) continue;
      if (!edgeCtx) continue;
      const x = dab.x * cache.scale;
      const y = dab.y * cache.scale;
      const r = Math.max(0.6, dab.r * cache.scale);
      edgeCtx.beginPath();
      edgeCtx.arc(x, y, r + edgeGrow * cache.scale, 0, Math.PI * 2);
      edgeCtx.fillStyle = coast;
      edgeCtx.fill();
    }
    cache.edgeDrawn = total;
  }

  return { fill: cache.fill, edge: cache.edge, water: cache.water };
}
