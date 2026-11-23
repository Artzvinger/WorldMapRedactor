import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toWorld } from '../core/camera';
import { dist } from '../core/geometry';
import { renderScene } from '../core/render';
import { downloadDoc } from '../core/persist';
import {
  makeMarqueeFromDrag,
  nearestCityAt,
  pickAt,
  pickVertexAt,
  snapPoint,
  useEditor,
} from '../core/store';
import { TOOL_IDS, type ToolId, type Vec2 } from '../core/types';
import { IconFit, IconMinus, IconPlus } from './icons';

type DragState =
  | { mode: 'pan'; lastScreen: Vec2 }
  | { mode: 'feature' | 'vertex'; startWorld: Vec2; featureId: string; vertexIndex?: number }
  | { mode: 'marquee'; startWorld: Vec2 }
  | { mode: 'paint' };

const DRAW_TOOLS: ToolId[] = ['road', 'rail', 'sea', 'river', 'region'];
const BRUSH_TOOLS: ToolId[] = ['landbrush', 'waterbrush'];

/**
 * Горячие клавиши привязаны к физической клавише (`e.code`), а не к символу:
 * на русской раскладке Ctrl+Z приходит как key="я", и сравнение по e.key
 * молча ломает все сочетания.
 */
const TOOL_BY_CODE: Record<string, ToolId> = {
  KeyV: 'select',
  KeyH: 'pan',
  KeyC: 'city',
  KeyR: 'road',
  KeyX: 'rail',
  KeyS: 'sea',
  KeyW: 'river',
  KeyG: 'region',
  KeyL: 'label',
  KeyB: 'landbrush',
  KeyN: 'waterbrush',
  Digit1: 'select',
  Digit2: 'pan',
  Digit3: 'city',
  Digit4: 'road',
  Digit5: 'rail',
  Digit6: 'river',
  Digit7: 'region',
  Digit8: 'label',
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

/** setPointerCapture падает на синтетических событиях — для тестов это не ошибка. */
function capturePointer(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* синтетическое событие без реального указателя */
  }
}

export function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const fittedRef = useRef<{ width: number; height: number } | null>(null);
  const userTouchedRef = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const doc = useEditor((s) => s.doc);
  const camera = useEditor((s) => s.camera);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const draft = useEditor((s) => s.draft);
  const marquee = useEditor((s) => s.marquee);
  const cursorWorld = useEditor((s) => s.cursorWorld);
  const stroke = useEditor((s) => s.stroke);
  const brushRadius = useEditor((s) => s.brushRadius);

  /* --------------------------------------------------------------- размеры */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      setViewport({
        width: Math.max(1, canvas.clientWidth),
        height: Math.max(1, canvas.clientHeight),
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    measure();
    return () => ro.disconnect();
  }, []);

  // Карту вписываем один раз, но если вёрстка «доустаканилась» до первого
  // действия пользователя — пересчитываем, иначе масштаб останется от чужого размера.
  useEffect(() => {
    if (viewport.width < 10 || viewport.height < 10) return;
    const fitted = fittedRef.current;
    const changed = !fitted || Math.abs(fitted.width - viewport.width) > 4 || Math.abs(fitted.height - viewport.height) > 4;
    if (!changed) return;
    if (fitted && userTouchedRef.current) return;
    fittedRef.current = { width: viewport.width, height: viewport.height };
    useEditor.getState().setViewport(viewport.width, viewport.height);
    useEditor.getState().fitToScreen(viewport.width, viewport.height);
  }, [viewport]);

  useEffect(() => {
    if (viewport.width < 10) return;
    useEditor.getState().setViewport(viewport.width, viewport.height);
  }, [viewport]);

  /* ------------------------------------------------------------------ сцена */

  const snap = useMemo<Vec2 | null>(() => {
    if (!cursorWorld) return null;
    if (draft) return snapPoint(cursorWorld);
    if (DRAW_TOOLS.includes(tool)) {
      const c = nearestCityAt(cursorWorld);
      return c ? { ...c.pos } : null;
    }
    return null;
  }, [cursorWorld, draft, tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // размер берём у самого canvas: если битмап и вёрстка разъедутся,
    // картинку растянет по одной оси
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth < 2 || cssHeight < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cssWidth * dpr);
    const h = Math.round(cssHeight * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, {
      doc,
      camera,
      viewport: { width: cssWidth, height: cssHeight },
      selection: new Set(selection),
      draft,
      tool,
      marquee,
      snap,
      stroke,
      brush: BRUSH_TOOLS.includes(tool) && cursorWorld ? { x: cursorWorld.x, y: cursorWorld.y, r: brushRadius } : null,
    });

    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, 520, 68);
      ctx.fillStyle = '#e0b458';
      ctx.font = '13px monospace';
      ctx.fillText(`css ${cssWidth}×${cssHeight} · bitmap ${canvas.width}×${canvas.height} · dpr ${dpr}`, 8, 20);
      ctx.fillText(`viewport ${viewport.width}×${viewport.height} · zoom ${camera.zoom.toFixed(4)} · inner ${window.innerWidth}×${window.innerHeight}`, 8, 42);
      ctx.restore();
    }
  }, [doc, camera, viewport, selection, draft, tool, marquee, snap, stroke, brushRadius, cursorWorld]);

  /* ------------------------------------------------------------- указатель */

  const localPoint = useCallback((clientX: number, clientY: number): Vec2 => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      userTouchedRef.current = true;
      const st = useEditor.getState();
      const p = localPoint(e.clientX, e.clientY);
      const world = toWorld(st.camera, p);

      if (e.button === 1 || (e.button === 0 && (st.tool === 'pan' || spaceRef.current))) {
        dragRef.current = { mode: 'pan', lastScreen: p };
        capturePointer(canvas, e.pointerId);
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;

      if (st.tool === 'city') {
        st.addCity(world);
        return;
      }
      if (st.tool === 'label') {
        st.addLabel(world);
        return;
      }
      if (BRUSH_TOOLS.includes(st.tool)) {
        st.beginStroke(st.tool === 'waterbrush', world);
        dragRef.current = { mode: 'paint' };
        capturePointer(canvas, e.pointerId);
        return;
      }
      if (DRAW_TOOLS.includes(st.tool)) {
        const at = snapPoint(world);
        if (!st.draft) {
          st.startDraft(st.tool, at);
        } else {
          const last = st.draft.points[st.draft.points.length - 1];
          if (!last || dist(last, at) > 2 / st.camera.zoom) st.addDraftPoint(at);
        }
        return;
      }

      // режим выбора
      const hit = pickAt(world);
      if (hit) {
        const vertexIndex = pickVertexAt(hit, world);
        // Alt+клик по точке — убрать именно её
        if (e.altKey && vertexIndex !== null) {
          e.preventDefault();
          st.removeVertex(hit.id, vertexIndex);
          return;
        }
        if (e.shiftKey && vertexIndex === null) {
          st.select([hit.id], true);
          return;
        }
        if (!st.selection.includes(hit.id)) st.select([hit.id]);
        st.beginTransform();
        dragRef.current =
          vertexIndex !== null
            ? { mode: 'vertex', featureId: hit.id, vertexIndex, startWorld: world }
            : { mode: 'feature', featureId: hit.id, startWorld: world };
        capturePointer(canvas, e.pointerId);
        return;
      }

      if (!e.shiftKey) st.select([]);
      dragRef.current = { mode: 'marquee', startWorld: world };
      capturePointer(canvas, e.pointerId);
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const st = useEditor.getState();
      const p = localPoint(e.clientX, e.clientY);
      const world = toWorld(st.camera, p);
      st.setCursorWorld(world);

      if (st.draft) st.moveDraftCursor(snapPoint(world));

      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === 'pan') {
        st.panBy(p.x - drag.lastScreen.x, p.y - drag.lastScreen.y);
        drag.lastScreen = p;
      } else if (drag.mode === 'feature') {
        st.transformSelection(world.x - drag.startWorld.x, world.y - drag.startWorld.y);
      } else if (drag.mode === 'vertex' && drag.vertexIndex !== undefined) {
        st.transformVertex(drag.featureId, drag.vertexIndex, world.x - drag.startWorld.x, world.y - drag.startWorld.y);
      } else if (drag.mode === 'marquee') {
        st.setMarquee(makeMarqueeFromDrag(drag.startWorld, world));
      } else if (drag.mode === 'paint') {
        st.extendStroke(world);
      }
    },
    [localPoint],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditor.getState();
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.mode === 'feature' || drag.mode === 'vertex') st.endTransform();
    if (drag.mode === 'marquee') st.finishMarquee(e.shiftKey);
    if (drag.mode === 'paint') st.endStroke();
  }, []);

  const onDoubleClick = useCallback(() => {
    const st = useEditor.getState();
    if (st.draft) st.finishDraft();
  }, []);

  const onPointerLeave = useCallback(() => {
    if (!dragRef.current) useEditor.getState().setCursorWorld(null);
  }, []);

  /* -------------------------------------------------------------- масштаб */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userTouchedRef.current = true;
      const st = useEditor.getState();
      const p = localPoint(e.clientX, e.clientY);
      const rect = canvas.getBoundingClientRect();
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      if (e.deltaMode === 2) delta *= 100;
      const factor = Math.exp(-delta * 0.0018);
      st.zoomAt(p.x, p.y, factor, rect.width, rect.height);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [localPoint]);

  /* ------------------------------------------------------------ клавиатура */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const editing = isEditableTarget(e.target);
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.code === 'Space' && !editing) {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (st.draft) st.cancelDraft();
        else st.select([]);
        return;
      }
      // внутри текстового поля не перехватываем: там своя отмена ввода
      if (editing) return;

      if (ctrl) {
        switch (e.code) {
          case 'KeyZ':
            e.preventDefault();
            if (e.shiftKey) st.redo();
            else st.undo();
            return;
          case 'KeyY':
            e.preventDefault();
            st.redo();
            return;
          case 'KeyD':
            e.preventDefault();
            st.duplicateSelection();
            return;
          case 'KeyS':
            e.preventDefault();
            downloadDoc(st.doc);
            return;
          default:
            return;
        }
      }

      if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        if (st.draft) st.finishDraft();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.deleteSelection();
        return;
      }

      const zoomAtCenter = (factor: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) st.zoomAt(rect.width / 2, rect.height / 2, factor, rect.width, rect.height);
      };

      switch (e.code) {
        case 'Equal':
        case 'NumpadAdd':
          zoomAtCenter(1.25);
          return;
        case 'Minus':
        case 'NumpadSubtract':
          zoomAtCenter(0.8);
          return;
        case 'Digit0':
        case 'Numpad0': {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) st.fitToScreen(rect.width, rect.height);
          return;
        }
        default:
          break;
      }

      const t = TOOL_BY_CODE[e.code];
      if (t && TOOL_IDS.includes(t)) {
        st.setTool(t);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /* ------------------------------------------------------------------ вид */

  const hint = (() => {
    if (draft) {
      return draft.tool === 'region'
        ? 'Клик — вершина контура · Enter — замкнуть · Esc — отмена'
        : 'Клик — следующая точка · Enter — закончить · Esc — отмена';
    }
    switch (tool) {
      case 'city':
        return 'Клик по карте — поставить город';
      case 'label':
        return 'Клик — поставить подпись';
      case 'road':
      case 'rail':
      case 'sea':
      case 'river':
        return 'Клик — начало линии · концы цепляются к городам';
      case 'region':
        return 'Клик — начало контура региона';
      case 'landbrush':
        return 'Тяни мышью — дорисовываешь сушу · радиус кисти справа';
      case 'waterbrush':
        return 'Тяни мышью — закрашиваешь воду · радиус кисти справа';
      case 'pan':
        return 'Тяни карту мышью · колесо — масштаб';
      default:
        return 'Клик — выбрать · Shift — добавить · тяни — переместить · рамкой — выделить группу';
    }
  })();

  const zoomPercent = Math.round(camera.zoom * 100);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          cursor:
            tool === 'pan'
              ? 'grab'
              : DRAW_TOOLS.includes(tool) || BRUSH_TOOLS.includes(tool) || tool === 'city' || tool === 'label'
                ? 'crosshair'
                : 'default',
        }}
      />
      <div className="hint">{hint}</div>
      <div className="zoom-box">
        <button
          title="Уменьшить (−)"
          onClick={() => {
            const st = useEditor.getState();
            st.zoomAt(viewport.width / 2, viewport.height / 2, 0.8, viewport.width, viewport.height);
          }}
        >
          <IconMinus />
        </button>
        <div className="zoom-value">{zoomPercent}%</div>
        <button
          title="Увеличить (+)"
          onClick={() => {
            const st = useEditor.getState();
            st.zoomAt(viewport.width / 2, viewport.height / 2, 1.25, viewport.width, viewport.height);
          }}
        >
          <IconPlus />
        </button>
        <button
          title="Вписать карту (0)"
          onClick={() => useEditor.getState().fitToScreen(viewport.width, viewport.height)}
        >
          <IconFit />
        </button>
      </div>
    </div>
  );
}
