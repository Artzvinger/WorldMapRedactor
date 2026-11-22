import { beforeEach, describe, expect, it } from 'vitest';
import { pointInPolygon, sampleSmooth, ticksAlong, distToSegment } from './geometry';
import { pickAt, useEditor } from './store';
import { emptyDoc, layerOf, type CityFeature, type PathFeature } from './types';

function reset() {
  useEditor.getState().loadDoc(emptyDoc('Тест'));
  useEditor.setState({
    camera: { ox: 0, oy: 0, zoom: 1 },
    selection: [],
    draft: null,
    past: [],
    future: [],
    dragBase: null,
    marquee: null,
    tool: 'select',
  });
}

const cities = () => useEditor.getState().doc.features.filter((f): f is CityFeature => f.kind === 'city');
const paths = () => useEditor.getState().doc.features.filter((f): f is PathFeature => f.kind === 'path');

beforeEach(reset);

describe('геометрия', () => {
  it('определяет точку внутри полигона', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('считает расстояние до отрезка', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
    expect(distToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  it('ставит шпалы через равные интервалы', () => {
    const ticks = ticksAlong(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(ticks.length).toBe(10);
    expect(ticks[0].x).toBeCloseTo(5);
    expect(ticks[0].nx).toBeCloseTo(0);
    expect(Math.abs(ticks[0].ny)).toBeCloseTo(1);
  });

  it('сглаживает замкнутый контур обратно в замыкание', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    const smooth = sampleSmooth(tri, true, 8);
    expect(smooth.length).toBeGreaterThan(20);
    const first = smooth[0];
    const last = smooth[smooth.length - 1];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(1);
  });
});

describe('редактор', () => {
  it('ставит город и отменяет действие', () => {
    useEditor.getState().addCity({ x: 100, y: 100 });
    expect(cities()).toHaveLength(1);
    expect(useEditor.getState().selection).toHaveLength(1);

    useEditor.getState().undo();
    expect(cities()).toHaveLength(0);

    useEditor.getState().redo();
    expect(cities()).toHaveLength(1);
  });

  it('находит город под курсором', () => {
    useEditor.getState().addCity({ x: 100, y: 100 });
    const hit = pickAt({ x: 104, y: 101 });
    expect(hit?.kind).toBe('city');
    expect(pickAt({ x: 400, y: 400 })).toBeNull();
  });

  it('достраивает дорогу между городами и цепляет концы', () => {
    useEditor.getState().addCity({ x: 100, y: 100 });
    useEditor.getState().addCity({ x: 500, y: 300 });
    const [a, b] = cities();

    useEditor.getState().setTool('road');
    useEditor.getState().startDraft('road', { x: a.pos.x, y: a.pos.y });
    useEditor.getState().addDraftPoint({ x: 300, y: 260 });
    useEditor.getState().addDraftPoint({ x: b.pos.x, y: b.pos.y });
    useEditor.getState().finishDraft();

    const [road] = paths();
    expect(road).toBeTruthy();
    expect(road.pathKind).toBe('road');
    expect(road.points).toHaveLength(3);
    expect(road.startCityId).toBe(a.id);
    expect(road.endCityId).toBe(b.id);
    expect(useEditor.getState().draft).toBeNull();
  });

  it('не создаёт регион из двух точек', () => {
    useEditor.getState().startDraft('region', { x: 0, y: 0 });
    useEditor.getState().addDraftPoint({ x: 100, y: 0 });
    useEditor.getState().finishDraft();
    expect(useEditor.getState().doc.features).toHaveLength(0);

    useEditor.getState().startDraft('region', { x: 0, y: 0 });
    useEditor.getState().addDraftPoint({ x: 100, y: 0 });
    useEditor.getState().addDraftPoint({ x: 50, y: 80 });
    useEditor.getState().finishDraft();
    expect(useEditor.getState().doc.features).toHaveLength(1);
  });

  it('двигает выбранный город и откатывает перемещение одним шагом', () => {
    useEditor.getState().addCity({ x: 100, y: 100 });
    const [city] = cities();

    useEditor.getState().beginTransform();
    useEditor.getState().transformSelection(40, 25);
    useEditor.getState().transformSelection(60, 35);
    useEditor.getState().endTransform();

    expect(cities()[0].pos).toEqual({ x: 160, y: 135 });

    useEditor.getState().undo();
    expect(cities()[0].pos).toEqual({ x: 100, y: 100 });
    expect(useEditor.getState().selection).toEqual([]);

    void city;
  });

  it('удаляет выделенное и чистит привязки дорог', () => {
    useEditor.getState().addCity({ x: 100, y: 100 });
    useEditor.getState().addCity({ x: 500, y: 300 });
    const [a, b] = cities();
    useEditor.getState().startDraft('road', a.pos);
    useEditor.getState().addDraftPoint(b.pos);
    useEditor.getState().finishDraft();

    useEditor.getState().select([b.id]);
    useEditor.getState().deleteSelection();

    const [road] = paths();
    expect(road.endCityId).toBeNull();
    expect(cities()).toHaveLength(1);
  });

  it('рисует морской путь отдельным типом', () => {
    const store = useEditor.getState();
    store.setTool('sea');
    store.startDraft('sea', { x: 100, y: 900 });
    store.addDraftPoint({ x: 400, y: 1000 });
    store.addDraftPoint({ x: 700, y: 950 });
    store.finishDraft();

    const [route] = paths();
    expect(route).toBeTruthy();
    expect(route.pathKind).toBe('sea');
    expect(route.name).toBe('Новый морской путь');
    expect(route.width).toBeGreaterThan(1);
    expect(route.points).toHaveLength(3);
    // морской путь живёт в слое дорог
    expect(layerOf(route)).toBe('roads');
  });

  it('укорачивает линию по одной точке с любого конца', () => {
    const store = useEditor.getState();
    store.startDraft('road', { x: 0, y: 0 });
    store.addDraftPoint({ x: 100, y: 0 });
    store.addDraftPoint({ x: 200, y: 50 });
    store.addDraftPoint({ x: 300, y: 90 });
    store.finishDraft();

    const [road] = paths();
    expect(road.points).toHaveLength(4);

    useEditor.getState().trimPath(road.id, 'end');
    expect(paths()[0].points).toHaveLength(3);
    expect(paths()[0].endCityId).toBeNull();

    useEditor.getState().trimPath(road.id, 'start');
    expect(paths()[0].points).toHaveLength(2);
    expect(paths()[0].startCityId).toBeNull();

    // от линии из двух точек после обрезки не остаётся ничего
    useEditor.getState().trimPath(road.id, 'end');
    expect(paths()).toHaveLength(0);

    useEditor.getState().undo();
    expect(paths()[0].points).toHaveLength(2);
  });

  it('убирает отдельную точку из середины', () => {
    const store = useEditor.getState();
    store.startDraft('road', { x: 0, y: 0 });
    store.addDraftPoint({ x: 100, y: 40 });
    store.addDraftPoint({ x: 200, y: 0 });
    store.finishDraft();

    const [road] = paths();
    useEditor.getState().removeVertex(road.id, 1);
    expect(paths()[0].points).toHaveLength(2);
    expect(paths()[0].points[1]).toEqual({ x: 200, y: 0 });

    useEditor.getState().undo();
    expect(paths()[0].points).toHaveLength(3);
  });

  it('удаляет только англоязычные города и подписи, одной отменой', () => {
    const store = useEditor.getState();
    store.addCity({ x: 100, y: 100 });
    store.addCity({ x: 200, y: 200 });
    store.addCity({ x: 300, y: 300 });
    const [first, second, third] = cities();
    store.updateFeature(first.id, { name: 'Rheingen' });
    store.updateFeature(second.id, { name: 'Иштарра' });
    store.updateFeature(third.id, { name: 'Ladennivis' });

    store.addLabel({ x: 600, y: 400 });
    const [label] = useEditor.getState().doc.features.filter((f) => f.kind === 'label');
    store.updateFeature(label.id, { text: 'MARE TENEBRARUM' });

    // дорога от удаляемого города — привязка должна обнулиться
    useEditor.getState().startDraft('road', first.pos);
    useEditor.getState().addDraftPoint(second.pos);
    useEditor.getState().finishDraft();
    expect(paths()[0].startCityId).toBe(first.id);

    const removed = useEditor.getState().deleteLatinNamed();
    expect(removed).toBe(3);
    expect(useEditor.getState().doc.features).toHaveLength(2);

    const left = useEditor.getState().doc.features;
    expect(left.some((f) => f.kind === 'city' && f.name === 'Иштарра')).toBe(true);
    expect(left.some((f) => f.kind === 'path' && f.startCityId === null)).toBe(true);

    useEditor.getState().undo();
    expect(useEditor.getState().doc.features).toHaveLength(5);
  });
});
