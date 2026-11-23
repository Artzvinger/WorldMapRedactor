import { toWorld, type Camera } from './camera';
import { shade } from './color';
import { paintCanvases } from './paint';
import { formatPopulation } from './text';
import { boundsIntersect, sampleSmooth, ticksAlong, type Bounds } from './geometry';
import { CITY_BASE_RADIUS, cityLabelAnchor, cityRadius, featureBounds, labelHalfWidth } from './query';
import {
  CITY_DEFAULT_SIZE,
  LAYER_ORDER,
  layerOf,
  PATH_DEFAULT_COLORS,
  type CityFeature,
  type Draft,
  type Feature,
  type LabelFeature,
  type LandDab,
  type MapDoc,
  type PathFeature,
  type RegionFeature,
  type ToolId,
  type Vec2,
} from './types';

export interface RenderInput {
  doc: MapDoc;
  camera: Camera;
  viewport: { width: number; height: number };
  selection: Set<string>;
  draft: Draft | null;
  tool: ToolId;
  marquee: Bounds | null;
  snap: Vec2 | null;
  /** незафиксированные мазки текущего штриха */
  stroke?: LandDab[] | null;
  /** кружок под курсором для кистей */
  brush?: { x: number; y: number; r: number } | null;
  /** true для экспорта: без служебных рамок */
  exportMode?: boolean;
}

const INK = '#2b2118';
const PAPER = '#f7f1e4';
const ACCENT = '#e0b458';
const SERIF = 'Georgia, "Times New Roman", "PT Serif", serif';
const SANS = '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

function pathThrough(ctx: CanvasRenderingContext2D, pts: Vec2[], closed: boolean): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
}

/** Сглаженные копии кешируем: импортированные контуры иначе пересчитываются каждый кадр. */
const smoothCache = new WeakMap<Vec2[], { closed: boolean; out: Vec2[] }>();
/** Плотные контуры (импорт из Azgaar) уже гладкие — их сглаживание только множит точки. */
const MAX_SMOOTH_POINTS = 160;

function displayPoints(points: Vec2[], smooth: boolean, closed: boolean): Vec2[] {
  if (!smooth || points.length < 3) return points;
  if (points.length > MAX_SMOOTH_POINTS) return points;
  const cached = smoothCache.get(points);
  if (cached && cached.closed === closed) return cached.out;
  const out = sampleSmooth(points, closed, 10);
  smoothCache.set(points, { closed, out });
  return out;
}

/* ------------------------------------------------------------------- города */

function drawCityIcon(
  ctx: CanvasRenderingContext2D,
  city: CityFeature,
  zoom: number,
  iconScale: number,
): void {
  const r = cityRadius(city, iconScale);
  const ink = city.color ?? INK;
  const lw = Math.max(1.1, r * 0.24);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (city.type) {
    case 'capital': {
      ctx.beginPath();
      ctx.arc(city.pos.x, city.pos.y, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(city.pos.x, city.pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      // корона: три луча над кольцом
      const cy = city.pos.y - r * 1.35;
      ctx.beginPath();
      ctx.moveTo(city.pos.x - r * 0.55, cy);
      ctx.lineTo(city.pos.x - r * 0.28, cy - r * 0.5);
      ctx.lineTo(city.pos.x, cy - r * 0.1);
      ctx.lineTo(city.pos.x + r * 0.28, cy - r * 0.5);
      ctx.lineTo(city.pos.x + r * 0.55, cy);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case 'city': {
      ctx.beginPath();
      ctx.arc(city.pos.x, city.pos.y, r * 0.82, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(city.pos.x, city.pos.y, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case 'town': {
      ctx.beginPath();
      ctx.arc(city.pos.x, city.pos.y, r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case 'village': {
      ctx.beginPath();
      ctx.arc(city.pos.x, city.pos.y, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case 'poi': {
      const d = r * 0.7;
      ctx.beginPath();
      ctx.moveTo(city.pos.x, city.pos.y - d);
      ctx.lineTo(city.pos.x + d, city.pos.y);
      ctx.lineTo(city.pos.x, city.pos.y + d);
      ctx.lineTo(city.pos.x - d, city.pos.y);
      ctx.closePath();
      ctx.strokeStyle = ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
  }
  void zoom;
}

function drawCityLabel(ctx: CanvasRenderingContext2D, city: CityFeature, doc: MapDoc, zoom: number): void {
  if (!city.name) return;
  const scale = doc.style.labelScale ?? 1;
  const size = city.labelSize * scale;
  // на мелком масштабе подписи превращаются в кашу — показываем только крупные
  const importance = city.type === 'capital' ? 1.5 : city.type === 'city' ? 1 : city.type === 'town' ? 0.8 : 0.62;
  if (size * zoom * importance < 6) return;

  const family = doc.style.labelFont === 'serif' ? SERIF : SANS;
  const weight = city.type === 'capital' ? 700 : 600;
  const anchor = cityLabelAnchor(city, city.labelSide ?? 'bottom', scale, doc.style.iconScale ?? 1);
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = anchor.align;
  ctx.textBaseline = anchor.baseline;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(247, 241, 228, 0.92)';
  ctx.lineWidth = size * 0.2;
  ctx.strokeText(city.name, anchor.x, anchor.y);
  ctx.fillStyle = city.color ?? INK;
  ctx.fillText(city.name, anchor.x, anchor.y);

  if (doc.style.showPopulation && city.population) {
    const small = size * 0.62;
    const dy = anchor.baseline === 'bottom' ? size * 0.1 : anchor.baseline === 'middle' ? size * 0.66 : size * 1.04;
    const text = formatPopulation(city.population);
    ctx.font = `500 ${small}px ${family}`;
    ctx.textBaseline = 'top';
    ctx.lineWidth = small * 0.24;
    ctx.strokeText(text, anchor.x, anchor.y + dy);
    ctx.fillStyle = 'rgba(62, 54, 42, 0.78)';
    ctx.fillText(text, anchor.x, anchor.y + dy);
  }
}

/* --------------------------------------------------------------------- линии */

function strokePolyline(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function drawRiver(ctx: CanvasRenderingContext2D, pts: Vec2[], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const n = pts.length;
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    const w = width * (0.28 + 0.72 * t);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  // светлая жила по центру
  ctx.globalAlpha *= 0.35;
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    const w = width * (0.28 + 0.72 * t) * 0.4;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.globalAlpha /= 0.35;
}

function drawRail(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  width: number,
  color: string,
  zoom: number,
): void {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  strokePolyline(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, width * 0.5);
  ctx.stroke();

  // шпалы только когда линия достаточно крупная, иначе получается «гусеница»
  if (width * zoom < 1.2) return;

  const spacing = Math.max(9, width * 4.6);
  const ticks = ticksAlong(pts, spacing);
  const half = Math.max(2.2, width * 1.6);
  ctx.beginPath();
  for (const t of ticks) {
    ctx.moveTo(t.x - t.nx * half, t.y - t.ny * half);
    ctx.lineTo(t.x + t.nx * half, t.y + t.ny * half);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, width * 0.45);
  ctx.stroke();
}

function drawRoad(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  width: number,
  color: string,
  zoom: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokePolyline(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();

  // светлая жила по центру — только на крупном масштабе, иначе дороги «рядят»
  if (width * zoom < 1.8) return;
  ctx.setLineDash([width * 1.6, width * 1.6]);
  ctx.strokeStyle = shade(color, 0.45);
  ctx.lineWidth = Math.max(0.4, width * 0.3);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Граница страны: сплошная линия на светлой подложке — читается как «главная». */
function drawStateBorder(ctx: CanvasRenderingContext2D, pts: Vec2[], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  const w = Math.max(width, 0.9);
  strokePolyline(ctx, pts);
  ctx.strokeStyle = 'rgba(250, 246, 236, 0.55)';
  ctx.lineWidth = w * 2.2;
  ctx.stroke();

  strokePolyline(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Граница области: тонкий пунктир, чтобы не спорить с границей страны. */
function drawProvinceBorder(ctx: CanvasRenderingContext2D, pts: Vec2[], width: number, color: string): void {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const w = Math.max(width, 0.7);
  strokePolyline(ctx, pts);
  ctx.setLineDash([w * 2.6, w * 2.4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSeaRoute(ctx: CanvasRenderingContext2D, pts: Vec2[], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokePolyline(ctx, pts);
  // штрих-пунктир: узнаваемый вид морского пути
  const w = Math.max(1.1, width);
  ctx.setLineDash([w * 3.2, w * 1.7, w * 0.6, w * 1.7]);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Множитель толщины линий. Общий коэффициент из настроек карты плюс лёгкое
 * утоньшение на мелком масштабе: сотни дорог иначе сливаются в кашу.
 */
function lineScale(doc: MapDoc, zoom: number): number {
  const styleScale = doc.style.lineScale ?? 1;
  const detail = Math.min(1, Math.max(0.8, 0.8 + 0.2 * zoom));
  return styleScale * detail;
}

/** Минимальная толщина линии на экране, чтобы она совсем не пропадала при отдалении. */
const MIN_LINE_PX: Record<string, number> = {
  road: 1,
  rail: 1,
  sea: 1,
  river: 1.2,
};

function drawPath(ctx: CanvasRenderingContext2D, f: PathFeature, doc: MapDoc, zoom: number): void {
  if (f.points.length < 2) return;
  const pts = displayPoints(f.points, f.smooth, false);
  const color = f.color ?? PATH_DEFAULT_COLORS[f.pathKind];
  const minPx = MIN_LINE_PX[f.pathKind] ?? 0.85;
  const width = Math.max(f.width * lineScale(doc, zoom), minPx / zoom);
  switch (f.pathKind) {
    case 'river':
      drawRiver(ctx, pts, width, color);
      break;
    case 'rail':
      drawRail(ctx, pts, width, color, zoom);
      break;
    case 'road':
      drawRoad(ctx, pts, width, color, zoom);
      break;
    case 'sea':
      drawSeaRoute(ctx, pts, width, color);
      break;
    case 'border':
      // границы не должны исчезать при отдалении: держим минимум в экранных пикселях
      drawStateBorder(ctx, pts, Math.max(width, 1.7 / zoom), color);
      break;
    case 'province':
      drawProvinceBorder(ctx, pts, Math.max(width * 0.7, 1.15 / zoom), color);
      break;
  }
}

/* ------------------------------------------------------------------- регионы */

function drawRegion(ctx: CanvasRenderingContext2D, f: RegionFeature, zoom: number): void {
  if (f.points.length < 3) return;
  const pts = displayPoints(f.points, f.smooth, true);
  // заливка полупрозрачная, обводка — нет: иначе контур «тает» вместе с заливкой
  ctx.save();
  ctx.globalAlpha *= f.opacity;
  pathThrough(ctx, pts, true);
  ctx.fillStyle = f.fill;
  ctx.fill();
  ctx.restore();
  if (f.strokeWidth > 0) {
    // контур не должен пропадать на отдалении — держим минимум в экранных пикселях
    const width = Math.max(f.strokeWidth, 1.25 / zoom);
    pathThrough(ctx, pts, true);
    ctx.strokeStyle = f.stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ подписи */

function drawLabel(ctx: CanvasRenderingContext2D, f: LabelFeature, doc: MapDoc, zoom: number): void {
  if (!f.text) return;
  if (f.size * zoom < 3) return;
  const family = doc.style.labelFont === 'serif' ? SERIF : SANS;
  ctx.save();
  ctx.translate(f.pos.x, f.pos.y);
  ctx.rotate((f.rotation * Math.PI) / 180);
  ctx.font = `600 ${f.size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(247, 241, 228, 0.92)';
  ctx.lineWidth = f.size * 0.2;
  ctx.strokeText(f.text, 0, 0);
  ctx.fillStyle = f.color;
  ctx.fillText(f.text, 0, 0);
  ctx.restore();
}

/* -------------------------------------------------------------------- сцена */

function inView(f: Feature, view: Bounds): boolean {
  if (f.kind === 'land') {
    return boundsIntersect(featureBounds(f), view);
  }
  return boundsIntersect(featureBounds(f), view);
}

function drawFeature(ctx: CanvasRenderingContext2D, f: Feature, doc: MapDoc, zoom: number): void {
  switch (f.kind) {
    case 'land': {
      if (f.points.length < 3) return;
      const pts = displayPoints(f.points, true, true);
      pathThrough(ctx, pts, true);
      const fill = f.hole ? doc.style.water : doc.style.land;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineJoin = 'round';
      if (pts.length > 20) {
        // настоящая береговая линия: без обводки суша сливается с морем
        ctx.strokeStyle = shade(doc.style.water, f.hole ? -0.3 : -0.5);
        ctx.lineWidth = 1.3 / zoom;
      } else {
        // мелкие ячейки старого векторного импорта: закрашиваем швы
        ctx.strokeStyle = fill;
        ctx.lineWidth = 1.5 / zoom;
      }
      ctx.stroke();
      break;
    }
    case 'region':
      drawRegion(ctx, f, zoom);
      break;
    case 'path':
      drawPath(ctx, f, doc, zoom);
      break;
    case 'city':
      drawCityIcon(ctx, f, zoom, doc.style.iconScale ?? 1);
      break;
    case 'label':
      drawLabel(ctx, f, doc, zoom);
      break;
  }
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  doc: MapDoc,
  selection: Set<string>,
  zoom: number,
): void {
  if (selection.size === 0) return;
  const s = 1 / zoom;
  for (const f of doc.features) {
    if (!selection.has(f.id)) continue;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = 'rgba(224, 180, 88, 0.14)';
    ctx.setLineDash([7 * s, 5 * s]);
    ctx.lineWidth = 1.5 * s;
    if (f.kind === 'city') {
      const r = cityRadius(f, doc.style.iconScale ?? 1) + 7 * s;
      ctx.beginPath();
      ctx.arc(f.pos.x, f.pos.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'path') {
      if (f.points.length >= 2) {
        const pts = displayPoints(f.points, f.smooth, false);
        strokePolyline(ctx, pts);
        ctx.lineWidth = Math.max(f.width + 8 * s, 10 * s);
        ctx.globalAlpha = 0.22;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5 * s;
        ctx.setLineDash([7 * s, 5 * s]);
        strokePolyline(ctx, pts);
        ctx.stroke();
      }
      for (const p of f.points) {
        ctx.fillStyle = ACCENT;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(p.x - 4 * s, p.y - 4 * s, 8 * s, 8 * s);
        ctx.fill();
      }
    } else if (f.kind === 'region') {
      if (f.points.length >= 3) {
        const pts = displayPoints(f.points, f.smooth, true);
        pathThrough(ctx, pts, true);
        ctx.fill();
        ctx.stroke();
      }
      for (const p of f.points) {
        ctx.fillStyle = ACCENT;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(p.x - 4 * s, p.y - 4 * s, 8 * s, 8 * s);
        ctx.fill();
      }
    } else if (f.kind === 'label') {
      const hw = labelHalfWidth(f.text, f.size) + f.size * 0.6;
      const hh = f.size * 0.9;
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeRect(f.pos.x - hw, f.pos.y - hh, hw * 2, hh * 2);
    }
    ctx.restore();
  }
}

function drawDraft(ctx: CanvasRenderingContext2D, draft: Draft, zoom: number): void {
  const s = 1 / zoom;
  const pts = draft.points;
  if (pts.length === 0) return;
  const preview = draft.cursor ? [...pts, draft.cursor] : pts;
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.8 * s;
  ctx.setLineDash([8 * s, 6 * s]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (preview.length >= 2) {
    strokePolyline(ctx, preview);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
  }
  if (draft.cursor) {
    ctx.beginPath();
    ctx.arc(draft.cursor.x, draft.cursor.y, 3.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnap(ctx: CanvasRenderingContext2D, snap: Vec2, zoom: number): void {
  const s = 1 / zoom;
  ctx.save();
  ctx.beginPath();
  ctx.arc(snap.x, snap.y, 14 * s, 0, Math.PI * 2);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2 * s;
  ctx.setLineDash([4 * s, 4 * s]);
  ctx.stroke();
  ctx.restore();
}

function drawMarquee(ctx: CanvasRenderingContext2D, m: Bounds, zoom: number): void {
  const s = 1 / zoom;
  ctx.save();
  ctx.fillStyle = 'rgba(224, 180, 88, 0.12)';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.3 * s;
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.fillRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
  ctx.strokeRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
  ctx.restore();
}

export function renderScene(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { doc, camera, viewport, selection, draft, marquee, snap, brush, exportMode } = input;
  const { width: vw, height: vh } = viewport;

  ctx.save();
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = exportMode ? doc.style.water : doc.style.paper;
  ctx.fillRect(0, 0, vw, vh);

  ctx.translate(camera.ox, camera.oy);
  ctx.scale(camera.zoom, camera.zoom);

  // море мира
  ctx.fillStyle = doc.style.water;
  ctx.fillRect(0, 0, doc.meta.width, doc.meta.height);

  const topLeft = toWorld(camera, { x: 0, y: 0 });
  const bottomRight = toWorld(camera, { x: vw, y: vh });
  const view: Bounds = {
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y,
  };

  for (const layerId of LAYER_ORDER) {
    const layer = doc.layers[layerId];
    if (!layer.visible) continue;
    const alpha = layer.opacity;
    if (alpha <= 0) continue;

    const painted = layerId === 'land' ? paintCanvases(doc, input.stroke ?? [], camera.zoom) : null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // сначала тёмная кайма нарисованной суши: она лежит под полигонами,
    // чтобы не перечёркивать уже существующий берег
    if (painted?.edge) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(painted.edge, 0, 0, doc.meta.width, doc.meta.height);
      ctx.restore();
    }

    for (const f of doc.features) {
      if (layerOf(f) !== layerId) continue;
      if (!inView(f, view)) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawFeature(ctx, f, doc, camera.zoom);
      ctx.restore();
    }

    // поверх полигонов: закрываем их береговую линию там, куда легла кисть
    if (painted?.fill) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(painted.fill, 0, 0, doc.meta.width, doc.meta.height);
      ctx.restore();
    }
    // вода поверх всего: кисть воды закрашивает и импортированный берег
    if (painted?.water) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(painted.water, 0, 0, doc.meta.width, doc.meta.height);
      ctx.restore();
    }
  }

  // подписи городов рисуем поверх остального, чтобы их не перекрывали линии
  for (const f of doc.features) {
    if (f.kind !== 'city') continue;
    if (!doc.layers.cities.visible) continue;
    if (!inView(f, view)) continue;
    ctx.save();
    ctx.globalAlpha = doc.layers.cities.opacity;
    drawCityLabel(ctx, f, doc, camera.zoom);
    ctx.restore();
  }

  if (!exportMode) {
    drawSelection(ctx, doc, selection, camera.zoom);
    if (draft) drawDraft(ctx, draft, camera.zoom);
    if (snap) drawSnap(ctx, snap, camera.zoom);
    if (marquee) drawMarquee(ctx, marquee, camera.zoom);
    if (brush) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(brush.x, brush.y, brush.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(224, 180, 88, 0.95)';
      ctx.lineWidth = 1.4 / camera.zoom;
      ctx.stroke();
      ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
      ctx.beginPath();
      ctx.arc(brush.x, brush.y, Math.max(0, brush.r - 1.5 / camera.zoom), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(20, 24, 30, 0.45)';
      ctx.stroke();
      ctx.restore();
    }
  }

  // рамка мира
  if (!exportMode) {
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.35)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.strokeRect(0, 0, doc.meta.width, doc.meta.height);
  }

  ctx.restore();
}

export { CITY_BASE_RADIUS, CITY_DEFAULT_SIZE };
