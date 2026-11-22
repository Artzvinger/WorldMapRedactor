/**
 * Отладочная страница: монтирует настоящий App и прогоняет сценарии мышью —
 * постановка города, рисование дороги, перетаскивание, undo. Открывать
 * /interaction-check.html на dev-сервере; итог печатается в #log и в title.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { toScreen } from '../core/camera';
import { exportPng } from '../core/persist';
import { useEditor } from '../core/store';
import type { Vec2 } from '../core/types';
import { App } from '../ui/App';

const logEl = document.getElementById('log') as HTMLElement;
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
}

function tick(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canvasEl(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('.canvas-wrap canvas');
}

function screenOf(world: Vec2): Vec2 {
  const canvas = canvasEl();
  const camera = useEditor.getState().camera;
  const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  const point = toScreen(camera, world);
  return { x: rect.left + point.x, y: rect.top + point.y };
}

function fire(type: string, at: Vec2, init: PointerEventInit = {}): void {
  const canvas = canvasEl();
  if (!canvas) return;
  canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: at.x,
      clientY: at.y,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
}

function click(world: Vec2, init: PointerEventInit = {}): void {
  const at = screenOf(world);
  fire('pointerdown', at, init);
  fire('pointerup', at, init);
}

function drag(fromWorld: Vec2, toWorld: Vec2): void {
  const from = screenOf(fromWorld);
  const to = screenOf(toWorld);
  fire('pointerdown', from);
  fire('pointermove', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  fire('pointermove', to);
  fire('pointerup', to);
}

function key(name: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

const near = (a: number, b: number, eps = 2): boolean => Math.abs(a - b) <= eps;

async function run(): Promise<void> {
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(createElement(App));

  // ждём, пока вёрстка даст холсту настоящий размер
  let canvas: HTMLCanvasElement | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    await tick(50);
    canvas = canvasEl();
    const box = canvas?.getBoundingClientRect();
    if (canvas && box && box.width > 400 && box.height > 300) break;
  }

  const store = useEditor.getState();
  store.newDoc();
  if (!canvas) {
    check('холст смонтирован', false);
    return;
  }
  canvas = canvasEl();
  const rect = (canvas as HTMLCanvasElement).getBoundingClientRect();
  store.fitToScreen(rect.width, rect.height);
  await tick(60);
  check('холст смонтирован', rect.width > 100 && rect.height > 100, `${Math.round(rect.width)}×${Math.round(rect.height)}`);

  const cv = canvas as HTMLCanvasElement;
  const dprNow = Math.min(window.devicePixelRatio || 1, 2);
  const vp = useEditor.getState().viewport;
  check(
    'битмап холста совпадает с вёрсткой',
    cv.width === Math.round(cv.clientWidth * dprNow) && cv.height === Math.round(cv.clientHeight * dprNow),
    `битмап ${cv.width}×${cv.height}, css ${cv.clientWidth}×${cv.clientHeight}, dpr ${dprNow}, viewport ${vp.width}×${vp.height}`,
  );

  /* 1. город кликом */
  useEditor.getState().setTool('city');
  click({ x: 600, y: 400 });
  await tick();
  const cities = useEditor.getState().doc.features.filter((f) => f.kind === 'city');
  check('клик ставит город', cities.length === 1, `городов: ${cities.length}`);
  const first = cities[0];
  if (first && first.kind === 'city') {
    check('город в точке клика', near(first.pos.x, 600, 3) && near(first.pos.y, 400, 3), `${first.pos.x.toFixed(0)}:${first.pos.y.toFixed(0)}`);
  }

  /* 2. дорога между городами */
  useEditor.getState().setTool('road');
  click({ x: 600, y: 400 });
  click({ x: 1100, y: 800 });
  key('Enter');
  await tick();
  const roads = useEditor.getState().doc.features.filter((f) => f.kind === 'path' && f.pathKind === 'road');
  const road = roads[0];
  check('дорога создана', roads.length === 1, `дорог: ${roads.length}`);
  if (road && road.kind === 'path') {
    check('дорога из двух точек', road.points.length === 2, `точек: ${road.points.length}`);
    check('начало дороги привязано к городу', Boolean(road.startCityId), String(road.startCityId));
  }

  /* 3. перетаскивание города */
  useEditor.getState().setTool('select');
  const cityBefore = useEditor.getState().doc.features.find((f) => f.kind === 'city');
  const startPos = cityBefore && cityBefore.kind === 'city' ? { ...cityBefore.pos } : null;
  if (startPos) {
    drag(startPos, { x: startPos.x + 120, y: startPos.y + 60 });
    await tick();
    const moved = useEditor.getState().doc.features.find((f) => f.kind === 'city');
    const ok =
      moved &&
      moved.kind === 'city' &&
      near(moved.pos.x, startPos.x + 120, 4) &&
      near(moved.pos.y, startPos.y + 60, 4);
    check('город перетаскивается', Boolean(ok), moved && moved.kind === 'city' ? `${moved.pos.x.toFixed(0)}:${moved.pos.y.toFixed(0)}` : 'нет города');

    useEditor.getState().undo();
    const afterUndo = useEditor.getState().doc.features.find((f) => f.kind === 'city');
    const restored = afterUndo && afterUndo.kind === 'city' && near(afterUndo.pos.x, startPos.x, 2) && near(afterUndo.pos.y, startPos.y, 2);
    check('undo возвращает город', Boolean(restored), afterUndo && afterUndo.kind === 'city' ? `${afterUndo.pos.x.toFixed(0)}:${afterUndo.pos.y.toFixed(0)}` : 'нет города');
  }

  /* 4. железная дорога из трёх точек */
  useEditor.getState().setTool('rail');
  click({ x: 900, y: 300 });
  click({ x: 1000, y: 500 });
  click({ x: 1150, y: 600 });
  key('Enter');
  await tick();
  const rails = useEditor.getState().doc.features.filter((f) => f.kind === 'path' && f.pathKind === 'rail');
  check('ж/д создана', rails.length === 1, `линий: ${rails.length}`);

  /* 4б. морской путь */
  useEditor.getState().setTool('sea');
  click({ x: 300, y: 1200 });
  click({ x: 600, y: 1300 });
  click({ x: 900, y: 1250 });
  key('Enter');
  await tick();
  const seaRoutes = useEditor.getState().doc.features.filter((f) => f.kind === 'path' && f.pathKind === 'sea');
  const seaRoute = seaRoutes[0];
  check('морской путь создан', seaRoutes.length === 1, `путей: ${seaRoutes.length}`);
  if (seaRoute && seaRoute.kind === 'path') {
    check('у морского пути три точки', seaRoute.points.length === 3, `точек: ${seaRoute.points.length}`);
  }

  /* 4в. Alt+клик по точке убирает её (в режиме выбора) */
  if (seaRoute && seaRoute.kind === 'path') {
    useEditor.getState().setTool('select');
    const firstPoint = seaRoute.points[0];
    const at = screenOf(firstPoint);
    fire('pointerdown', at, { altKey: true });
    fire('pointerup', at, { altKey: true });
    await tick();
    const trimmed = useEditor
      .getState()
      .doc.features.find((f) => f.id === seaRoute.id);
    const left = trimmed && trimmed.kind === 'path' ? trimmed.points.length : -1;
    check('Alt+клик убирает точку', left === 2, `точек стало: ${left}`);

    useEditor.getState().undo();
    await tick();
    const restored = useEditor.getState().doc.features.find((f) => f.id === seaRoute.id);
    const back = restored && restored.kind === 'path' ? restored.points.length : -1;
    check('отмена возвращает точку', back === 3, `точек: ${back}`);
  }

  /* 5. Esc отменяет незавершённую линию */
  useEditor.getState().setTool('river');
  click({ x: 700, y: 900 });
  click({ x: 800, y: 1000 });
  const drafting = Boolean(useEditor.getState().draft);
  key('Escape');
  await tick();
  const cancelled = useEditor.getState().draft === null;
  const rivers = useEditor.getState().doc.features.filter((f) => f.kind === 'path' && f.pathKind === 'river');
  check('Esc отменяет рисование', drafting && cancelled && rivers.length === 0, `черновик был: ${drafting}, рек: ${rivers.length}`);

  /* 6. Delete удаляет выделенное */
  const rail = useEditor.getState().doc.features.find((f) => f.kind === 'path' && f.pathKind === 'rail');
  if (rail) {
    useEditor.getState().select([rail.id]);
    key('Delete');
    await tick();
    const gone = !useEditor.getState().doc.features.some((f) => f.id === rail.id);
    check('Delete удаляет объект', gone);
  }

  /* 7. переключение слоя */
  useEditor.getState().toggleLayerVisible('cities');
  await tick();
  check('слой скрывается', useEditor.getState().doc.layers.cities.visible === false);
  useEditor.getState().toggleLayerVisible('cities');

  /* 8. экспорт PNG через настоящий canvas */
  try {
    const blob = await exportPng(useEditor.getState().doc, 1);
    check('экспорт PNG', blob.size > 2000 && blob.type === 'image/png', `${Math.round(blob.size / 1024)} КБ`);
  } catch (error) {
    check('экспорт PNG', false, String(error));
  }

  /* 9. горячие клавиши при русской раскладке */
  const press = (init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

  const beforeAdd = useEditor.getState().doc.features.length;
  useEditor.getState().addCity({ x: 420, y: 760 });
  await tick();
  const afterAdd = useEditor.getState().doc.features.length;
  // при русской раскладке Z приходит как key="я", ловить надо по code
  press({ key: 'я', code: 'KeyZ', ctrlKey: true });
  await tick();
  const afterUndo = useEditor.getState().doc.features.length;
  check(
    'Ctrl+Z работает с русской раскладкой',
    afterAdd === beforeAdd + 1 && afterUndo === beforeAdd,
    `${beforeAdd} → ${afterAdd} → ${afterUndo}`,
  );

  press({ key: 'с', code: 'KeyC' });
  await tick();
  const toolAfterHotkey = useEditor.getState().tool;
  check('буквенные горячие клавиши работают с русской раскладкой', toolAfterHotkey === 'city', toolAfterHotkey);

  press({ key: 'я', code: 'KeyZ', ctrlKey: true, shiftKey: true });
  await tick();
  check('Ctrl+Shift+Z возвращает отменённое', useEditor.getState().doc.features.length === afterAdd, `объектов: ${useEditor.getState().doc.features.length}`);

  useEditor.getState().setTool('select');

  // оставляем линию выделенной, чтобы на скриншоте была карточка пути с обрезкой
  const seaForShot = useEditor.getState().doc.features.find((f) => f.kind === 'path' && f.pathKind === 'sea');
  if (seaForShot) useEditor.getState().select([seaForShot.id]);

  const finalCanvas = canvasEl();
  const wrap = document.querySelector('.canvas-wrap');
  const wrapBox = wrap ? wrap.getBoundingClientRect() : null;
  check(
    'итоговые размеры после всех действий',
    true,
    finalCanvas
      ? `битмап ${finalCanvas.width}×${finalCanvas.height}, css ${finalCanvas.clientWidth}×${finalCanvas.clientHeight}, wrap ${wrapBox ? `${Math.round(wrapBox.width)}×${Math.round(wrapBox.height)}` : '—'}`
      : 'нет холста',
  );

  const cam = useEditor.getState().camera;
  const world = useEditor.getState().doc.meta;
  const a = toScreen(cam, { x: 0, y: 0 });
  const b = toScreen(cam, { x: world.width, y: world.height });
  const w2 = b.x - a.x;
  const h2 = b.y - a.y;
  check(
    'проекция мира 1:1.5',
    Math.abs(w2 / h2 - world.width / world.height) < 0.02,
    `zoom ${cam.zoom.toFixed(3)}, ${Math.round(w2)}×${Math.round(h2)}, соотношение ${(w2 / h2).toFixed(3)}`,
  );
}

function render(): void {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  logEl.innerHTML =
    `<b>Проверка взаимодействий: ${passed}/${results.length}</b>\n` +
    results
      .map(
        (r) =>
          `<span class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'}</span> ${r.name}${r.detail ? ` — ${r.detail}` : ''}`,
      )
      .join('\n');
  document.title = failed === 0 ? `PASS ${passed}/${results.length}` : `FAIL ${failed}/${results.length}`;
}

run()
  .then(render)
  .catch((error: unknown) => {
    results.push({ name: 'исключение', ok: false, detail: String(error) });
    render();
  });
