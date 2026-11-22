import { useEditor } from '../core/store';
import { layerOf, TOOL_LABELS } from '../core/types';

export function StatusBar() {
  const doc = useEditor((s) => s.doc);
  const camera = useEditor((s) => s.camera);
  const cursor = useEditor((s) => s.cursorWorld);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);

  const counts = doc.features.reduce<Record<string, number>>((acc, f) => {
    const l = layerOf(f);
    acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <footer className="statusbar">
      <span>
        <span className="dot" />
        автосохранение
      </span>
      <span>инструмент: {TOOL_LABELS[tool]}</span>
      <span>объектов: {doc.features.length}</span>
      <span>выбрано: {selection.length}</span>
      <span>
        город: {counts.cities ?? 0} · дорог: {counts.roads ?? 0} · ж/д: {counts.rail ?? 0} · рек:{' '}
        {counts.rivers ?? 0}
      </span>
      <div className="spacer" style={{ flex: 1 }} />
      <span>
        {cursor ? `${Math.round(cursor.x)} : ${Math.round(cursor.y)}` : '— : —'}
      </span>
      <span>{Math.round(camera.zoom * 100)}%</span>
    </footer>
  );
}
