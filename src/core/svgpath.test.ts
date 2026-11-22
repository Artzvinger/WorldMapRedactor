import { describe, expect, it } from 'vitest';
import { extractGroup, extractPaths, parsePathData } from './svgpath';

describe('разбор SVG', () => {
  it('не разъезжается на самозакрывающихся группах', () => {
    // в Azgaar 1.108 пустые группы записаны как <g .../>, и без учёта этого
    // граница группы уезжала в конец документа
    const svg =
      '<g id="lakes"><g id="freshwater"/><g id="salt"/></g>' +
      '<g id="rivers"><path id="river1" d="M0,0L10,10"/><path id="river2" d="M5,5L6,6"/></g>';

    const lakes = extractGroup(svg, 'lakes');
    expect(lakes).toBe('<g id="freshwater"/><g id="salt"/>');

    const rivers = extractGroup(svg, 'rivers');
    expect(rivers).not.toBeNull();
    expect(extractPaths(rivers as string)).toHaveLength(2);
    expect(extractPaths(rivers as string)[0].id).toBe('river1');
  });

  it('понимает вложенные группы', () => {
    const svg = '<g id="outer"><g id="inner"><path d="M0,0L1,1"/></g></g><g id="tail"><path d="M2,2L3,3"/></g>';
    expect(extractGroup(svg, 'outer')).toBe('<g id="inner"><path d="M0,0L1,1"/></g>');
    expect(extractGroup(svg, 'inner')).toBe('<path d="M0,0L1,1"/>');
    expect(extractGroup(svg, 'tail')).toBe('<path d="M2,2L3,3"/>');
  });

  it('разбирает path data с кривыми и замыканием', () => {
    const sub = parsePathData('M10,10 L20,10 C30,10 30,20 20,20 Q10,20 10,10 Z');
    expect(sub).toHaveLength(1);
    expect(sub[0].closed).toBe(true);
    expect(sub[0].points.length).toBeGreaterThan(10);
    expect(sub[0].points[0]).toEqual({ x: 10, y: 10 });
  });

  it('понимает относительные команды', () => {
    const sub = parsePathData('m0,0 l10,0 l0,10 z');
    expect(sub[0].points[1]).toEqual({ x: 10, y: 0 });
    expect(sub[0].points[2]).toEqual({ x: 10, y: 10 });
  });
});
