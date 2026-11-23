import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useEditor } from '../core/store';
import { countLatinNamed, formatPopulation } from '../core/text';
import { findWaterPaths } from '../core/water';
import {
  CITY_TYPES,
  CITY_TYPE_LABELS,
  LABEL_FONTS,
  LABEL_FONT_LABELS,
  LABEL_SIDES,
  LABEL_SIDE_ARROWS,
  LABEL_SIDE_LABELS,
  PATH_KINDS,
  PATH_DEFAULT_COLORS,
  PATH_DEFAULT_WIDTH,
  PATH_KIND_LABELS,
  type CityFeature,
  type Feature,
  type LabelFeature,
  type LabelFont,
  type PathFeature,
  type RegionFeature,
} from '../core/types';
import { IconCopy, IconTrash } from './icons';
import { displayName, featureColor, featureKindLabel } from './LeftPanel';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function SelectionHeader({ f }: { f: Feature }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 12px 4px',
      }}
    >
      <span className="obj-dot" style={{ background: featureColor(f), width: 14, height: 14 }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <b style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName(f)}
        </b>
        <small style={{ color: 'var(--muted)', fontSize: 11 }}>{featureKindLabel(f)}</small>
      </div>
    </div>
  );
}

function NotesField({ f }: { f: Feature }) {
  const update = useEditor((s) => s.updateFeature);
  return (
    <Field label="Заметки для ДМ">
      <textarea
        className="input"
        value={f.notes ?? ''}
        placeholder="Что здесь происходит, кто правит, что нашла партия…"
        onChange={(e) => update(f.id, { notes: e.target.value })}
      />
    </Field>
  );
}

function CityForm({ f }: { f: CityFeature }) {
  const update = useEditor((s) => s.updateFeature);
  return (
    <div className="insp">
      <Field label="Название">
        <input
          className="input"
          value={f.name}
          onChange={(e) => update(f.id, { name: e.target.value })}
          placeholder="Название города"
        />
      </Field>
      <Field label="Тип">
        <div className="chips">
          {CITY_TYPES.map((t) => (
            <button
              key={t}
              className={`chip${f.type === t ? ' on' : ''}`}
              onClick={() => update(f.id, { type: t })}
            >
              {CITY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`Размер значка — ${f.size.toFixed(2)}`}>
        <input
          type="range"
          min={0.4}
          max={2.6}
          step={0.05}
          value={f.size}
          onChange={(e) => update(f.id, { size: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Население${f.population ? ` — ${formatPopulation(f.population)}` : ''}`}>
        <input
          className="input"
          type="number"
          min={0}
          step={100}
          placeholder="не задано"
          value={f.population ?? ''}
          onChange={(e) => {
            const raw = e.target.value.trim();
            update(f.id, {
              population: raw === '' ? undefined : Math.max(0, Math.round(Number(raw))),
            });
          }}
        />
      </Field>
      <Field label={`Кегль подписи — ${Math.round(f.labelSize)}`}>
        <input
          type="range"
          min={8}
          max={52}
          step={1}
          value={f.labelSize}
          onChange={(e) => update(f.id, { labelSize: Number(e.target.value) })}
        />
      </Field>
      <Field label="Сторона подписи">
        <div className="chips">
          {LABEL_SIDES.map((side) => (
            <button
              key={side}
              className={`chip${(f.labelSide ?? 'bottom') === side ? ' on' : ''}`}
              onClick={() => update(f.id, { labelSide: side })}
              title={`Подпись ${LABEL_SIDE_LABELS[side].toLowerCase()}`}
            >
              {LABEL_SIDE_ARROWS[side]} {LABEL_SIDE_LABELS[side]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Цвет">
        <div className="row">
          <input
            type="color"
            value={f.color ?? '#2b2118'}
            onChange={(e) => update(f.id, { color: e.target.value })}
          />
          <button className="btn" onClick={() => update(f.id, { color: undefined })}>
            Сброс
          </button>
        </div>
      </Field>
      <div className="kv">
        <span>Координаты</span>
        <b>
          {Math.round(f.pos.x)} · {Math.round(f.pos.y)}
        </b>
      </div>
      <NotesField f={f} />
    </div>
  );
}

function PathForm({ f }: { f: PathFeature }) {
  const update = useEditor((s) => s.updateFeature);
  const doc = useEditor((s) => s.doc);
  const trimPath = useEditor((s) => s.trimPath);
  const start = doc.features.find((x) => x.id === f.startCityId);
  const end = doc.features.find((x) => x.id === f.endCityId);
  let length = 0;
  for (let i = 1; i < f.points.length; i++) {
    length += Math.hypot(f.points[i].x - f.points[i - 1].x, f.points[i].y - f.points[i - 1].y);
  }
  const changeKind = (k: PathFeature['pathKind']) =>
    update(f.id, { pathKind: k, width: PATH_DEFAULT_WIDTH[k], color: PATH_DEFAULT_COLORS[k] });

  return (
    <div className="insp">
      <Field label="Название">
        <input
          className="input"
          value={f.name}
          onChange={(e) => update(f.id, { name: e.target.value })}
        />
      </Field>
      <Field label="Тип линии">
        <div className="chips">
          {PATH_KINDS.map((k) => (
            <button
              key={k}
              className={`chip${f.pathKind === k ? ' on' : ''}`}
              onClick={() => changeKind(k)}
            >
              {PATH_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`Толщина — ${f.width.toFixed(1)}`}>
        <input
          type="range"
          min={1}
          max={14}
          step={0.2}
          value={f.width}
          onChange={(e) => update(f.id, { width: Number(e.target.value) })}
        />
      </Field>
      <Field label="Цвет">
        <div className="row">
          <input
            type="color"
            value={f.color ?? PATH_DEFAULT_COLORS[f.pathKind]}
            onChange={(e) => update(f.id, { color: e.target.value })}
          />
          <button className="btn" onClick={() => update(f.id, { color: undefined })}>
            Сброс
          </button>
        </div>
      </Field>
      <label className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <input
          type="checkbox"
          checked={f.smooth}
          style={{ flex: 'none', width: 16, height: 16 }}
          onChange={(e) => update(f.id, { smooth: e.target.checked })}
        />
        Сглаживать изгибы
      </label>
      <div className="kv">
        <span>Длина</span>
        <b>{Math.round(length)} ед.</b>
      </div>
      <div className="kv">
        <span>Точек</span>
        <b>{f.points.length}</b>
      </div>
      <div className="row">
        <button
          className="btn"
          onClick={() => trimPath(f.id, 'start')}
          title="Убрать первую точку линии (Alt+клик по точке на карте делает то же)"
        >
          − с начала
        </button>
        <button
          className="btn"
          onClick={() => trimPath(f.id, 'end')}
          title="Убрать последнюю точку линии (Alt+клик по точке на карте делает то же)"
        >
          − с конца
        </button>
      </div>
      <div className="empty" style={{ padding: '0' }}>
        Укорачивает линию по одной точке. Alt+клик по любой точке убирает именно её.
      </div>
      <div className="kv">
        <span>Начало → конец</span>
        <b style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {start && start.kind === 'city' ? start.name : '—'} → {end && end.kind === 'city' ? end.name : '—'}
        </b>
      </div>
      <NotesField f={f} />
    </div>
  );
}

function RegionForm({ f }: { f: RegionFeature }) {
  const update = useEditor((s) => s.updateFeature);
  return (
    <div className="insp">
      <Field label="Название">
        <input
          className="input"
          value={f.name}
          onChange={(e) => update(f.id, { name: e.target.value })}
        />
      </Field>
      <Field label="Заливка">
        <input
          type="color"
          value={f.fill}
          onChange={(e) => update(f.id, { fill: e.target.value })}
        />
      </Field>
      <Field label="Обводка">
        <input
          type="color"
          value={f.stroke}
          onChange={(e) => update(f.id, { stroke: e.target.value })}
        />
      </Field>
      <Field label={`Прозрачность заливки — ${Math.round(f.opacity * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={f.opacity}
          onChange={(e) => update(f.id, { opacity: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Толщина обводки — ${f.strokeWidth.toFixed(1)}`}>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={f.strokeWidth}
          onChange={(e) => update(f.id, { strokeWidth: Number(e.target.value) })}
        />
      </Field>
      <label className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
        <input
          type="checkbox"
          checked={f.smooth}
          style={{ flex: 'none', width: 16, height: 16 }}
          onChange={(e) => update(f.id, { smooth: e.target.checked })}
        />
        Сглаживать контур
      </label>
      <div className="kv">
        <span>Вершин</span>
        <b>{f.points.length}</b>
      </div>
      <NotesField f={f} />
    </div>
  );
}

function LabelForm({ f }: { f: LabelFeature }) {
  const update = useEditor((s) => s.updateFeature);
  return (
    <div className="insp">
      <Field label="Текст">
        <input
          className="input"
          value={f.text}
          onChange={(e) => update(f.id, { text: e.target.value })}
        />
      </Field>
      <Field label={`Кегль — ${Math.round(f.size)}`}>
        <input
          type="range"
          min={8}
          max={96}
          step={1}
          value={f.size}
          onChange={(e) => update(f.id, { size: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Поворот — ${Math.round(f.rotation)}°`}>
        <input
          type="range"
          min={-90}
          max={90}
          step={1}
          value={f.rotation}
          onChange={(e) => update(f.id, { rotation: Number(e.target.value) })}
        />
      </Field>
      <Field label="Цвет">
        <input
          type="color"
          value={f.color}
          onChange={(e) => update(f.id, { color: e.target.value })}
        />
      </Field>
      <NotesField f={f} />
    </div>
  );
}

function DocSettings() {
  const doc = useEditor((s) => s.doc);
  const setName = useEditor((s) => s.setName);
  const setDocStyle = useEditor((s) => s.setDocStyle);
  const deleteLatinNamed = useEditor((s) => s.deleteLatinNamed);
  const convertWaterPathsToSea = useEditor((s) => s.convertWaterPathsToSea);
  const autoPlaceCityLabels = useEditor((s) => s.autoPlaceCityLabels);
  const tool = useEditor((s) => s.tool);
  const brushRadius = useEditor((s) => s.brushRadius);
  const setBrushRadius = useEditor((s) => s.setBrushRadius);
  const brushActive = tool === 'landbrush' || tool === 'waterbrush';
  const counts = {
    cities: doc.features.filter((f) => f.kind === 'city').length,
    paths: doc.features.filter((f) => f.kind === 'path').length,
    regions: doc.features.filter((f) => f.kind === 'region').length,
  };
  const latinCount = countLatinNamed(doc.features);
  const waterPaths = useMemo(() => findWaterPaths(doc), [doc]);
  return (
    <>
      <div className="panel-title">{brushActive ? 'Кисть' : 'Карта'}</div>
      {brushActive ? (
        <div className="insp">
          <Field label={`Радиус кисти — ${brushRadius}`}>
            <input
              type="range"
              min={5}
              max={200}
              step={1}
              value={brushRadius}
              onChange={(e) => setBrushRadius(Number(e.target.value))}
            />
          </Field>
          <div className="empty" style={{ padding: '0' }}>
            {tool === 'waterbrush'
              ? 'Тяни мышью по карте — вода закрашивает и сушу, и импортированный берег.'
              : 'Тяни мышью по карте — суша наращивается поверх моря.'}{' '}
            Каждый штрих отменяется одним `Ctrl+Z`.
          </div>
          <div className="kv">
            <span>Мазков на карте</span>
            <b>{doc.paint.length}</b>
          </div>
        </div>
      ) : null}
      <div className="panel-title" style={{ paddingTop: 4 }}>Карта</div>
      <div className="insp">
        <Field label="Название мира">
          <input className="input" value={doc.meta.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Ширина">
            <input
              className="input"
              type="number"
              value={doc.meta.width}
              onChange={(e) =>
                useEditor.getState().commit((d) => {
                  d.meta.width = Math.max(400, Math.min(12000, Number(e.target.value) || 400));
                }, 'doc:size')
              }
            />
          </Field>
          <Field label="Высота">
            <input
              className="input"
              type="number"
              value={doc.meta.height}
              onChange={(e) =>
                useEditor.getState().commit((d) => {
                  d.meta.height = Math.max(400, Math.min(12000, Number(e.target.value) || 400));
                }, 'doc:size')
              }
            />
          </Field>
        </div>
        <Field label="Море">
          <input
            type="color"
            value={doc.style.water}
            onChange={(e) => setDocStyle({ water: e.target.value })}
          />
        </Field>
        <Field label="Суша">
          <input
            type="color"
            value={doc.style.land}
            onChange={(e) => setDocStyle({ land: e.target.value })}
          />
        </Field>
        <Field label="Шрифт названий городов">
          <select
            className="input"
            value={doc.style.labelFont ?? 'sans'}
            onChange={(e) => setDocStyle({ labelFont: e.target.value as LabelFont })}
          >
            {LABEL_FONTS.map((font) => (
              <option key={font} value={font}>
                {LABEL_FONT_LABELS[font]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Размер названий — ${Math.round((doc.style.labelScale ?? 1) * 100)}%`}>
          <input
            type="range"
            min={0.45}
            max={1.4}
            step={0.02}
            value={doc.style.labelScale ?? 1}
            onChange={(e) => setDocStyle({ labelScale: Number(e.target.value) })}
          />
        </Field>
        <label className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
          <input
            type="checkbox"
            checked={Boolean(doc.style.showPopulation)}
            style={{ flex: 'none', width: 16, height: 16 }}
            onChange={(e) => setDocStyle({ showPopulation: e.target.checked })}
          />
          Показывать население под названием
        </label>
        <Field label={`Толщина линий — ${Math.round((doc.style.lineScale ?? 1) * 100)}%`}>
          <input
            type="range"
            min={0.3}
            max={1.6}
            step={0.02}
            value={doc.style.lineScale ?? 1}
            onChange={(e) => setDocStyle({ lineScale: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Размер значков городов — ${Math.round((doc.style.iconScale ?? 1) * 100)}%`}>
          <input
            type="range"
            min={0.4}
            max={1.6}
            step={0.02}
            value={doc.style.iconScale ?? 1}
            onChange={(e) => setDocStyle({ iconScale: Number(e.target.value) })}
          />
        </Field>
        <div className="divider" />
        <div className="kv">
          <span>Городов</span>
          <b>{counts.cities}</b>
        </div>
        <div className="kv">
          <span>Линий</span>
          <b>{counts.paths}</b>
        </div>
        <div className="kv">
          <span>Регионов</span>
          <b>{counts.regions}</b>
        </div>
        <div className="divider" />
        <Field label={`Города и подписи латиницей — ${latinCount}`}>
          <button
            className="btn"
            disabled={latinCount === 0}
            onClick={() => deleteLatinNamed()}
            title="Удалить все города и подписи, названные латиницей (отменяется через Ctrl+Z)"
          >
            Удалить англоязычные
          </button>
        </Field>
        <div className="empty" style={{ padding: '0' }}>
          Убирает города и подписи, у которых в названии только латинские буквы. Отмена — Ctrl+Z.
        </div>
        <Field label={`Дороги и тропы по воде — ${waterPaths.count}`}>
          <button
            className="btn"
            disabled={waterPaths.count === 0}
            onClick={() => convertWaterPathsToSea()}
            title="Перевести линии, идущие по морю, в морские пути (отменяется через Ctrl+Z)"
          >
            Перевести в морские
          </button>
        </Field>
        <div className="empty" style={{ padding: '0' }}>
          Меняет тип у дорог, троп и ж/д, у которых не меньше половины точек лежит на воде: они
          получают штрих-пунктир и попадают в морские пути. Отмена — Ctrl+Z.
        </div>
        <Field label={`Подписи городов — ${counts.cities}`}>
          <button
            className="btn"
            disabled={counts.cities === 0}
            onClick={() => autoPlaceCityLabels()}
            title="Подобрать каждой подписи сторону так, чтобы они не наезжали друг на друга"
          >
            Развести по сторонам
          </button>
        </Field>
        <div className="empty" style={{ padding: '0' }}>
          Крупным городам — первые места, остальным — та сторона, где подпись не задевает соседние.
          Отмена — Ctrl+Z.
        </div>
        <div className="empty" style={{ padding: '8px 0 0' }}>
          Выбери объект на карте, чтобы изменить его свойства. Enter завершает линию, Esc отменяет.
        </div>
      </div>
    </>
  );
}

export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);

  const selected = doc.features.filter((f) => selection.includes(f.id));

  if (selected.length === 0) {
    return (
      <div className="panel panel--right">
        <DocSettings />
      </div>
    );
  }

  if (selected.length > 1) {
    return (
      <div className="panel panel--right">
        <div className="panel-title">Выбрано: {selected.length}</div>
        <div className="insp">
          <div className="row">
            <button className="btn" onClick={duplicateSelection}>
              <IconCopy /> Дублировать
            </button>
            <button className="btn danger" onClick={deleteSelection}>
              <IconTrash /> Удалить
            </button>
          </div>
          <div className="empty" style={{ padding: '4px 0' }}>
            {selected.map((f) => displayName(f)).join(', ')}
          </div>
        </div>
      </div>
    );
  }

  const f = selected[0];
  return (
    <div className="panel panel--right">
      <SelectionHeader f={f} />
      {f.kind === 'city' ? <CityForm f={f} /> : null}
      {f.kind === 'path' ? <PathForm f={f} /> : null}
      {f.kind === 'region' ? <RegionForm f={f} /> : null}
      {f.kind === 'label' ? <LabelForm f={f} /> : null}
      <div className="insp" style={{ paddingTop: 0 }}>
        <div className="row">
          <button className="btn" onClick={duplicateSelection}>
            <IconCopy /> Дублировать
          </button>
          <button className="btn danger" onClick={deleteSelection}>
            <IconTrash /> Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
