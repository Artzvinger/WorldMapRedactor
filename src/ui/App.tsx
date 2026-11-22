import { useEffect } from 'react';
import { importAzgaarMap } from '../core/azgaar';
import { useEditor } from '../core/store';
import { CanvasView } from './CanvasView';
import { Inspector } from './Inspector';
import { LeftPanel } from './LeftPanel';
import { StatusBar } from './StatusBar';
import { Tools } from './Tools';
import { TopBar } from './TopBar';

/** Только для разработки: `?import=/path/to.map` сразу подгружает карту Azgaar. */
function useDevImport(): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const source = new URLSearchParams(window.location.search).get('import');
    if (!source) return;
    void (async () => {
      try {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`не удалось скачать ${source}`);
        const { doc, report } = importAzgaarMap(await response.text());
        const query = new URLSearchParams(window.location.search);
        const store = useEditor.getState();
        store.loadDoc(doc);
        const cleanup = query.get('cleanup');
        if (cleanup === 'latin') {
          const removed = useEditor.getState().deleteLatinNamed();
          console.info(`[импорт Azgaar] удалено латинских подписей: ${removed}`);
        }
        if (cleanup === 'water') {
          const moved = useEditor.getState().convertWaterPathsToSea();
          console.info(`[импорт Azgaar] переведено в морские пути: ${moved}`);
        }
        if (cleanup === 'labels') {
          const moved = useEditor.getState().autoPlaceCityLabels();
          console.info(`[импорт Azgaar] подписей переставлено: ${moved}`);
        }
        if (query.get('population') === '1') {
          useEditor.getState().setDocStyle({ showPopulation: true });
        }
        const { viewport } = useEditor.getState();
        store.fitToScreen(viewport.width || 1200, viewport.height || 800);
        console.info('[импорт Azgaar]', report.join(' · '));
      } catch (error) {
        console.error('Импорт Azgaar не удался:', error);
      }
    })();
  }, []);
}

export function App() {
  useDevImport();
  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Tools />
        <LeftPanel />
        <CanvasView />
        <Inspector />
      </div>
      <StatusBar />
    </div>
  );
}
