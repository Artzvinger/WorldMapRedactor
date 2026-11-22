import { useRef, useState } from 'react';
import { importAzgaarMap } from '../core/azgaar';
import { downloadBlob, downloadDoc, exportPng, parseDoc, readFileAsText, safeFilename } from '../core/persist';
import { useEditor } from '../core/store';
import {
  IconFit,
  IconFolder,
  IconImage,
  IconRedo,
  IconSave,
  IconSparkle,
  IconUndo,
} from './icons';

export function TopBar() {
  const doc = useEditor((s) => s.doc);
  const setName = useEditor((s) => s.setName);
  const pastCount = useEditor((s) => s.past.length);
  const futureCount = useEditor((s) => s.future.length);
  const [busy, setBusy] = useState(false);

  const openRef = useRef<HTMLInputElement>(null);
  const azgaarRef = useRef<HTMLInputElement>(null);

  const fit = () => {
    const { viewport } = useEditor.getState();
    useEditor.getState().fitToScreen(viewport.width, viewport.height);
  };

  const onOpenFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const next = parseDoc(text);
      useEditor.getState().loadDoc(next);
      fit();
    } catch (err) {
      window.alert(`Не удалось открыть проект: ${(err as Error).message}`);
    }
  };

  const onAzgaarFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await readFileAsText(file);
      const { doc: next, report } = importAzgaarMap(text);
      useEditor.getState().loadDoc(next);
      fit();
      window.alert(`Импорт Azgaar завершён.\n\n${report.join('\n')}`);
    } catch (err) {
      window.alert(`Не удалось импортировать карту Azgaar: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      if (azgaarRef.current) azgaarRef.current.value = '';
    }
  };

  const onExportPng = async () => {
    setBusy(true);
    try {
      const blob = await exportPng(doc, 2);
      downloadBlob(blob, safeFilename(doc.meta.name, 'png'));
    } catch (err) {
      window.alert(`Не удалось сохранить PNG: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const onNew = () => {
    if (doc.features.length > 0 && !window.confirm('Создать новую карту? Текущая останется в файле, если сохранишь.')) {
      return;
    }
    useEditor.getState().newDoc();
    fit();
  };

  return (
    <header className="topbar">
      <div className="brand">
        <b>КАРТОГРАФ</b>
        <span>редактор миров</span>
      </div>

      <input
        className="docname"
        value={doc.meta.name}
        onChange={(e) => setName(e.target.value)}
        title="Название мира"
      />

      <div className="tool-sep" style={{ width: 1, height: 22 }} />

      <button
        className="btn"
        title="Отменить (Ctrl+Z)"
        disabled={pastCount === 0}
        onClick={() => useEditor.getState().undo()}
      >
        <IconUndo />
      </button>
      <button
        className="btn"
        title="Повторить (Ctrl+Shift+Z)"
        disabled={futureCount === 0}
        onClick={() => useEditor.getState().redo()}
      >
        <IconRedo />
      </button>

      <div className="spacer" />

      <button className="btn" onClick={onNew} title="Новая карта">
        Новая
      </button>
      <button className="btn" onClick={() => openRef.current?.click()} title="Открыть проект .dndmap">
        <IconFolder /> Открыть
      </button>
      <button className="btn" onClick={() => downloadDoc(doc)} title="Сохранить проект (Ctrl+S)">
        <IconSave /> Сохранить
      </button>
      <button className="btn" onClick={onExportPng} disabled={busy} title="Экспорт картинки">
        <IconImage /> PNG
      </button>
      <button
        className="btn"
        onClick={() => azgaarRef.current?.click()}
        disabled={busy}
        title="Импорт .map из Fantasy Map Generator"
      >
        <IconSparkle /> Azgaar
      </button>
      <button className="btn" onClick={fit} title="Вписать карту (0)">
        <IconFit />
      </button>

      <input
        ref={openRef}
        type="file"
        accept=".dndmap,.json,application/json"
        hidden
        onChange={(e) => void onOpenFile(e.target.files?.[0])}
      />
      <input
        ref={azgaarRef}
        type="file"
        accept=".map,.json,application/json"
        hidden
        onChange={(e) => void onAzgaarFile(e.target.files?.[0])}
      />
    </header>
  );
}
