import { describe, it, expect } from 'vitest';
import { kenBurns } from '../../src/presets/kenBurns';

describe('kenBurns()', () => {
  it('common shape: image type, asset / name / at / duration passthrough', () => {
    const s = kenBurns({ asset: 'photo', name: 'k', at: 2, duration: 5, motion: 'still' });
    expect(s.type).toBe('image');
    expect(s.asset).toBe('photo');
    expect(s.name).toBe('k');
    expect(s.at).toBe(2);
    expect(s.duration).toBe(5);
  });

  it('omits `name` / `at` when not given', () => {
    const s = kenBurns({ asset: 'photo', duration: 5, motion: 'still' });
    expect('name' in s).toBe(false);
    expect('at' in s).toBe(false);
  });

  describe('motion: still', () => {
    it('positions the image at the canvas centre at the fitted scale, no keyframes', () => {
      const s = kenBurns({ asset: 'photo', duration: 5, motion: 'still' });
      expect(s.initial?.x).toBe('W/2');
      expect(s.initial?.y).toBe('H/2');
      expect(s.initial?.anchorX).toBe(0.5);
      expect(s.initial?.anchorY).toBe(0.5);
      expect(s.initial?.scale).toBe('cover');
      expect(s.keyframes).toEqual([]);
    });

    it('honours `fit: contain`', () => {
      const s = kenBurns({ asset: 'photo', duration: 5, motion: 'still', fit: 'contain' });
      expect(s.initial?.scale).toBe('contain');
    });
  });

  describe('motion: scale', () => {
    it('default zoom-in around the centre, scale animates 1 × cover → 1.15 × cover', () => {
      const s = kenBurns({ asset: 'photo', duration: 5, motion: 'scale' });
      expect(s.initial?.scale).toBe('cover * 1');
      expect(s.initial?.pivotX).toBe('w * 0.5');
      expect(s.initial?.pivotY).toBe('h * 0.5');
      // Focal point pinned at canvas (ox*W, oy*H). For centred origin = W/2.
      expect(s.initial?.x).toBe('W * 0.5');
      expect(s.keyframes![0]!.to?.scale).toBe('cover * 1.15');
      expect(s.keyframes![0]!.duration).toBe(5);
      expect(s.keyframes![0]!.ease).toBe('sine.inOut');
    });

    it('off-centre origin: focal point pinned at canvas (ox·W, oy·H) so coverage holds at every scale', () => {
      const s = kenBurns({ asset: 'photo', duration: 4, motion: 'scale', origin: [0.25, 0.75], zoom: 1.2 });
      expect(s.initial?.pivotX).toBe('w * 0.25');
      expect(s.initial?.pivotY).toBe('h * 0.75');
      // At s = baseScale the coverage inequality W − w·(1−ox)·s ≤ x ≤ w·ox·s
      // collapses to a single point x = ox·W (and y = oy·H), so the focal
      // point must sit there exactly.
      expect(s.initial?.x).toBe('W * 0.25');
      expect(s.initial?.y).toBe('H * 0.75');
    });

    it('direction: out reverses the scale endpoints', () => {
      const s = kenBurns({ asset: 'photo', duration: 4, motion: 'scale', zoom: 1.2, direction: 'out' });
      expect(s.initial?.scale).toBe('cover * 1.2');
      expect(s.keyframes![0]!.to?.scale).toBe('cover * 1');
    });
  });

  describe('motion: rotation', () => {
    it('default: 0 → +8°, with one keyframe per degree of swing for gap-free scaling', () => {
      const s = kenBurns({ asset: 'photo', duration: 8, motion: 'rotation' });
      expect(s.initial?.x).toBe('W/2');
      expect(s.initial?.y).toBe('H/2');
      expect(s.initial?.pivotX).toBe('w * 0.5');
      expect(s.initial?.pivotY).toBe('h * 0.5');
      // Rotation is in DEGREES (PIXI shorthand → routed via gsap PixiPlugin).
      expect(s.initial?.rotation).toBe(0);
      // 8° span → 9 samples (0, 1, 2, ..., 8) → 8 keyframes.
      expect(s.keyframes!.length).toBe(8);
      const last = s.keyframes![s.keyframes!.length - 1]!;
      expect(last.to?.rotation).toBe(8);
      // Each keyframe carries the dynamically-computed scale for that angle.
      expect(last.to?.scale as string).toMatch(/^max\(cover, max\(\(W\*/);
    });

    it('direction: ccw goes 0 → -angle', () => {
      const s = kenBurns({ asset: 'photo', duration: 6, motion: 'rotation', angle: 6, direction: 'ccw' });
      const last = s.keyframes![s.keyframes!.length - 1]!;
      expect(last.to?.rotation).toBe(-6);
    });

    it('direction: through swings symmetrically around 0 (-angle/2 → +angle/2)', () => {
      const s = kenBurns({ asset: 'photo', duration: 10, motion: 'rotation', angle: 10, direction: 'through' });
      expect(s.initial?.rotation).toBe(-5);
      const last = s.keyframes![s.keyframes!.length - 1]!;
      expect(last.to?.rotation).toBe(5);
    });

    it('clamps angle into [0, 30]', () => {
      const s = kenBurns({ asset: 'photo', duration: 4, motion: 'rotation', angle: 99 });
      const last = s.keyframes![s.keyframes!.length - 1]!;
      expect(last.to?.rotation).toBe(30);
    });
  });

  describe('motion: position', () => {
    it('default: pan diagonally across the over-scaled image at zoom 1.15', () => {
      const s = kenBurns({ asset: 'photo', duration: 6, motion: 'position' });
      expect(s.initial?.scale).toBe('(cover) * 1.15');
      expect(s.initial?.pivotX).toBe('w * 0.5');
      expect(s.initial?.pivotY).toBe('h * 0.5');
      // panFrom = [0.25, 0.25] → x = W/2 + 0.25 * (w * cover * 1.15 - W)
      expect(s.initial?.x).toBe('W/2 + (0.25) * (w * (cover) * 1.15 - W)');
      expect(s.initial?.y).toBe('H/2 + (0.25) * (h * (cover) * 1.15 - H)');
      // panTo = [0.75, 0.75] → x = W/2 + (-0.25) * (...)
      expect(s.keyframes![0]!.to?.x).toBe('W/2 + (-0.25) * (w * (cover) * 1.15 - W)');
      expect(s.keyframes![0]!.to?.y).toBe('H/2 + (-0.25) * (h * (cover) * 1.15 - H)');
    });

    it('honours custom from / to / zoom', () => {
      const s = kenBurns({ asset: 'photo', duration: 4, motion: 'position', from: [0, 0], to: [1, 0.5], zoom: 1.3 });
      expect(s.initial?.scale).toBe('(cover) * 1.3');
      expect(s.initial?.x).toBe('W/2 + (0.5) * (w * (cover) * 1.3 - W)');     // panX=0
      expect(s.initial?.y).toBe('H/2 + (0.5) * (h * (cover) * 1.3 - H)');     // panY=0
      expect(s.keyframes![0]!.to?.x).toBe('W/2 + (-0.5) * (w * (cover) * 1.3 - W)');  // panX=1
      expect(s.keyframes![0]!.to?.y).toBe('H/2 + (0) * (h * (cover) * 1.3 - H)');     // panY=0.5
    });
  });
});
