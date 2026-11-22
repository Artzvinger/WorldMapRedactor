import { Fragment, type ComponentType } from 'react';
import { useEditor } from '../core/store';
import type { ToolId } from '../core/types';
import {
  IconCity,
  IconLabel,
  IconPan,
  IconRail,
  IconRegion,
  IconRiver,
  IconRoad,
  IconSea,
  IconSelect,
} from './icons';

interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
  icon: ComponentType<{ className?: string }>;
  divider?: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Выбор', key: 'V', icon: IconSelect },
  { id: 'pan', label: 'Прокрутка', key: 'H', icon: IconPan },
  { id: 'city', label: 'Город', key: 'C', icon: IconCity, divider: true },
  { id: 'road', label: 'Дорога', key: 'R', icon: IconRoad, divider: true },
  { id: 'rail', label: 'Железная дорога', key: 'X', icon: IconRail },
  { id: 'sea', label: 'Морской путь', key: 'S', icon: IconSea },
  { id: 'river', label: 'Река', key: 'W', icon: IconRiver },
  { id: 'region', label: 'Регион', key: 'G', icon: IconRegion, divider: true },
  { id: 'label', label: 'Подпись', key: 'L', icon: IconLabel },
];

export function Tools() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <div className="tools">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <Fragment key={t.id}>
            {t.divider ? <div className="tool-sep" /> : null}
            <button
              className={`tool${tool === t.id ? ' active' : ''}`}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              onClick={() => setTool(t.id)}
            >
              <Icon />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
