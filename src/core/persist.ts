import { renderScene } from './render';
import { defaultLayers, emptyDoc, migrateDoc, type MapDoc } from './types';

export function serializeDoc(doc: MapDoc): string {
  return JSON.stringify(doc);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(name: string, ext: string): string {
  const base = (name || 'map').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'map';
  return `${base}.${ext}`;
}

export function downloadDoc(doc: MapDoc): void {
  const blob = new Blob([serializeDoc(doc)], { type: 'application/json' });
  downloadBlob(blob, safeFilename(doc.meta.name, 'dndmap'));
}

export function parseDoc(text: string): MapDoc {
  const parsed = JSON.parse(text) as Partial<MapDoc>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.features)) {
    throw new Error('Это не файл проекта: нет списка объектов');
  }
  const base = emptyDoc(parsed.meta?.name ?? 'Загруженная карта');
  const doc: MapDoc = {
    version: 1,
    meta: {
      name: parsed.meta?.name ?? base.meta.name,
      width: Number(parsed.meta?.width) || base.meta.width,
      height: Number(parsed.meta?.height) || base.meta.height,
    },
    style: { ...base.style, ...(parsed.style ?? {}) },
    layers: { ...defaultLayers(), ...(parsed.layers ?? {}) },
    features: parsed.features,
  };
  return migrateDoc(doc);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
  });
}

export async function exportPng(doc: MapDoc, scale = 2): Promise<Blob> {
  const width = Math.round(doc.meta.width * scale);
  const height = Math.round(doc.meta.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');

  renderScene(ctx, {
    doc,
    camera: { ox: 0, oy: 0, zoom: scale },
    viewport: { width, height },
    selection: new Set<string>(),
    draft: null,
    tool: 'select',
    marquee: null,
    snap: null,
    exportMode: true,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось собрать PNG'));
    }, 'image/png');
  });
}
