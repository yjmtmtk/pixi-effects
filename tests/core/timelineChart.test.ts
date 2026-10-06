import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { CompositionSequence } from '../../src/sequences/Composition';
import { Sequence } from '../../src/sequences/Base';
import { Container } from 'pixi.js';
import { registerSequenceType } from '../../src/core/Composition';
import { expandTransitions } from '../../src/core/Transitions';
import { collectTimeline, timelineHtml, timelineSvg } from '../../src/core/timelineChart';
import type { CompositionSequenceSpec, CompositionShape } from '../../src/types';

class Box extends Sequence {
  async build(): Promise<void> { this.target = new Container(); this.intrinsicWidth = 200; this.intrinsicHeight = 100; }
}
registerSequenceType('__box', Box as never);

const shape: CompositionShape = { width: 1280, height: 720, duration: 12 };
async function scene(sequences: unknown[], extra: Record<string, unknown> = {}) {
  const base = { type: 'composition', width: 1280, height: 720, duration: 12, sequences, ...extra } as unknown as CompositionSequenceSpec;
  const spec = extra.transitions ? expandTransitions(base) : base;
  const comp = new CompositionSequence(spec, shape, shape);
  await comp.build();
  comp.bindTimeline(gsap.timeline({ paused: true }));
  return comp;
}
beforeEach(() => { vi.restoreAllMocks(); });

describe('collectTimeline', () => {
  it('one row per layer: name, type, start, end (a layer without a duration lasts to the end)', async () => {
    const data = collectTimeline(await scene([
      { type: '__box', name: 'bg' },
      { type: '__box', name: 'title', at: 2, duration: 3 },
      { type: '__box', name: 'late', at: 8 },
    ]), 12);
    expect(data.duration).toBe(12);
    expect(data.rows.map(r => [r.name, r.type, r.start, r.end])).toEqual([
      ['bg', '__box', 0, 12], ['title', '__box', 2, 5], ['late', '__box', 8, 12],
    ]);
  });

  it('keyframe times are layer-local in the spec and ABSOLUTE in the row (negative at counts back from the end)', async () => {
    const data = collectTimeline(await scene([
      { type: '__box', name: 'a', at: 2, duration: 4, keyframes: [{ at: 0, to: { alpha: 1 }, duration: 1 }, { at: 1.5, set: { alpha: 0 } }, { at: -1, to: { alpha: 0 }, duration: 1 }] },
    ]), 12);
    expect(data.rows[0]!.keys).toEqual([2, 3.5, 5]);
  });

  it('nested compositions: children sit inside their parent at depth + 1, with times offset by the parent\'s start', async () => {
    const data = collectTimeline(await scene([
      { type: 'composition', name: 'card', at: 3, duration: 5, width: 100, height: 100,
        sequences: [{ type: '__box', name: 'inner', at: 1, duration: 2, keyframes: [{ at: 0.5, set: { alpha: 1 } }] }] },
    ]), 12);
    expect(data.rows.map(r => [r.name, r.depth, r.start, r.end])).toEqual([['card', 0, 3, 8], ['inner', 1, 4, 6]]);
    expect(data.rows[1]!.keys).toEqual([4.5]);
  });

  it('transitions become windows between two named layers', async () => {
    const data = collectTimeline(await scene(
      [{ type: '__box', name: 'a', duration: 5 }, { type: '__box', name: 'b', at: 4, duration: 8 }],
      { transitions: [{ kind: 'crossfade', from: 'a', to: 'b', at: 4, duration: 1 }] },
    ), 12);
    expect(data.transitions).toEqual([{ from: 'a', to: 'b', start: 4, end: 5 }]);
  });

  it('a run of similar layers (pop-1 … pop-12) is one row with a part per layer, so hundreds of layers stay readable', async () => {
    const pops = Array.from({ length: 12 }, (_, i) => ({ type: '__box', name: 'pop-' + i, at: i * 0.5, duration: 0.2 }));
    const data = collectTimeline(await scene([{ type: '__box', name: 'bg' }, ...pops, { type: '__box', name: 'end', at: 10 }]), 12);
    expect(data.rows.map(r => r.name)).toEqual(['bg', 'pop-# ×12', 'end']);
    const group = data.rows[1]!;
    expect(group.parts).toHaveLength(12);
    expect(group.start).toBe(0);
    expect(group.end).toBeCloseTo(5.7, 9);
  });

  it('similar layers are grouped even when other layers sit between them (ring10-0, flash10, ring9-1, flash9, …)', async () => {
    const seqs = Array.from({ length: 5 }, (_, i) => [
      { type: '__box', name: `ring${10 - i}-0`, at: i, duration: 1 }, { type: '__box', name: `flash${10 - i}`, at: i, duration: 0.3 },
    ]).flat();
    const data = collectTimeline(await scene(seqs), 12);
    expect(data.rows.map(r => r.name)).toEqual(['ring#-# ×5', 'flash# ×5']);
  });

  it('a composition is never grouped away: its children stay under it', async () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({ type: 'composition', name: 'card' + i, at: i, duration: 2, width: 10, height: 10, sequences: [{ type: '__box', name: 'in' + i }] }));
    const data = collectTimeline(await scene(cards), 12);
    expect(data.rows.map(r => r.name)).toEqual(['card0', 'in0', 'card1', 'in1', 'card2', 'in2', 'card3', 'in3', 'card4', 'in4']);
  });

  it('fewer than four similar layers are not grouped', async () => {
    const data = collectTimeline(await scene([
      { type: '__box', name: 'dot-1' }, { type: '__box', name: 'dot-2' }, { type: '__box', name: 'dot-3' },
    ]), 12);
    expect(data.rows.map(r => r.name)).toEqual(['dot-1', 'dot-2', 'dot-3']);
  });

  it('an unnamed layer is called type#index, like movie.inspect does', async () => {
    const data = collectTimeline(await scene([{ type: '__box' }, { type: '__box' }]), 12);
    expect(data.rows.map(r => r.name)).toEqual(['__box#0', '__box#1']);
  });
});

describe('timelineHtml', () => {
  it('is one self-contained HTML page with an SVG: a bar per row, the names, a time ruler, no scripts', async () => {
    const data = collectTimeline(await scene([{ type: '__box', name: 'bg' }, { type: '__box', name: 'title', at: 2, duration: 3 }]), 12);
    const html = timelineHtml(data, { title: 'My video' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<svg');
    expect(html).toContain('My video');
    expect(html).toContain('>bg<');
    expect(html).toContain('>title<');
    expect(html).toMatch(/>12 s</);
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes layer names, so a name can never inject markup', async () => {
    const data = collectTimeline(await scene([{ type: '__box', name: '<img src=x onerror=alert(1)>&' }]), 12);
    const html = timelineHtml(data);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&amp;');
  });
});

describe('timelineSvg — the chart a viewer can put a playhead on', () => {
  it('carries the geometry as data attributes, so a script can turn a click into a time and a time into an x', async () => {
    const data = collectTimeline(await scene([{ type: '__box', name: 'a' }, { type: '__box', name: 'b', at: 6, duration: 3 }]), 12);
    const svg = timelineSvg(data);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<!doctype');
    const attr = (name: string): number => Number(new RegExp(`data-${name}="([^"]+)"`).exec(svg)![1]);
    expect(attr('duration')).toBe(12);
    expect(attr('x1')).toBeGreaterThan(attr('x0'));
    expect(attr('top')).toBeGreaterThan(0);
    expect(attr('bottom')).toBeGreaterThan(attr('top'));
    expect(attr('row')).toBeGreaterThan(0);
    expect(/viewBox="0 0 (\d+) (\d+)"/.test(svg)).toBe(true);
  });

  it('a bar starting at 6 of 12 s is drawn at the middle of the x range', async () => {
    const data = collectTimeline(await scene([{ type: '__box', name: 'b', at: 6, duration: 3 }]), 12);
    const svg = timelineSvg(data);
    const attr = (name: string): number => Number(new RegExp(`data-${name}="([^"]+)"`).exec(svg)![1]);
    const bar = /<rect class="bar" x="([\d.]+)"/.exec(svg)![1]!;
    expect(Number(bar)).toBeCloseTo((attr('x0') + attr('x1')) / 2, 1);
  });

  it('every row has its start as a data attribute, so a click on a row can seek there', async () => {
    const data = collectTimeline(await scene([{ type: '__box', name: 'b', at: 6, duration: 3 }]), 12);
    expect(timelineSvg(data)).toMatch(/<g class="row" data-start="6"/);
  });
});
