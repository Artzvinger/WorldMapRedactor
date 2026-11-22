import type { Vec2 } from './types';

/**
 * Разбор SVG path data (`d="M...Q...Z"`), который использует Azgaar для
 * сохранения контуров. Кривые сглаживаются в ломаные: для карты этого хватает,
 * зато не нужна зависимость на SVG-парсер.
 */

export interface SubPath {
  points: Vec2[];
  closed: boolean;
}

const TOKEN = /[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function isCommand(token: string): boolean {
  return /^[a-zA-Z]$/.test(token);
}

export function parsePathData(d: string): SubPath[] {
  const tokens = d.match(TOKEN) ?? [];
  const out: SubPath[] = [];

  let i = 0;
  let cmd = '';
  let cur: Vec2 = { x: 0, y: 0 };
  let start: Vec2 = { x: 0, y: 0 };
  let points: Vec2[] = [];
  let closed = false;

  const next = (): number => {
    const value = Number(tokens[i]);
    i += 1;
    return Number.isFinite(value) ? value : 0;
  };

  const flush = () => {
    if (points.length >= 2) out.push({ points, closed });
    points = [];
    closed = false;
  };

  const push = (p: Vec2) => {
    points.push(p);
    cur = p;
  };

  const lineTo = (x: number, y: number) => push({ x, y });

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      cmd = tokens[i];
      i += 1;
    } else if (!cmd) {
      i += 1;
      continue;
    }

    switch (cmd) {
      case 'M':
      case 'm': {
        const x = next();
        const y = next();
        const p = cmd === 'm' ? { x: cur.x + x, y: cur.y + y } : { x, y };
        flush();
        points = [p];
        cur = p;
        start = p;
        cmd = cmd === 'M' ? 'L' : 'l';
        break;
      }
      case 'L':
      case 'l': {
        const x = next();
        const y = next();
        if (cmd === 'l') lineTo(cur.x + x, cur.y + y);
        else lineTo(x, y);
        break;
      }
      case 'H':
      case 'h': {
        const x = next();
        lineTo(cmd === 'h' ? cur.x + x : x, cur.y);
        break;
      }
      case 'V':
      case 'v': {
        const y = next();
        lineTo(cur.x, cmd === 'v' ? cur.y + y : y);
        break;
      }
      case 'C':
      case 'c': {
        const relative = cmd === 'c';
        const p0 = { ...cur };
        const ax = next();
        const ay = next();
        const bx = next();
        const by = next();
        const cx = next();
        const cy = next();
        const c1 = relative ? { x: p0.x + ax, y: p0.y + ay } : { x: ax, y: ay };
        const c2 = relative ? { x: p0.x + bx, y: p0.y + by } : { x: bx, y: by };
        const end = relative ? { x: p0.x + cx, y: p0.y + cy } : { x: cx, y: cy };
        for (let s = 1; s <= 12; s++) {
          const t = s / 12;
          const mt = 1 - t;
          const x =
            mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * end.x;
          const y =
            mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * end.y;
          points.push({ x, y });
        }
        cur = end;
        break;
      }
      case 'S':
      case 's':
      case 'Q':
      case 'q': {
        const relative = cmd === 'q' || cmd === 's';
        const p0 = { ...cur };
        const ax = next();
        const ay = next();
        const bx = next();
        const by = next();
        const c = relative ? { x: p0.x + ax, y: p0.y + ay } : { x: ax, y: ay };
        const end = relative ? { x: p0.x + bx, y: p0.y + by } : { x: bx, y: by };
        for (let s = 1; s <= 10; s++) {
          const t = s / 10;
          const mt = 1 - t;
          points.push({
            x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * end.x,
            y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * end.y,
          });
        }
        cur = end;
        break;
      }
      case 'T':
      case 't': {
        const relative = cmd === 't';
        const x = next();
        const y = next();
        lineTo(relative ? cur.x + x : x, relative ? cur.y + y : y);
        break;
      }
      case 'A':
      case 'a': {
        // дуги в картах Azgaar не встречаются — ведём линию в конечную точку
        next();
        next();
        next();
        next();
        next();
        const x = next();
        const y = next();
        lineTo(cmd === 'a' ? cur.x + x : x, cmd === 'a' ? cur.y + y : y);
        break;
      }
      case 'Z':
      case 'z': {
        closed = true;
        flush();
        cur = start;
        cmd = '';
        break;
      }
      default:
        i += 1;
    }
  }

  flush();
  return out;
}

/** Достаёт все `d` из фрагмента SVG, где встречаются `<path>`. */
export function extractPathData(svgFragment: string): string[] {
  const out: string[] = [];
  const re = /<path\b[^>]*?\sd="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svgFragment))) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

export interface SvgPath {
  id: string | null;
  d: string;
}

/** То же, но с идентификаторами путей (`id="river7"`). */
export function extractPaths(svgFragment: string): SvgPath[] {
  const out: SvgPath[] = [];
  const re = /<path\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svgFragment))) {
    const attrs = match[1];
    const d = /\sd="([^"]*)"/.exec(attrs);
    if (!d || !d[1]) continue;
    const id = /\bid="([^"]*)"/.exec(attrs);
    out.push({ id: id ? id[1] : null, d: d[1] });
  }
  return out;
}

/** Содержимое группы `<g id="...">` вместе с вложенными тегами. */
export function extractGroup(svg: string, id: string): string | null {
  const openRe = new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*>`);
  const open = openRe.exec(svg);
  if (!open) return null;
  const startIndex = open.index + open[0].length;
  const tagRe = /<g\b[^>]*>|<\/g>/g;
  tagRe.lastIndex = open.index;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(svg))) {
    const tag = match[0];
    if (tag === '</g>') {
      depth -= 1;
    } else if (!tag.endsWith('/>')) {
      // самозакрывающиеся <g .../> вложенности не добавляют: в старых версиях
      // Azgaar так записаны пустые группы, и без этой проверки группа
      // «разъезжается» до конца документа
      depth += 1;
    }
    if (depth === 0) return svg.slice(startIndex, match.index);
  }
  return svg.slice(startIndex);
}
