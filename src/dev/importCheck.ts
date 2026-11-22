/**
 * Отладочная страница: импортирует настоящий .map из Azgaar и рисует результат
 * тем же рендерером, что и редактор. Открывать /import-check.html на dev-сервере.
 */
import { importAzgaarMap } from '../core/azgaar';
import { fitCamera } from '../core/camera';
import { renderScene } from '../core/render';
import type { Vec2 } from '../core/types';

const statusEl = document.getElementById('status');
const canvas = document.getElementById('c') as HTMLCanvasElement | null;

function setStatus(html: string): void {
  if (statusEl) statusEl.innerHTML = html;
}

async function main(): Promise<void> {
  if (!canvas) return;
  try {
    setStatus('качаем файл…');
    const response = await fetch('/dev-sample.map');
    if (!response.ok) throw new Error(`файл не отдаётся: ${response.status}`);
    const text = await response.text();

    setStatus(`разбираем ${(text.length / 1024 / 1024).toFixed(1)} МБ…`);
    const t0 = performance.now();
    const { doc, report } = importAzgaarMap(text);
    const parseMs = performance.now() - t0;

    let points = 0;
    for (const f of doc.features) {
      points += f.kind === 'city' || f.kind === 'label' ? 1 : f.points.length;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight - 46;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('нет контекста canvas');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const camera = fitCamera(doc.meta.width, doc.meta.height, width, height, 24);
    const emptyPoints: Vec2[] = [];

    const t1 = performance.now();
    renderScene(ctx, {
      doc,
      camera,
      viewport: { width, height },
      selection: new Set<string>(),
      draft: null,
      tool: 'select',
      marquee: null,
      snap: null,
    });
    const drawMs = performance.now() - t1;

    const t2 = performance.now();
    for (let i = 0; i < 3; i++) {
      renderScene(ctx, {
        doc,
        camera,
        viewport: { width, height },
        selection: new Set<string>(),
        draft: null,
        tool: 'select',
        marquee: null,
        snap: null,
      });
    }
    const avgMs = (performance.now() - t2) / 3;
    void emptyPoints;

    setStatus(
      `<b>${report.join(' · ')}</b><br>объектов ${doc.features.length}, точек ${points}, ` +
        `мир ${doc.meta.width}×${doc.meta.height}, парсинг ${parseMs.toFixed(0)} мс, ` +
        `первая отрисовка ${drawMs.toFixed(0)} мс, дальше ${avgMs.toFixed(0)} мс/кадр`,
    );
  } catch (error) {
    setStatus(`<b style="color:#d2705f">Ошибка: ${(error as Error).message}</b>`);
  }
}

void main();
