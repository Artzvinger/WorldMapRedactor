import type { Vec2 } from './types';
import { clamp } from './geometry';

/** Экран = мир * zoom + offset. */
export interface Camera {
  ox: number;
  oy: number;
  zoom: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 80;

export function toScreen(cam: Camera, p: Vec2): Vec2 {
  return { x: p.x * cam.zoom + cam.ox, y: p.y * cam.zoom + cam.oy };
}

export function toWorld(cam: Camera, p: Vec2): Vec2 {
  return { x: (p.x - cam.ox) / cam.zoom, y: (p.y - cam.oy) / cam.zoom };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, ox: cam.ox + dx, oy: cam.oy + dy };
}

export function zoomAtScreen(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const k = zoom / cam.zoom;
  return {
    zoom,
    ox: sx - (sx - cam.ox) * k,
    oy: sy - (sy - cam.oy) * k,
  };
}

export function fitCamera(
  worldWidth: number,
  worldHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 48,
): Camera {
  const availW = Math.max(64, viewportWidth - padding * 2);
  const availH = Math.max(64, viewportHeight - padding * 2);
  const zoom = clamp(Math.min(availW / worldWidth, availH / worldHeight), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom,
    ox: (viewportWidth - worldWidth * zoom) / 2,
    oy: (viewportHeight - worldHeight * zoom) / 2,
  };
}

/** Прямоугольник мира, видимый на экране. */
export function visibleWorldRect(cam: Camera, vw: number, vh: number) {
  const a = toWorld(cam, { x: 0, y: 0 });
  const b = toWorld(cam, { x: vw, y: vh });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

export function clampCamera(cam: Camera, worldWidth: number, worldHeight: number, vw: number, vh: number): Camera {
  // Не даём уехать так, чтобы мир целиком пропал с экрана.
  const margin = 120;
  const minOx = -worldWidth * cam.zoom + margin - vw * 0.5;
  const maxOx = vw - margin + vw * 0.5;
  const minOy = -worldHeight * cam.zoom + margin - vh * 0.5;
  const maxOy = vh - margin + vh * 0.5;
  return {
    zoom: cam.zoom,
    ox: clamp(cam.ox, minOx, maxOx),
    oy: clamp(cam.oy, minOy, maxOy),
  };
}
