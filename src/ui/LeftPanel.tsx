import { useMemo, useState } from 'react';
import { useEditor } from '../core/store';
import {
  LAYER_LABELS,
  LAYER_ORDER,
  layerOf,
  PATH_DEFAULT_COLORS,
  type Feature,
  type LayerId,
} from '../core/types';
import { IconEye, IconEyeOff, IconLock, IconSearch, IconUnlock } from './icons';

const LAYER_SWATCH: Record<LayerId, string> = {
  land: '#e8e0cb',
  regions: '#7d9b62',
  borders: '#4a3f63',
  provinces: '#8d84a3',
  rivers: '#4e7f9f',
  roads: '#8a5636',
  rail: '#33302c',
  cities: '#2b2118',
  labels: '#3a2f22',
};

export function displayName(f: Feature): string {
  switch (f.kind) {
    case 'city':
      return f.name || 'Без названия';
    case 'path':
      return f.name || 'Линия';
    case 'region':
      return f.name || 'Регион';
    case 'label':
      return f.text || 'Подпись';
    case 'land':
      return 'Суша';
  }
}

export function featureColor(f: Feature): string {
  switch (f.kind) {
    case 'city':
      return f.color ?? '#2b2118';
    case 'path':
      return f.color ?? PATH_DEFAULT_COLORS[f.pathKind];
    case 'region':
      return f.fill;
    case 'label':
      return f.color;
    case 'land':
      return '#e8e0cb';
  }
}

export function featureKindLabel(f: Feature): string {
  switch (f.kind) {
    case 'city':
      return 'город';
    case 'path':
      switch (f.pathKind) {
        case 'rail':
          return 'ж/д';
        case 'river':
          return 'река';
        case 'sea':
          return 'морской путь';
        case 'border':
          return 'граница страны';
        case 'province':
          return 'граница области';
        default:
          return 'дорога';
      }
    case 'region':
      return 'регион';
    case 'label':
      return 'подпись';
    case 'land':
      return 'суша';
  }
}

/** Порядок в списке объектов: сначала то, что чаще всего ищут. */
function listRank(f: Feature): number {
  if (f.kind === 'city') {
    switch (f.type) {
      case 'capital':
        return 0;
      case 'city':
        return 1;
      case 'town':
        return 2;
      case 'village':
        return 3;
      default:
        return 4;
    }
  }
  if (f.kind === 'region') return 5;
  if (f.kind === 'label') return 6;
  if (f.kind === 'path') {
    if (f.pathKind === 'rail') return 7;
    if (f.pathKind === 'river') return 8;
    if (f.pathKind === 'province') return 10;
    if (f.pathKind === 'border') return 11;
    return 9;
  }
  return 12;
}

function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const toggleVisible = useEditor((s) => s.toggleLayerVisible);
  const toggleLocked = useEditor((s) => s.toggleLayerLocked);
  const setOpacity = useEditor((s) => s.setLayerOpacity);
  const [openLayer, setOpenLayer] = useState<LayerId | null>(null);

  const counts = useMemo(() => {
    const map = new Map<LayerId, number>();
    for (const f of doc.features) {
      const l = layerOf(f);
      map.set(l, (map.get(l) ?? 0) + 1);
    }
    return map;
  }, [doc.features]);

  const order = [...LAYER_ORDER].reverse();

  return (
    <>
      <div className="panel-title">Слои</div>
      {order.map((id) => {
        const layer = doc.layers[id];
        const open = openLayer === id;
        return (
          <div key={id}>
            <div className={`layer${layer.visible ? '' : ' hidden-layer'}`}>
              <button
                className="mini"
                title={layer.visible ? 'Скрыть слой' : 'Показать слой'}
                onClick={() => toggleVisible(id)}
              >
                {layer.visible ? <IconEye /> : <IconEyeOff />}
              </button>
              <div className="layer-name" onClick={() => setOpenLayer(open ? null : id)}>
                <b>{LAYER_LABELS[id]}</b>
                <small>
                  {counts.get(id) ?? 0} · {Math.round(layer.opacity * 100)}%
                </small>
              </div>
              <div className="layer-btns">
                <span className="swatch" style={{ background: LAYER_SWATCH[id] }} />
                <button
                  className={`mini${layer.locked ? ' on' : ''}`}
                  title={layer.locked ? 'Разблокировать' : 'Заблокировать'}
                  onClick={() => toggleLocked(id)}
                >
                  {layer.locked ? <IconLock /> : <IconUnlock />}
                </button>
              </div>
            </div>
            {open ? (
              <div style={{ padding: '2px 14px 8px 34px' }}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.opacity}
                  onChange={(e) => setOpacity(id, Number(e.target.value))}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function ObjectList() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const centerOn = useEditor((s) => s.centerOn);
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doc.features
      .filter((f) => f.kind !== 'land')
      .filter((f) => (q ? displayName(f).toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) => listRank(a) - listRank(b) || displayName(a).localeCompare(displayName(b), 'ru'));
  }, [doc.features, query]);

  const LIMIT = 300;
  const shown = items.slice(0, LIMIT);

  return (
    <>
      <div className="panel-title" style={{ paddingBottom: 6 }}>
        Объекты
        <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{items.length}</span>
      </div>
      <div style={{ padding: '0 10px 8px', position: 'relative' }}>
        <IconSearch
          style={{
            width: 14,
            height: 14,
            position: 'absolute',
            left: 18,
            top: 9,
            color: 'var(--muted)',
          }}
        />
        <input
          className="input"
          style={{ paddingLeft: 28 }}
          placeholder="Поиск по названию"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="obj-list">
        {items.length === 0 ? <div className="empty">Пока пусто. Поставь первый город.</div> : null}
        {shown.map((f) => {
          const active = selection.includes(f.id);
          return (
            <div
              key={f.id}
              className={`obj${active ? ' active' : ''}`}
              onClick={(e) => select([f.id], e.shiftKey)}
              onDoubleClick={() => {
                const pos = f.kind === 'city' || f.kind === 'label' ? f.pos : f.points[0];
                if (pos) centerOn(pos);
              }}
              title="Двойной клик — показать на карте"
            >
              <span className="obj-dot" style={{ background: featureColor(f) }} />
              <span className="obj-name">{displayName(f)}</span>
              <span className="obj-kind">{featureKindLabel(f)}</span>
            </div>
          );
        })}
        {items.length > LIMIT ? (
          <div className="empty" style={{ padding: '6px 8px' }}>
            показано {LIMIT} из {items.length} — уточни поиск
          </div>
        ) : null}
      </div>
    </>
  );
}

export function LeftPanel() {
  return (
    <div className="panel">
      <LayersPanel />
      <div className="divider" style={{ margin: '8px 0' }} />
      <ObjectList />
    </div>
  );
}
