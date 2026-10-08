# 0.21「奥行き」（被写界深度とピント送り）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カメラに `focus`（ピント面）と `aperture`（絞り）を足し、`threeD` 層を奥行きに応じて円盤状にぼかす。ピント送りは普通のキーフレームで書ける。

**Architecture:** 純粋関数 `blurRadius()` が「層の奥行き・ピント面の奥行き・絞り・焦点距離」からぼけ半径(px)を出す（`src/space/focus.ts`）。`CompositionSequence.updateSpace` が毎フレーム、投影のあとに各 `Layer3D` へ半径を渡し、`Layer3D.setBlur()` が射影メッシュ（`display`）に円盤ぼかしフィルタ（`src/filters/DiscBlur.ts`、WebGL / WebGPU の両方）を付け外しする。半径が 0.05 px 未満の層にはフィルタを付けない（使わない人のコスト 0）。`focus` の層名は、合成層がカメラの `displayProps()` に渡す解決関数で、ビルド時に「その層の最初の z」へ書き換える。

**Tech Stack:** TypeScript、PixiJS v8（`Filter` / `GlProgram` / `GpuProgram` / `UniformGroup`）、GSAP 3、vitest（単体は `tests/space/mockPixi.ts` のモック。実ブラウザは `ai/tools/check.mjs` の `serve` / `Cdp` と `tests/support/browser.ts` の `launchPage`）。

**Spec:** `docs/superpowers/specs/2026-10-09-depth-of-field-0.21-design.md`（承認済み。8 章の 7 つは推しのとおり）

**試作の置き場（写し元）:** `docs/superpowers/spikes-0.21-0.22/depth-of-field/`（`spike.patch`、`DiscBlur.ts`）。試作時の `main` に対するパッチ: **意味を写す**。違い: (1) 試作の `globalThis.__dof` 調整口は全部やめる。(2) ぼけ量は物理どおりの半径（`aperture × focal × |1/d − 1/s| / 2`）。試作の係数 0.25 はガウス用の経験値で、使わない。(3) 層名の解決・警告・`inspect` は試作になかった新規。(4) ぼけの上限 `MAX_BLUR` を足す（余白と texture が際限なく大きくならないように。メモ 7 章）。

## Global Constraints

- 返信は日本語。コミットはタスクごと。**push も公開もしない**。コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。数字は測ったものだけ。
- **`git add -A` を使わない**（ファイルを明示する）。
- 破壊的変更は許される（後方互換の殻は作らない）が、**カメラに `focus` も `aperture` も書かない既存の作品は、新しい警告を 1 つも出さず、ピクセルも変わらない**こと（ギャラリー、ガイドの例、レシピ、`examples/`、プレイグラウンドのプリセット）。
- 時間は決定的: ぼけ量は「カメラの状態と層の奥行き」だけの純粋関数。前向き・ジャンプ・後ろ向きのシークで全フレームが同一（実ブラウザで確かめる）。乱数・時計を使わない（円盤のタップは黄金角で決まった配置）。
- 追加の依存を入れない。
- 共通のパラメータルール（設計メモ 4.2）: `focus` / `aperture` はカメラの普通の項目（`initial` とキーフレーム）。`focus` は層の名前か z の数（数は式も書ける）。名前は**最初の z**に解決する。エンジンの名前を含む名前は作らない（`tests/docs/EngineNames.test.ts` が守る）。**公開文書・コード・コミットメッセージに、閉じたベータ版の名前や中身を書かない。**
- 警告の書式: `pixi-effects: <where>: <what>` ＋ 何を書けばよいか（did-you-mean は `suggestName`）。**例外にせず警告**。同じ誤りに警告を 2 回出さない。
- macOS は大文字小文字を区別しない。`sed -i ''`。zsh は `$VAR` を単語に分けない。ブラウザのテストが読む `dist/` は、ソースを変えたら `npm run build` で作り直す。コミットの前に必ず終了コードを読む（`echo "exit=$?"`）。
- 文書は生成物を含む: `npm run build:ai`、`npm run site:sync -- --check`、`npx vitest run tests/docs`。
- 版番号・CHANGELOG の見出しは `## Unreleased` のまま。リリースはオーナーの合図を待つ。
- テストは安さの順に: `npm run test:fast` → `npm run test:changed`。**Chrome を無用に起動しない**（オーナーが負荷を見ている。ブラウザのテストは Task 7 の 1 ファイルにまとめる）。`release:check` はこの計画では実行しない。

## Review Focus

最終レビュアーが意図して確かめる、テストの手薄な入力（上ほど噛みやすい）:

1. **層が 0 枚・1 枚・全部がピント面のとき**（`threeD` 層なしのカメラ、ぼける層が 0）: フィルタが付かず、警告も余計に出ない。→ Task 5 のテスト。
2. **カメラが切り替わる（カメラの寿命が連続する）とき、片方だけが `aperture` を持つ**: 切り替わった瞬間にフィルタが外れる／付く。→ Task 5 のテスト。
3. **層が隠れた（カメラの後ろ、`alpha 0`）あとにまた現れる**: 古い半径が残らない。→ Task 5 のテスト。
4. **ぼけ半径が上限に当たる極端な `aperture`（1000）**: texture が際限なく大きくならず、見た目が壊れない。→ Task 4 のテスト（`MAX_BLUR`）と Task 7（実機）。
5. **入れ子の合成層**: 親のカメラが入れ子の合成層を 1 枚としてぼかし、子のカメラは中身を別に決める。→ Task 5 のテスト。

---

### Task 1: ぼけ量と層名の解決（純粋関数）

**Files:**
- Create: `src/space/focus.ts`
- Test: `tests/space/focus.test.ts`

**Interfaces:**
- Consumes: `suggestName` (`src/core/options.ts`)、`evaluateExpr` (`src/expr/Parser.ts`)、型 `Keyframe` / `SequenceSpec` (`src/types.ts`)
- Produces（後続タスクが使う名前）:
  - `export const DEFAULT_APERTURE = 30`, `MIN_BLUR = 0.05`, `MAX_BLUR = 32`, `MANY_BLURRED = 20`
  - `blurRadius(aperture: number, focal: number, depth: number, focusDepth: number): number` — px、0〜`MAX_BLUR`
  - `looksLikeLayerName(s: string): boolean`
  - `withFocusResolved<T extends { initial?: Record<string, unknown>; keyframes?: Keyframe[] }>(props: T, zOf: (name: string) => number | undefined): T`
  - `layerInitialZ(spec: { initial?: Record<string, unknown> }, scope: Record<string, number>): number`
  - `type FocusProblem = { kind: 'missing'; name: string; hint: string | null } | { kind: 'not-threeD'; name: string } | { kind: 'moving'; name: string }`
  - `focusProblems(camera: { initial?: Record<string, unknown>; keyframes?: Keyframe[] }, siblings: readonly SequenceSpec[]): FocusProblem[]`

- [ ] **Step 1: 失敗するテストを書く** — `tests/space/focus.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  blurRadius, looksLikeLayerName, withFocusResolved, layerInitialZ, focusProblems,
  DEFAULT_APERTURE, MIN_BLUR, MAX_BLUR,
} from '../../src/space/focus';
import { homeDistance } from '../../src/space/math';
import type { SequenceSpec } from '../../src/types';

const focal = homeDistance(720, 40);          // the home camera: focal length = camera distance = 989.09 px at 720p
const sp = (o: unknown) => o as SequenceSpec;

describe('blurRadius', () => {
  it('is 0 on the focal plane, and grows with |1/d − 1/s| and with aperture (closed form: aperture × focal × |1/d − 1/s| / 2)', () => {
    const s = focal;                                                  // the z = 0 plane
    expect(blurRadius(30, focal, s, s)).toBe(0);
    const d = s + 400;                                                // a layer at z = −400
    const want = (60 * focal * Math.abs(1 / d - 1 / s)) / 2;
    expect(blurRadius(60, focal, d, s)).toBeCloseTo(want, 12);
    expect(blurRadius(60, focal, d, s)).toBeCloseTo(8.64, 1);        // worked out by hand: 60 × |989.09/1389.09 − 1| / 2
    expect(blurRadius(30, focal, d, s)).toBeCloseTo(blurRadius(60, focal, d, s) / 2, 12);
    expect(blurRadius(30, focal, s - 300, s)).toBeGreaterThan(0);     // nearer than the focus blurs too
  });
  it('is 0 when off or when the geometry is meaningless', () => {
    expect(blurRadius(0, focal, 1400, focal)).toBe(0);
    expect(blurRadius(30, focal, 0, focal)).toBe(0);                  // the layer is at the camera plane
    expect(blurRadius(30, focal, -5, focal)).toBe(0);                 // behind it
    expect(blurRadius(30, focal, 1400, 0)).toBe(0);                   // the focal plane is at or behind the camera
    expect(blurRadius(30, focal, 1400, -3)).toBe(0);
    expect(blurRadius(NaN, focal, 1400, focal)).toBe(0);
  });
  it('is capped at MAX_BLUR, and the constants are what the docs say', () => {
    expect(blurRadius(100000, focal, focal + 900, focal)).toBe(MAX_BLUR);
    expect(DEFAULT_APERTURE).toBe(30);
    expect(MIN_BLUR).toBe(0.05);
  });
});

describe('looksLikeLayerName', () => {
  it('tells a layer name from a number expression', () => {
    for (const n of ['title', 'front', 'bg-photo', 'card_2', 'Title']) expect(looksLikeLayerName(n)).toBe(true);
    for (const e of ['GW/2', '250', '-120', 'H * 0.5', '(GH)', 'GW', 'W', 'contain', 't', 'd', 'T']) expect(looksLikeLayerName(e)).toBe(false);
  });
});

describe('withFocusResolved', () => {
  const zOf = (n: string) => ({ front: 0, back: -400 } as Record<string, number>)[n];
  it('rewrites a layer name in initial, set, to and from, and leaves numbers and expressions alone', () => {
    const props = {
      initial: { focus: 'front', aperture: 40, x: 1 },
      keyframes: [{ at: 1, from: { focus: 'front' }, to: { focus: 'back' }, duration: 1 }, { at: 2, set: { focus: 250 } }, { at: 3, to: { focus: 'GW/2' } }],
    };
    const out = withFocusResolved(props, zOf);
    expect(out.initial).toEqual({ focus: 0, aperture: 40, x: 1 });
    expect(out.keyframes![0]).toMatchObject({ from: { focus: 0 }, to: { focus: -400 } });
    expect(out.keyframes![1]!.set).toEqual({ focus: 250 });
    expect(out.keyframes![2]!.to).toEqual({ focus: 'GW/2' });
    expect(props.initial.focus).toBe('front');                         // the spec itself is not touched
  });
  it('a name that does not resolve becomes 0 (the z = 0 plane; the lint says so)', () => {
    expect(withFocusResolved({ initial: { focus: 'nope' } }, zOf).initial).toEqual({ focus: 0 });
  });
  it('passes through a camera with no focus', () => {
    const props = { initial: { fov: 50 } };
    expect(withFocusResolved(props, zOf)).toEqual(props);
  });
});

describe('layerInitialZ', () => {
  it('reads a number, evaluates an expression, defaults to 0', () => {
    expect(layerInitialZ({ initial: { z: -250 } }, {})).toBe(-250);
    expect(layerInitialZ({ initial: { z: 'GW / 4' } }, { GW: 1280 } as never)).toBe(320);
    expect(layerInitialZ({ initial: { x: 5 } }, {})).toBe(0);
    expect(layerInitialZ({}, {})).toBe(0);
  });
});

describe('focusProblems', () => {
  const sibs = [
    sp({ type: 'text', name: 'title', threeD: true, text: 'a', initial: { z: 0 } }),
    sp({ type: 'image', name: 'label', asset: 'a' }),
    sp({ type: 'shape', shape: 'rect', name: 'mover', threeD: true, initial: { z: 0 }, keyframes: [{ at: 0, to: { z: 300 }, duration: 1 }] }),
  ];
  it('a threeD layer, a number and an expression are fine', () => {
    expect(focusProblems({ initial: { focus: 'title' } }, sibs)).toEqual([]);
    expect(focusProblems({ initial: { focus: 120 }, keyframes: [{ at: 0, to: { focus: 'GW/2' } }] }, sibs)).toEqual([]);
    expect(focusProblems({ initial: { fov: 50 } }, sibs)).toEqual([]);
  });
  it('a name no layer has, with did-you-mean', () => {
    expect(focusProblems({ initial: { focus: 'tilte' } }, sibs)).toEqual([{ kind: 'missing', name: 'tilte', hint: 'title' }]);
    expect(focusProblems({ initial: { focus: 'zzz' } }, sibs)).toEqual([{ kind: 'missing', name: 'zzz', hint: null }]);
  });
  it('a layer that is not threeD', () => {
    expect(focusProblems({ initial: { focus: 'label' } }, sibs)).toEqual([{ kind: 'not-threeD', name: 'label' }]);
  });
  it('a layer whose z moves later (only the first z is read)', () => {
    expect(focusProblems({ initial: { focus: 'mover' } }, sibs)).toEqual([{ kind: 'moving', name: 'mover' }]);
  });
  it('says each problem once, however many times the name is written', () => {
    const kfs = [{ at: 0, from: { focus: 'tilte' }, to: { focus: 'tilte' } }, { at: 1, to: { focus: 'tilte' } }];
    expect(focusProblems({ initial: { focus: 'tilte' }, keyframes: kfs }, sibs)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/space/focus.test.ts; echo "exit=$?"`
Expected: FAIL（`Cannot find module '../../src/space/focus'`）、exit=1

- [ ] **Step 3: 実装する** — `src/space/focus.ts`

```ts
import { suggestName } from '../core/options';
import { evaluateExpr } from '../expr/Parser';
import type { Keyframe, SequenceSpec } from '../types';

/** `aperture` when the camera writes `focus` or `aperture` but no value of its own. The lens diameter, in comp pixels. */
export const DEFAULT_APERTURE = 30;
/** Below this blur radius (px) a layer gets no filter at all: a sharp layer costs nothing. */
export const MIN_BLUR = 0.05;
/** The largest blur radius (px). A bigger one would grow every blurred layer's padding and sampling without bound. */
export const MAX_BLUR = 32;
/** More blurred layers than this at once cost a filter pass each (WebGPU more): said once. */
export const MANY_BLURRED = 20;

/**
 * Depth-of-field blur RADIUS in comp pixels for a layer at camera depth `depth` when the focal plane is at `focusDepth`:
 * the circle of confusion of a lens of diameter `aperture` (px) and focal length `focal` (px), halved. 0 on the focal plane,
 * and for anything at or behind the camera (those layers are hidden anyway).
 */
export function blurRadius(aperture: number, focal: number, depth: number, focusDepth: number): number {
  if (!(aperture > 0) || !(focal > 0) || !(depth > 0) || !(focusDepth > 0)) return 0;
  const r = (aperture * focal * Math.abs(1 / depth - 1 / focusDepth)) / 2;
  return Math.min(r, MAX_BLUR);
}

/** The variables an expression may use (`src/expr/Scope.ts`): a bare one of these is a number, not a layer name. */
const SCOPE_NAMES = new Set(['w', 'h', 'W', 'H', 'GW', 'GH', 'contain', 'cover', 't', 'd', 'T']);

/** A `focus` string that is a layer name (`title`, `bg-photo`) rather than an expression (`GW/2`, `-120`, `H`). */
export function looksLikeLayerName(s: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(s) && !SCOPE_NAMES.has(s);
}

type Bag = Record<string, unknown>;
type Props = { initial?: Bag; keyframes?: Keyframe[] };

/** Every `focus` string in `initial` and in the keyframes' `set` / `to` / `from`. */
function focusNames(props: Props): string[] {
  const out: string[] = [];
  const read = (bag: Bag | undefined) => { const v = bag?.focus; if (typeof v === 'string' && looksLikeLayerName(v)) out.push(v); };
  read(props.initial);
  for (const kf of props.keyframes ?? []) for (const bag of [kf.set, kf.to, kf.from]) read(bag as Bag | undefined);
  return out;
}

/** A copy of `props` with every layer-name `focus` replaced by the z `zOf` gives (0, the z = 0 plane, if it gives none). The input is not changed. */
export function withFocusResolved<T extends Props>(props: T, zOf: (name: string) => number | undefined): T {
  if (focusNames(props).length === 0) return props;
  const fix = (bag: Bag | undefined): Bag | undefined => {
    const v = bag?.focus;
    if (!bag || typeof v !== 'string' || !looksLikeLayerName(v)) return bag;
    return { ...bag, focus: zOf(v) ?? 0 };
  };
  return {
    ...props,
    initial: fix(props.initial),
    keyframes: props.keyframes?.map(kf => ({ ...kf, set: fix(kf.set as Bag | undefined), to: fix(kf.to as Bag | undefined), from: fix(kf.from as Bag | undefined) })),
  } as T;
}

/** A layer's first z: its `initial.z` (a number or an expression), else 0 (what `Layer3D` seeds). */
export function layerInitialZ(spec: { initial?: Bag }, scope: Record<string, number>): number {
  const z = spec.initial?.z;
  if (typeof z === 'number') return z;
  if (typeof z === 'string') return evaluateExpr(z, scope);
  return 0;
}

export type FocusProblem =
  | { kind: 'missing'; name: string; hint: string | null }
  | { kind: 'not-threeD'; name: string }
  | { kind: 'moving'; name: string };

const movesZ = (spec: SequenceSpec): boolean =>
  (spec.keyframes ?? []).some(kf => [kf.set, kf.to, kf.from].some(bag => bag && 'z' in (bag as Bag)));

/** What is wrong with the layer names a camera's `focus` points at, one entry per (name, problem). */
export function focusProblems(camera: Props, siblings: readonly SequenceSpec[]): FocusProblem[] {
  const out: FocusProblem[] = [];
  const said = new Set<string>();
  const threeD = siblings.filter(s => s.threeD && s.name).map(s => s.name!);
  for (const name of focusNames(camera)) {
    if (said.has(name)) continue;
    said.add(name);
    const hit = siblings.find(s => s.name === name);
    if (!hit) out.push({ kind: 'missing', name, hint: suggestName(name, threeD) });
    else if (!hit.threeD) out.push({ kind: 'not-threeD', name });
    else if (movesZ(hit)) out.push({ kind: 'moving', name });
  }
  return out;
}
```

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/space/focus.test.ts; echo "exit=$?"`
Expected: PASS（全件）、exit=0。`blurRadius ... 8.64` が落ちたら手計算を見直す（`60 × |989.09/1389.09 − 1| / 2 = 8.639`）。

- [ ] **Step 5: 型を確かめてコミット**

```bash
npx tsc --noEmit; echo "exit=$?"
git add src/space/focus.ts tests/space/focus.test.ts
git commit -m "feat: depth of field: blur radius and focus-name helpers (pure functions)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: tsc の exit=0

---

### Task 2: カメラの `focus` / `aperture`

**Files:**
- Modify: `src/space/math.ts`（`CameraState`）、`src/space/CameraSequence.ts`、`src/core/layerKeys.ts`（`PROP_KEYS`）、`src/space/lint.ts`（`CAMERA_PROPS`）
- Test: `tests/space/CameraSequence.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `DEFAULT_APERTURE`、`withFocusResolved`
- Produces:
  - `CameraState` に `focus?: number; aperture?: number`（`aperture` は**ぼかし有効のときだけ > 0**。有効でなければ 0）
  - `CameraSequence.resolveFocusNames(zOf: (name: string) => number | undefined): void`

- [ ] **Step 1: 失敗するテストを書く** — `tests/space/CameraSequence.test.ts` の `describe('CameraSequence', …)` の末尾に追記

```ts
  describe('depth of field', () => {
    it('is off (aperture 0) unless the camera writes focus or aperture', async () => {
      const cam = make({ initial: { fov: 50 } });
      await cam.build();
      expect(cam.state().aperture).toBe(0);
    });
    it('focus alone turns it on with the default aperture 30 and the focal plane at z = 0', async () => {
      const cam = make({ initial: { focus: 250 } });
      await cam.build();
      const s = cam.state();
      expect(s.focus).toBe(250);
      expect(s.aperture).toBe(30);
      const bare = make({ initial: { aperture: 60 } });
      await bare.build();
      expect(bare.state().focus).toBe(0);
      expect(bare.state().aperture).toBe(60);
    });
    it('aperture 0 is off even though it is written', async () => {
      const cam = make({ initial: { focus: 100, aperture: 0 } });
      await cam.build();
      expect(cam.state().aperture).toBe(0);
    });
    it('written only in a keyframe, it still turns on (the carrier starts at the defaults)', async () => {
      const cam = make({ keyframes: [{ at: 1, to: { focus: 400 }, duration: 1 }] });
      await cam.build();
      expect(cam.state().aperture).toBe(30);
    });
    it('a layer name in focus becomes that layer\'s first z once the composition has given the resolver', async () => {
      const cam = make({ initial: { focus: 'title' }, keyframes: [{ at: 0, from: { focus: 'title' }, to: { focus: 'back' }, duration: 1 }] });
      cam.resolveFocusNames(n => ({ title: 0, back: -400 } as Record<string, number>)[n]);
      await cam.build();
      const tl = gsap.timeline({ paused: true });
      cam.bindTimeline(tl);
      tl.progress(0);
      expect(cam.state().focus).toBe(0);
      tl.progress(1);
      expect(cam.state().focus).toBe(-400);
    });
  });
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/space/CameraSequence.test.ts; echo "exit=$?"`
Expected: 新しい 5 件が FAIL（`aperture` が undefined、`resolveFocusNames is not a function`）

- [ ] **Step 3: 実装する**

`src/space/math.ts` の `CameraState` に足す:
```ts
  /** Depth of field: world z of the focal plane (default 0), and the lens diameter in comp px; 0 = off. */
  focus?: number; aperture?: number;
```

`src/space/CameraSequence.ts`:
```ts
import { DEFAULT_APERTURE, withFocusResolved } from './focus';
// Carrier に追加
//   z: number; … fov: number; focus: number; aperture: number;
```
`build()` の carrier 初期化に（`carrier.fov = home.fov;` の次）:
```ts
    carrier.focus = 0;                              // the z = 0 plane, the one the home camera shows 1:1
    carrier.aperture = DEFAULT_APERTURE;
```
`build()` の `this.autoZ = …` の次に:
```ts
    const keys = collectPropKeys(this.spec);
    this.dof = keys.has('focus') || keys.has('aperture');
```
フィールドとメソッド:
```ts
  /** True when the camera writes `focus` or `aperture` anywhere: depth of field is on. */
  private dof = false;
  private zOfName: ((name: string) => number | undefined) | null = null;

  /** Called by the composition once its children exist: how a layer name in `focus` becomes the z of that layer. */
  resolveFocusNames(zOf: (name: string) => number | undefined): void {
    this.zOfName = zOf;
  }

  protected override displayProps(): ReturnType<Sequence['displayProps']> {
    const base = super.displayProps();
    return this.zOfName ? withFocusResolved(base as { initial?: Record<string, unknown>; keyframes?: Keyframe[] }, this.zOfName) as typeof base : base;
  }
```
（`Keyframe` は `../types` から import。`displayProps` は `Sequence` で `protected`。型エラーが出たら戻り値型を `{ initial: SequenceSpec['initial']; keyframes: SequenceSpec['keyframes'] }` に合わせる。）

`state()` の戻り値に:
```ts
      fov, focus: c.focus, aperture: this.dof && c.aperture > 0 ? c.aperture : 0,
```
（`c.focus` が NaN のときは `Number.isFinite(c.focus) ? c.focus : 0`。）

`src/core/layerKeys.ts` の `PROP_KEYS` の camera 行に `'focus', 'aperture'` を足す（`'fov',` の後）。
`src/space/lint.ts` の `CAMERA_PROPS` に `'focus', 'aperture'` を足す（`'fov',` の後）。

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/space tests/core/lint.test.ts; echo "exit=$?"`
Expected: PASS、exit=0。`layerKeys` の `Covers` 型エラーが出たら `npx tsc --noEmit` の出力に従う。

- [ ] **Step 5: コミット**

```bash
npx tsc --noEmit; echo "exit=$?"
git add src/space/math.ts src/space/CameraSequence.ts src/core/layerKeys.ts src/space/lint.ts tests/space/CameraSequence.test.ts
git commit -m "feat: camera focus and aperture (depth of field on when either is written)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 警告と、合成層からの層名の解決

**Files:**
- Modify: `src/space/lint.ts`（`lintFocus`、`CAMERA_ALIASES`）、`src/sequences/Composition.ts`（ビルドで警告と解決を配線）
- Test: `tests/space/lint.test.ts`（追記）、`tests/space/CompositionSpace.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `focusProblems`、`layerInitialZ`、Task 2 の `CameraSequence.resolveFocusNames`
- Produces: `lintFocus(camera: SequenceSpec, siblings: readonly SequenceSpec[], warn?: Warn): void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/space/lint.test.ts` に追記（`run` ヘルパの下に `runFocus` を足す）:
```ts
import { lintFocus } from '../../src/space/lint';

function runFocus(camera: unknown, siblings: unknown[]): string[] {
  const out: string[] = [];
  lintFocus(camera as SequenceSpec, siblings as SequenceSpec[], m => out.push(m));
  return out;
}

describe('lintFocus', () => {
  const sibs = [
    { type: 'text', name: 'title', threeD: true, text: 'a' },
    { type: 'image', name: 'label', asset: 'a' },
    { type: 'shape', shape: 'rect', name: 'mover', threeD: true, keyframes: [{ at: 0, to: { z: 9 }, duration: 1 }] },
  ];
  it('a missing name says what was meant', () => {
    const w = runFocus({ type: 'camera', initial: { focus: 'tilte' } }, sibs);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('focus');
    expect(w[0]).toContain('"tilte"');
    expect(w[0]).toContain('did you mean "title"?');
  });
  it('a layer that is not threeD, and a layer whose z moves, are said', () => {
    expect(runFocus({ type: 'camera', initial: { focus: 'label' } }, sibs)[0]).toMatch(/"label".*not threeD/);
    expect(runFocus({ type: 'camera', initial: { focus: 'mover' } }, sibs)[0]).toMatch(/"mover".*first z/);
  });
  it('is silent for a good name, a number and a camera without focus', () => {
    expect(runFocus({ type: 'camera', initial: { focus: 'title' } }, sibs)).toEqual([]);
    expect(runFocus({ type: 'camera', initial: { focus: 300 } }, sibs)).toEqual([]);
    expect(runFocus({ type: 'camera' }, sibs)).toEqual([]);
  });
  it('other kinds of layer are not looked at', () => {
    expect(runFocus({ type: 'text', text: 'a', initial: { focus: 'nope' } }, sibs)).toEqual([]);
  });
});

describe('lintSequence — depth of field names', () => {
  it('the likely wrong names point at focus and aperture', () => {
    const w = run({ type: 'camera', initial: { depthOfField: 1, dof: 1, focalDistance: 1, focusDistance: 1, fStop: 2, blurAmount: 3 } });
    for (const k of ['depthOfField', 'dof', 'focalDistance', 'focusDistance', 'fStop', 'blurAmount']) {
      expect(w.some(m => m.includes(`"${k}"`) && m.includes('"focus"') && m.includes('"aperture"'))).toBe(true);
    }
  });
  it('focus and aperture inside initial are fine, and on the camera itself they must go inside initial', () => {
    expect(run({ type: 'camera', initial: { focus: 100, aperture: 40 } })).toEqual([]);
    const w = run({ type: 'camera', focus: 100 });
    expect(w.some(m => m.includes('"focus"') && m.includes('initial'))).toBe(true);
  });
});
```

`tests/space/CompositionSpace.test.ts` に追記（`build` ヘルパを使う。層名を解決するので、Box 層に `name` を付ける）:
```ts
describe('CompositionSequence — focus by layer name', () => {
  it('resolves a layer name to that layer\'s first z (a number or an expression) when the movie is built', async () => {
    const comp = await build([
      { type: 'camera', initial: { focus: 'back' } },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    const cam = comp._children[0] as unknown as { state(): { focus: number } };
    expect(cam.state().focus).toBe(-400);
    const comp2 = await build([
      { type: 'camera', initial: { focus: 'back' } },
      { type: '__box', name: 'back', threeD: true, initial: { z: '0 - GW / 4' } },
    ]);
    expect((comp2._children[0] as unknown as { state(): { focus: number } }).state().focus).toBe(-320);
  });
  it('warns once for a name nobody has, and uses the z = 0 plane', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([
      { type: 'camera', initial: { focus: 'bak' } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('focus'))).toHaveLength(1);
    expect(String(warn.mock.calls.find(c => String(c[0]).includes('focus'))![0])).toContain('did you mean "back"?');
    expect((comp._children[0] as unknown as { state(): { focus: number } }).state().focus).toBe(0);
  });
});
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/space/lint.test.ts tests/space/CompositionSpace.test.ts; echo "exit=$?"`
Expected: FAIL（`lintFocus is not exported`、`focus` が 0 のまま）

- [ ] **Step 3: 実装する**

`src/space/lint.ts`:
```ts
import { focusProblems } from './focus';

const DOF_HINT = 'depth of field is the camera\'s "focus" (the plane that is sharp: a layer name or a z) and "aperture" (how shallow: 0 = off, 30 = default) — put them in the camera\'s initial / keyframes';
```
`CAMERA_ALIASES` に:
```ts
  depthOfField: DOF_HINT, dof: DOF_HINT, focalDistance: DOF_HINT, focusDistance: DOF_HINT, fStop: DOF_HINT, blurAmount: DOF_HINT,
```
（テストは `"focus"` と `"aperture"` の両方を含むことを見るので、`DOF_HINT` にその 2 つが引用符つきで入っていること。）

`lintFocus`:
```ts
/** The layer names a camera's `focus` points at: missing, not threeD, or with a z that moves later. One call per camera, at build time. */
export function lintFocus(camera: SequenceSpec, siblings: readonly SequenceSpec[], warn: Warn = defaultWarn): void {
  if (camera.type !== 'camera') return;
  const who = describeLayer(camera);
  for (const p of focusProblems(camera, siblings)) {
    if (p.kind === 'missing') {
      warn(`pixi-effects: ${who}: focus: no layer named "${p.name}"${p.hint ? `; did you mean "${p.hint}"?` : ''} (the z = 0 plane is used). Write a threeD layer's name or a z number`);
    } else if (p.kind === 'not-threeD') {
      warn(`pixi-effects: ${who}: focus "${p.name}" is not a threeD layer, so it has no depth (the z = 0 plane is used). Write a threeD layer's name or a z number`);
    } else {
      warn(`pixi-effects: ${who}: focus "${p.name}" reads only the first z of that layer; its z moves later and the focus does not follow. Animate focus itself with numbers to follow it`);
    }
  }
}
```
（`CAMERA_PROPS` 経由の「`focus` はカメラそのものに書かず `initial` へ」の警告は既存の仕組みで出る。）

`src/sequences/Composition.ts`:
- import: `import { lintSequence, lintFocus } from '../space/lint';` と `import { layerInitialZ } from '../space/focus';`
- `build()` の lint ループ内（`lintSequence(s);` の次）に: `lintFocus(s, this.spec.sequences ?? []);`
- `buildSequenceTree` と `_resolveParents()` の直後、`for (const child of this._children)` ループの前に:
```ts
    // A camera's `focus: "title"` becomes that layer's first z, here, where the siblings exist (a camera sees only its parent's shape)
    for (const cam of this._children) {
      if (!(cam instanceof CameraSequence)) continue;
      cam.resolveFocusNames(name => {
        const hit = this._children.find(c => c.spec.name === name && c.spec.threeD);
        return hit ? layerInitialZ(hit.spec, hit.scope() as unknown as Record<string, number>) : undefined;
      });
    }
```

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/space tests/core/lint.test.ts; echo "exit=$?"`
Expected: PASS、exit=0

- [ ] **Step 5: コミット**

```bash
npx tsc --noEmit; echo "exit=$?"
git add src/space/lint.ts src/sequences/Composition.ts tests/space/lint.test.ts tests/space/CompositionSpace.test.ts
git commit -m "feat: focus layer names resolved at build, with did-you-mean warnings and alias hints

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 円盤ぼかしフィルタと `Layer3D.setBlur`

**Files:**
- Create: `src/filters/DiscBlur.ts`
- Modify: `src/space/Layer3D.ts`、`tests/space/mockPixi.ts`（フィルタのモックに足りない項目を足す）
- Test: `tests/space/Layer3D.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `MIN_BLUR`、`MAX_BLUR`
- Produces:
  - `class DiscBlurFilter extends Filter { constructor(radius?: number); radius: number }`（`radius` を代入すると `padding = ceil(radius) + 2`）
  - `Layer3D.blur: number`（現在のぼけ半径 px、0 = フィルタなし）、`Layer3D.setBlur(radius: number): void`

- [ ] **Step 1: 失敗するテストを書く** — `tests/space/Layer3D.test.ts` に追記

```ts
describe('Layer3D.setBlur (depth of field)', () => {
  const filtersOf = (layer: Layer3D) => (layer.display as unknown as { filters: Array<{ radius: number; padding: number; blendMode?: string }> | null }).filters;

  it('adds one disc blur on the projected mesh, with padding for its reach, and updates it in place', () => {
    const { layer } = setup();
    layer.setBlur(6);
    const f = filtersOf(layer)!;
    expect(f).toHaveLength(1);
    expect(f[0]!.radius).toBe(6);
    expect(f[0]!.padding).toBe(8);                    // ceil(6) + 2
    expect(layer.blur).toBe(6);
    layer.setBlur(9);
    expect(filtersOf(layer)![0]).toBe(f[0]);           // the same filter, not a new one each frame
    expect(f[0]!.radius).toBe(9);
  });
  it('a radius under MIN_BLUR removes the filter and costs nothing', () => {
    const { layer } = setup();
    layer.setBlur(6);
    layer.setBlur(0.04);
    expect(filtersOf(layer)).toBeNull();
    expect(layer.blur).toBe(0);
    layer.setBlur(0);
    expect(filtersOf(layer)).toBeNull();
  });
  it('a layer that was never blurred never gets a filter (no cost for those who do not use it)', () => {
    const { layer } = setup();
    layer.setBlur(0);
    expect(filtersOf(layer)).toBeNull();
  });
  it('the radius is capped at MAX_BLUR', () => {
    const { layer } = setup();
    layer.setBlur(100000);
    expect(layer.blur).toBe(MAX_BLUR);
    expect(filtersOf(layer)![0]!.radius).toBe(MAX_BLUR);
  });
  it('a blend mode moves to the filter while it is on and comes back when it goes', () => {
    const { layer } = setup();
    const d = layer.display as unknown as { blendMode: string };
    d.blendMode = 'add';
    layer.setBlur(5);
    expect(d.blendMode).toBe('normal');
    expect(filtersOf(layer)![0]!.blendMode).toBe('add');
    layer.setBlur(0);
    expect(d.blendMode).toBe('add');
  });
  it('the default blend mode ("inherit" in Pixi) is left alone', () => {
    const { layer } = setup();
    const d = layer.display as unknown as { blendMode: string };
    d.blendMode = 'inherit';
    layer.setBlur(5);
    expect(d.blendMode).toBe('inherit');
    expect(filtersOf(layer)![0]!.blendMode).toBe('normal');
    layer.setBlur(0);
    expect(d.blendMode).toBe('inherit');
  });
  it('destroy() drops the filter', () => {
    const { layer } = setup();
    layer.setBlur(5);
    layer.destroy();
    expect(layer.blur).toBe(0);
  });
});
```
（先頭の import に `MAX_BLUR` を足す: `import { MAX_BLUR } from '../../src/space/focus';`）

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/space/Layer3D.test.ts; echo "exit=$?"`
Expected: FAIL（`layer.setBlur is not a function`）

- [ ] **Step 3: 実装する**

`src/filters/DiscBlur.ts` — 試作の `DiscBlur.ts` を元に、次の変更だけを加えて作る（意味を写す。シェーダーの本体は試作と同じ: 黄金角 2.39996323 のタップ、`sqrt((i+0.5)/N) * radius` の半径、`N = 48`）:
  - 冒頭のコメントを本番用に: 「one-pass disc blur; taps on a golden-angle spiral, so the result is a pure function of the pixels (no noise, no time)」
  - `export const DISC_TAPS = 48;` を作り、GLSL / WGSL の `${TAPS}` をそれに置き換える。
  - `radius` の setter は `Math.max(0, v)` に丸める。`padding = Math.ceil(v) + 2` は試作のまま。
  - `export class DiscBlurFilter extends Filter`。コンストラクタ `(radius = 8)`。

`tests/space/mockPixi.ts` のモックの `Filter`（124 行付近）に、`padding = 0; blendMode = 'normal'; destroy() {}` を足す。`GpuProgram.from` が無ければ `GlProgram` と同じ形で足す。`UniformGroup`（127 行付近）が `uniforms` を持つことを確かめる（`DiscBlurFilter` の `radius` が `resources.disc.uniforms.uRadius` を読み書きする）。足りないものは Step 4 のエラーに従って足す。

`src/space/Layer3D.ts`:
```ts
import { DiscBlurFilter } from '../filters/DiscBlur';
import { MAX_BLUR, MIN_BLUR } from './focus';

// クラス内
  /** Depth-of-field blur radius (px) from the last `setBlur`; 0 = no filter. */
  blur = 0;
  private blurFilter: DiscBlurFilter | null = null;
  private blendWas = 'normal';

  /**
   * Depth-of-field blur on the projected mesh (screen space), so a tilted or scaled layer blurs by the size it is drawn at.
   * A radius under MIN_BLUR removes the filter: a sharp layer costs nothing. A blend mode moves to the filter while it is on
   * (a filtered object blends as a whole), and comes back when it goes.
   */
  setBlur(radius: number): void {
    const d = this.display as unknown as { filters: unknown; blendMode: string };
    const r = radius > MIN_BLUR ? Math.min(radius, MAX_BLUR) : 0;
    this.blur = r;
    if (r === 0) {
      if (this.blurFilter) {
        d.filters = null;
        d.blendMode = this.blendWas;
        this.blurFilter.destroy();
        this.blurFilter = null;
      }
      return;
    }
    if (!this.blurFilter) {
      this.blurFilter = new DiscBlurFilter(r);
      this.blendWas = d.blendMode ?? 'normal';
      // only an explicit mode moves ('inherit' is Pixi's default for a container and 'normal' is the filter's own: nothing to move)
      if (this.blendWas !== 'normal' && this.blendWas !== 'inherit') { this.blurFilter.blendMode = this.blendWas as never; d.blendMode = 'normal'; }
      d.filters = [this.blurFilter];
    }
    this.blurFilter.radius = r;
  }
```
`destroy()` の先頭に `this.setBlur(0);` を足す。

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/space; echo "exit=$?"`
Expected: PASS、exit=0。モックに足りないもの（`GpuProgram.from`、`destroy`）のエラーが出たら足して再実行。

- [ ] **Step 5: 型とビルドを確かめてコミット**

```bash
npx tsc --noEmit; echo "exit=$?"
git add src/filters/DiscBlur.ts src/space/Layer3D.ts tests/space/mockPixi.ts tests/space/Layer3D.test.ts
git commit -m "feat: disc blur filter and Layer3D.setBlur (zero cost under 0.05 px)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
注: シェーダーが実際に動くかは Task 7（実ブラウザ）で確かめる。ここでは単体テストだけ。

---

### Task 5: `updateSpace` に配線（ぼけ量の計算・警告）

**Files:**
- Modify: `src/sequences/Composition.ts`
- Test: `tests/space/CompositionSpace.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 `blurRadius`、`MANY_BLURRED`、Task 2 `CameraState.focus/aperture`、Task 4 `Layer3D.setBlur/blur`
- Produces: `CompositionSequence.layers()` の各要素に `depthBlur: number`（Task 6 が使う）

- [ ] **Step 1: 失敗するテストを書く** — `tests/space/CompositionSpace.test.ts` に追記

```ts
import { blurRadius } from '../../src/space/focus';
import { homeDistance } from '../../src/space/math';

describe('CompositionSequence — depth of field', () => {
  const filters = (comp: CompositionSequence, i: number) => (meshes(comp)[i] as unknown as { filters: Array<{ radius: number }> | null }).filters;
  const scene = (cameraInitial: Record<string, unknown> | null, extra: unknown[] = []) => [
    ...(cameraInitial ? [{ type: 'camera', initial: cameraInitial }] : []),
    { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
    { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ...extra,
  ];

  it('blurs by depth: nothing on the focal layer, the closed-form radius behind it', async () => {
    const comp = await build(scene({ focus: 'front', aperture: 60 }));
    comp.updateSpace(0, mkHost().host);
    expect(filters(comp, 0)).toBeNull();
    expect(filters(comp, 1)).toHaveLength(1);
    const s = homeDistance(720, 40);
    expect(filters(comp, 1)![0]!.radius).toBeCloseTo(blurRadius(60, s, s + 400, s), 9);
    expect(filters(comp, 1)![0]!.radius).toBeCloseTo(8.64, 1);
  });
  it('focusing on the back layer swaps which one is sharp', async () => {
    const comp = await build(scene({ focus: 'back', aperture: 60 }));
    comp.updateSpace(0, mkHost().host);
    expect(filters(comp, 1)).toBeNull();
    expect(filters(comp, 0)).toHaveLength(1);
  });
  it('with no focus and no aperture on the camera, or no camera, or aperture 0: no filter anywhere', async () => {
    for (const cam of [{ fov: 40 }, null, { focus: 'back', aperture: 0 }]) {
      const comp = await build(scene(cam));
      comp.updateSpace(0, mkHost().host);
      expect(filters(comp, 0)).toBeNull();
      expect(filters(comp, 1)).toBeNull();
    }
  });
  it('a focus pull is a function of the time: the radius follows the camera\'s focus as it moves, and a seek back gives the same radii', async () => {
    const comp = await build([
      { type: 'camera', initial: { focus: 'front', aperture: 60 }, keyframes: [{ at: 0, to: { focus: 'back' }, duration: 2, ease: 'none' }] },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    // drive the focus through the camera's carrier (the tween itself is GSAP's; what is tested here is the radius as a function of the focus)
    const cam = comp._children[0] as unknown as { target: { focus: number } };
    const radii = (f: number) => { cam.target.focus = f; comp.updateSpace(0, mkHost().host); return [filters(comp, 0)?.[0]?.radius ?? 0, filters(comp, 1)?.[0]?.radius ?? 0]; };
    const mid = radii(-200), back = radii(-400), again = radii(-200);
    expect(back[1]).toBe(0);
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[1]).toBeGreaterThan(0);
    expect(again).toEqual(mid);                     // going back gives the very same numbers
  });
  it('a focal plane at or behind the camera warns once and blurs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build(scene({ focus: 5000, aperture: 60 }));
    const { host } = mkHost();
    comp.updateSpace(0, host); comp.updateSpace(0.1, host);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('behind the camera') && String(c[0]).includes('focus'))).toHaveLength(1);
    expect(filters(comp, 0)).toBeNull();
    expect(filters(comp, 1)).toBeNull();
  });
  it('warns once when 20 or more layers are blurred at once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: 22 }, (_, i) => ({ type: '__box', threeD: true, initial: { z: -100 - i * 10 } }));
    const comp = await build([{ type: 'camera', initial: { focus: 0, aperture: 60 } }, ...many]);
    const { host } = mkHost();
    comp.updateSpace(0, host); comp.updateSpace(0.1, host);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('blurred'))).toHaveLength(1);
  });
  it('a layer hidden behind the camera drops its filter, and gets the right radius when it comes back', async () => {
    const comp = await build(scene({ focus: 'front', aperture: 60 }, [{ type: '__box', name: 'pass', threeD: true, hideBehindCamera: true, initial: { z: -400 } }]));
    const { host } = mkHost();
    comp.updateSpace(0, host);
    const pass = comp._children[3]!.target as unknown as { z: number };
    const r0 = filters(comp, 2)![0]!.radius;
    pass.z = 5000;                                   // behind the camera
    comp.updateSpace(0.1, host);
    expect(filters(comp, 2)).toBeNull();
    pass.z = -400;
    comp.updateSpace(0.2, host);
    expect(filters(comp, 2)![0]!.radius).toBeCloseTo(r0, 9);
  });
  it('when the camera changes at a cut, the filters follow the camera that is active (one has aperture, the next does not)', async () => {
    const comp = await build([
      { type: 'camera', at: 0, duration: 1, initial: { focus: 'front', aperture: 60 } },
      { type: 'camera', at: 1, initial: { fov: 40 } },
      { type: '__box', name: 'front', threeD: true, initial: { z: 0 } },
      { type: '__box', name: 'back', threeD: true, initial: { z: -400 } },
    ]);
    const { host } = mkHost();
    comp.updateSpace(0.5, host);
    expect(filters(comp, 1)).toHaveLength(1);
    comp.updateSpace(1.5, host);
    expect(filters(comp, 1)).toBeNull();
    comp.updateSpace(0.5, host);                      // and back again
    expect(filters(comp, 1)).toHaveLength(1);
  });
  it('layers() reports the blur each threeD layer has now (for inspect)', async () => {
    const comp = await build(scene({ focus: 'front', aperture: 60 }));
    comp.updateSpace(0, mkHost().host);
    const rows = comp.layers();
    expect(rows.find(r => r.seq.spec.name === 'front')!.depthBlur).toBe(0);
    expect(rows.find(r => r.seq.spec.name === 'back')!.depthBlur).toBeGreaterThan(8);
  });
  it('a nested threeD composition is blurred as one layer by its parent\'s camera', async () => {
    const comp = await build([
      { type: 'camera', initial: { focus: 0, aperture: 60 } },
      { type: 'composition', name: 'card', width: 200, height: 100, duration: 10, threeD: true, initial: { z: -400 }, sequences: [{ type: '__box', threeD: true }] },
    ]);
    comp.updateSpace(0, mkHost().host);
    expect(filters(comp, 0)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/space/CompositionSpace.test.ts; echo "exit=$?"`
Expected: 新しい 10 件が FAIL（フィルタが付かない、`depthBlur` が undefined）

- [ ] **Step 3: 実装する** — `src/sequences/Composition.ts`

import: `import { blurRadius, MANY_BLURRED } from '../space/focus';`、`import { cameraBasis, homeCamera, projectPoint, NEAR, type CameraBasis, type CameraState } from '../space/math';`（`NEAR` が export されていなければ `src/space/math.ts` から使う: 既に `export const NEAR = 1`）。

フィールド: `private _dofSaid = { behind: false, many: false };`

`updateSpace` を、`cameraBasis(...)` の行から次のようにする:
```ts
    const cam = active ? active.cam.state() : homeCamera(width, height);
    const basis = cameraBasis(cam, width, height);

    for (const layer of this._layers3d) layer.update(host, basis);
    this._applyDepthOfField(cam, basis);
```
メソッド:
```ts
  /** Depth of field: each threeD layer is blurred by how far its depth is from the focal plane (a pure function of the camera and the layers). */
  private _applyDepthOfField(cam: CameraState, basis: CameraBasis): void {
    const aperture = cam.aperture ?? 0;
    if (!(aperture > 0)) { for (const l of this._layers3d) l.setBlur(0); return; }
    const focusDepth = projectPoint(basis, { x: cam.lookAtX, y: cam.lookAtY, z: cam.focus ?? 0 }).depth;
    if (!(focusDepth > NEAR)) {
      if (!this._dofSaid.behind) {
        this._dofSaid.behind = true;
        console.warn(`pixi-effects: ${describeLayer(this.spec)}: the camera's focus (z = ${(cam.focus ?? 0).toFixed(0)}) is at or behind the camera, so nothing is blurred. Put focus in front of the camera (a z below the camera's z)`);
      }
      for (const l of this._layers3d) l.setBlur(0);
      return;
    }
    let blurred = 0;
    for (const l of this._layers3d) {
      l.setBlur(blurRadius(aperture, basis.focal, l.depth, focusDepth));
      if (l.blur > 0) blurred++;
    }
    if (blurred >= MANY_BLURRED && !this._dofSaid.many) {
      this._dofSaid.many = true;
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${blurred} layers are blurred by depth of field at once; each costs a filter pass per frame (WebGPU more). Merge the far layers or lower aperture`);
    }
  }
```
テストの警告文の検査語: `behind the camera` と `focus`、`blurred`。上のメッセージはその語を含む。

`layers()` の戻り値の型と本体に `depthBlur: number` を足す: 型 `Array<{ seq; display; threeD; carriers; depthBlur: number }>`、`depthBlur: layer?.blur ?? 0`。

`hideBehindCamera` の層が隠れる場合、`Layer3D.update()` は `hide()` するが `depth` は更新される（`this.depth = projected.depth` が先）。カメラの後ろ（depth ≤ 0）の層は `blurRadius` が 0 を返し、フィルタが外れる。

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/space; echo "exit=$?"`
Expected: PASS、exit=0

- [ ] **Step 5: 速い層を全部通してコミット**

```bash
npm run test:fast; echo "exit=$?"
npx tsc --noEmit; echo "exit=$?"
git add src/sequences/Composition.ts tests/space/CompositionSpace.test.ts
git commit -m "feat: depth of field in updateSpace: per-layer blur radius, behind-camera and many-layers warnings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: test:fast と tsc の exit=0（`test:fast` が落ちたら、落ちたテスト名を読んで直す。無関係でも名前を記録する）

---

### Task 6: `inspect` にぼけ量を出す

**Files:**
- Modify: `src/core/inspect.ts`
- Test: Task 7 の実ブラウザテストが `inspect` の値を読む。単体は `tests/core/inspect.test.ts`（ファイルがあれば追記、なければ作らず Task 7 に任せる。`ls tests/core/inspect*` で確認）

**Interfaces:**
- Consumes: Task 5 の `layers()[].depthBlur`
- Produces: `LayerInfo.depthBlur?: number` — threeD 層のみ。「そのフレームで深度から決まるぼけ半径 px。0 = 鮮明」

- [ ] **Step 1: テストを書く（既存の inspect の単体テストがあるとき）**

`tests/core/inspect.test.ts`（存在するなら）に、threeD の層を持つ合成層を作って `updateSpace` を回したあと `inspect` の `layers` の `depthBlur` が出ることを確かめるケースを足す。既存のテストの組み立て方（モックの作り方）に合わせる。存在しないなら、この手順は飛ばして Task 7 の「inspect が出すぼけ量」の検査で RED→GREEN を取る（台帳に書く）。

- [ ] **Step 2: 実装する** — `src/core/inspect.ts`

`LayerInfo` に:
```ts
  /** Depth of field (threeD layers only): the blur radius in canvas pixels this frame, from the layer's depth and the camera's focus; 0 = sharp. */
  depthBlur?: number;
```
`comp.layers().forEach(({ seq, display, threeD, carriers, depthBlur }, i) => {` と受け、`const info: LayerInfo = {…}` の直後に `if (threeD) info.depthBlur = Number(depthBlur.toFixed(2));`。

- [ ] **Step 3: 型とテストを確かめてコミット**

```bash
npx tsc --noEmit; echo "exit=$?"
npm run test:fast; echo "exit=$?"
git add src/core/inspect.ts
git commit -m "feat: inspect reports each threeD layer's depth-of-field blur

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
（`review()` は問題を報告するもので `layers: 'none'` で `inspect` を呼ぶ。ピント送りは問題ではないので、`review` には足さない。設計メモ 3.4 は「形は計画で既存の行に合わせる」としていた: **台帳に Ruling として書く**。）

---

### Task 7: 実ブラウザでの受け入れテスト（ここだけ Chrome を使う）

**Files:**
- Create: `examples/_checks/depth-of-field.html`、`tests/tools/depthOfField.test.ts`
- Modify: `scripts/test-changed.mjs`（領域に新しいテストを足す）

**Interfaces:**
- Consumes: 全部。`dist/index.js`（`npm run build` で作る）
- Produces: ページの関数 `mk(opts)`, `snap(f)`, `diff(a, b)`, `edge(url, y, x0, x1)`（10%〜90% の立ち上がり幅 px）, `orders(frames)`。テストは `backend`（`movie.app.renderer.name`）を記録する。

- [ ] **Step 1: チェックページを書く** — `examples/_checks/depth-of-field.html`

`examples/_checks/time-remap.html` と同じ骨格（`__logs`、importmap、`import { Movie } from '../../dist/index.js'`）で、次の関数を持つ:
```js
    const FPS = 30;
    window.mk = async (opts) => {
      if (window.movie) { await window.movie.destroy(); window.movie = null; }
      window.__logs.length = 0;
      const movie = new Movie(); window.movie = movie;
      await movie.init({ canvas: document.getElementById('stage'), width: 320, height: 180, duration: opts.duration ?? 2, frameRate: FPS, background: '#000000', ...opts });
      window.backend = movie.app.renderer.name || String(movie.app.renderer.type);
      return window.backend;
    };
    // three white bars on black, at three depths, side by side: the bar's vertical edges show how blurred it is
    window.bars = (camera, extra = []) => ({ sequences: [
      ...(camera ? [{ type: 'camera', ...camera }] : []),
      { type: 'shape', shape: 'rect', name: 'near',  width: 40, height: 80, threeD: true, initial: { x: 80,  y: 90, z: 60,   fillColor: '#ffffff' } },
      { type: 'shape', shape: 'rect', name: 'front', width: 40, height: 80, threeD: true, initial: { x: 160, y: 90, z: 0,    fillColor: '#ffffff' } },
      { type: 'shape', shape: 'rect', name: 'back',  width: 40, height: 80, threeD: true, initial: { x: 240, y: 90, z: -100, fillColor: '#ffffff' } },
      ...extra,
    ] });
    const toImg = (url) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
    const pixels = async (url) => { const i = await toImg(url); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    window.snap = (f) => window.movie.snapshot(f, { as: 'dataURL' });
    window.diff = async (a, b) => { if (a === b) return 0; const A = await pixels(a), B = await pixels(b); let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.abs(A[i] - B[i])); return m; };
    // how many pixels of the row y, between x0 and x1, are between 10 % and 90 % of white: 0..2 for a sharp edge, ~ the blur width for a blurred one
    window.edge = async (url, y, x0, x1) => { const P = await pixels(url); let n = 0; for (let x = x0; x < x1; x++) { const v = P[(y * 320 + x) * 4] / 255; if (v > 0.1 && v < 0.9) n++; } return n; };
    window.shuffle = (arr, seed = 1) => { const a = arr.slice(); let s = seed; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    window.orders = async (frames) => {
      const take = async (order) => { const m = {}; for (const f of order) m[f] = await window.snap(f); return m; };
      const fwd = await take(frames), bwd = await take(frames.slice().reverse()), jmp = await take(window.shuffle(frames, 7));
      const out = { bwdMax: 0, jmpMax: 0 };
      for (const f of frames) { out.bwdMax = Math.max(out.bwdMax, await window.diff(fwd[f], bwd[f])); out.jmpMax = Math.max(out.jmpMax, await window.diff(fwd[f], jmp[f])); }
      return out;
    };
    window.__ready = true;
```
`<canvas id="stage" width="320" height="180">` と、冒頭のコメント（受け入れチェックで例ではないこと、`tests/tools/depthOfField.test.ts` が使うこと、各関数が何をするか）を `time-remap.html` と同じ形で書く。

- [ ] **Step 2: 失敗するテストを書く** — `tests/tools/depthOfField.test.ts`

`tests/tools/timeRemap.test.ts` の先頭（`withPage`、`launchPage`、`check.serve`、`skipIf(!chrome || !built || …)`）と同じ作りで、ページは `/examples/_checks/depth-of-field.html`、待ち条件は `window.__ready === true`。`import { blurRadius } from '../../src/space/focus'` と `homeDistance` で期待値を計算する（320×180 のホームカメラ: `focal = homeDistance(180, 40)`）。ケース:

```ts
const focal = homeDistance(180, 40);                       // 247.3 px
const depthOf = (z: number) => focal - z;                  // the home camera sits at z = focal looking at z = 0
const R = (aperture: number, z: number, focusZ = 0) => blurRadius(aperture, focal, depthOf(z), depthOf(focusZ));

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('depth of field, on a real browser', () => {
  it('the focal layer stays sharp and the others blur by the size the model gives', async () => {
    await withPage(async (cdp) => {
      const backend = await cdp.eval(`mk(${JSON.stringify({ composition: bars({ initial: { focus: 'front', aperture: 40 } }) })})`);
      const url = await cdp.eval('snap(0)');
      const e = async (x0: number, x1: number) => cdp.eval(`edge(${JSON.stringify(url)}, 90, ${x0}, ${x1})`);
      const near = await e(40, 70), front = await e(130, 150), back = await e(220, 245);
      // a hard edge is ~2 px of antialiasing; a disc blur of radius r spreads it over about 1.6 r (the 10-90 % band of a ramp 2 r wide)
      expect(front, `backend ${backend}`).toBeLessThanOrEqual(3);
      expect(back).toBeGreaterThan(front + 1);
      expect(near).toBeGreaterThan(front + 1);
      expect(back).toBeGreaterThanOrEqual(Math.floor(1.0 * R(40, -100)));
      expect(back).toBeLessThanOrEqual(Math.ceil(2.4 * R(40, -100)) + 2);
      expect(near).toBeGreaterThanOrEqual(Math.floor(1.0 * R(40, 60)));
      expect(near).toBeLessThanOrEqual(Math.ceil(2.4 * R(40, 60)) + 2);
    });
  });
  it('no focus / no aperture / aperture 0 give the very same picture as a movie without the camera feature', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ composition: bars({ initial: { fov: 40 } }) })})`);
      const plain = await cdp.eval('snap(0)');
      await cdp.eval(`mk(${JSON.stringify({ composition: bars({ initial: { focus: 'front', aperture: 0 } }) })})`);
      const off = await cdp.eval('snap(0)');
      expect(await cdp.eval(`diff(${JSON.stringify(plain)}, ${JSON.stringify(off)})`)).toBe(0);
    });
  });
  it('a focus pull: the sharp layer changes, midway both are soft, and every seek order gives the same pictures', async () => {
    await withPage(async (cdp) => {
      const cam = { initial: { focus: 'near', aperture: 40 }, keyframes: [{ at: 0.5, to: { focus: 'back' }, duration: 1, ease: 'power2.inOut' }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: bars(cam) })})`);
      const edgeAt = async (f: number, x0: number, x1: number) => cdp.eval(`snap(${f}).then(u => edge(u, 90, ${x0}, ${x1}))`);
      expect(await edgeAt(0, 40, 70)).toBeLessThanOrEqual(3);                   // near is sharp at the start
      expect(await edgeAt(59, 220, 245)).toBeLessThanOrEqual(3);                // back is sharp at the end (frame 59 = 1.97 s)
      expect(await edgeAt(0, 220, 245)).toBeGreaterThan(3);
      expect(await edgeAt(30, 40, 70)).toBeGreaterThan(3);                      // at 1 s the focus is between: near is soft now ...
      expect(await edgeAt(30, 220, 245)).toBeGreaterThan(3);                    // ... and so is back
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
    });
  });
  it('inspect reports the blur of each threeD layer', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ composition: bars({ initial: { focus: 'front', aperture: 40 } }) })})`);
      const rows = await cdp.eval('movie.inspect(0).then(r => r.layers.map(l => [l.name, l.depthBlur]))');
      const by = Object.fromEntries(rows);
      expect(by.front).toBe(0);
      expect(by.back).toBeCloseTo(R(40, -100), 1);
      expect(by.near).toBeCloseTo(R(40, 60), 1);
    });
  });
  it('a spring and an expression move the focus like any other camera number, and a layer name works in the pull', async () => {
    await withPage(async (cdp) => {
      const cam = { initial: { focus: 'GW/1000', aperture: 40 }, keyframes: [{ at: 0, to: { focus: -100 }, duration: 1, ease: 'spring(1, 170, 12)' }] };
      await cdp.eval(`mk(${JSON.stringify({ composition: bars(cam) })})`);
      const o = await cdp.eval('orders([0, 10, 20, 29])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect((await cdp.eval('__logs')).filter((l: string) => l.includes('pixi-effects:') && !l.includes('WebGPU'))).toEqual([]);
    });
  });
  it('a layer the camera passes (hideBehindCamera) and an extreme aperture do not break the picture', async () => {
    await withPage(async (cdp) => {
      const pass = { type: 'shape', shape: 'rect', name: 'pass', width: 40, height: 40, threeD: true, hideBehindCamera: true, initial: { x: 20, y: 20, z: 400, fillColor: '#ff0000' } };
      await cdp.eval(`mk(${JSON.stringify({ composition: bars({ initial: { focus: 'front', aperture: 1000 } }, [pass]) })})`);
      const url = await cdp.eval('snap(0)');
      const row = await cdp.eval(`edge(${JSON.stringify(url)}, 90, 0, 320)`);
      expect(row).toBeLessThanOrEqual(3 * (2 * 32 + 2));                        // three bars, none wider than the cap allows
      expect((await cdp.eval('__logs')).filter((l: string) => l.includes('pixi-effects:') && !l.includes('WebGPU'))).toEqual([]);
    });
  });
  it('the movie exports (mp4) with the blur in it', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ duration: 1, composition: bars({ initial: { focus: 'front', aperture: 40 } }) })})`);
      const size = await cdp.eval('movie.render({ format: "mp4" }).then(b => b.size)');
      expect(size).toBeGreaterThan(1000);
    });
  });
});
```
（`withPage` と import は `timeRemap.test.ts` のものをそのまま写す。名前 `depth-of-field` の一時ディレクトリ接頭辞は `dof-`。）

- [ ] **Step 3: 失敗を確かめる**（まず実装が無いこと = Task 1〜6 はもう入っている。ここで落ちるのは**シェーダーが本当に動くか**の検証）

Run: `npm run build; echo "exit=$?"` → exit=0。
Run: `npx vitest run tests/tools/depthOfField.test.ts; echo "exit=$?"`
Expected: 最初の実行で、(a) 全部通る（シェーダーも幾何も合っていた）、または (b) どれかが落ちる。**落ちたら `superpowers:systematic-debugging`**。よくある原因: フィルタ用のシェーダーのコンパイルエラー（コンソールの `__logs` を見る）、`edge` の許容幅（実測値を記録し、モデル `R()` との比を確かめてから許容を決める。許容を緩めるときは理由を台帳に書く）、`orders` の差が 0 でない（時間依存が入っている）。テストが 1 回目から全部通ったときは、テストが何も見ていない可能性があるので、`MIN_BLUR` を 100 に変えて落ちることを確かめてから戻す（変異確認、台帳に書く）。

- [ ] **Step 4: 目で確かめる**（`aperture` の表と既定の値の根拠）

`node ai/tools/check.mjs` ではなく、Task 7 のページで 3 枚の絵を書き出して**自分で開いて見る**: `aperture` 10 / 30 / 60 / 100 で、`bars` ではなく、文字と図形を並べた実際の絵（`examples/_checks/depth-of-field.html` に `window.demo(aperture)` を足してもよい。足すなら 1 関数）。`MAX_BLUR` 付近（半径 32）でタップの縞（ドット状の二重像）が目立つなら、`DISC_TAPS` を 64 にするか `MAX_BLUR` を下げる。決めた値と、見た絵のファイル名を台帳に書く。**既定の `aperture: 30` が「はっきりした浅い被写界深度」に見えなければ、オーナーに知らせて数を決め直す**（設計メモ 3.1 の表を直す）。

- [ ] **Step 5: WebGPU でも走らせる**（使えるときだけ）

テストの Chrome に `--enable-unsafe-webgpu` を付けた変種（`launchPage` の第 3 引数があれば。なければ `check.launchChrome(…, extraArgs)`）で `backend` が `webgpu` になるか確かめる。**なる**なら同じテストを WebGPU でも走らせ（環境変数 `PE_DOF_WEBGPU=1` で切り替える）、結果を台帳に書く。**ならない**なら、「WebGPU は実機で未確認」と台帳と最終報告に書く（黙って省かない）。

- [ ] **Step 6: 領域を足してコミット**

`scripts/test-changed.mjs` の `'2.5D and cards'` の `tests:` に `'tests/tools/depthOfField.test.ts'` を足し、`'grain and filters'` の `paths` に `src/filters/` が既にあるので、そちらの `tests:` にも同じファイルを足す（`DiscBlur.ts` を変えたとき走るように）。`tests/tools/testChanged.test.ts` が領域の整合を見るなら、それも通す。

```bash
npx vitest run tests/tools/testChanged.test.ts tests/tools/depthOfField.test.ts; echo "exit=$?"
git add examples/_checks/depth-of-field.html tests/tools/depthOfField.test.ts scripts/test-changed.mjs
git commit -m "test: depth of field on a real browser (sharp focal layer, closed-form blur, focus pull, seek orders, export)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 文書（AI が読むもの、人が読むもの、生成物）

**Files:**
- Modify: `docs/dsl.md`、`ai/reference/cheatsheet.md`、`ai/reference/recipes.md`、`ai/reference/pitfalls.md`、`ai/SKILL.md`、`site/guide/`（3D・カメラを説明している章。`grep -ln "cameraPath\|hideBehindCamera" site/guide/*.md` で見つける）、`CHANGELOG.md`（`## Unreleased`）、`llms-full.txt`（生成）
- Test: 既存の `tests/docs/*`（`Space3DDocs`、`Recipes`、`Llms`、`Guide`）

**Interfaces:** なし（文書）。

- [ ] **Step 1: `docs/dsl.md`** — 「3D layers & camera」章のカメラの表に 2 行、表のあとに「### Depth of field」の節

表の行（`fov` の行の次）:
```
| `focus` | the plane that is **sharp**: a `threeD` layer's name (its first `z`) or a z number. Turns depth of field on | the `z = 0` plane |
| `aperture` | how shallow: the lens diameter in px. `0` = off. Written alone, or with `focus`, it turns depth of field on | `30` |
```
節（実際に `Space3DDocs.test.ts` がこの章の ```json ブロックを `lintSequence` にかけるので、ブロックは有効な JSON）:

````
### Depth of field

Write `focus` (and, if you want, `aperture`) on the camera and the `threeD` layers blur by how far they are from the plane in focus; the layer in focus stays sharp. Nothing else changes: without `focus` and `aperture` there is no blur and no cost.

```json
{
  "sequences": [
    { "type": "camera", "initial": { "focus": "title" } },
    { "type": "text", "name": "title", "text": "Focus", "threeD": true, "style": { "fontSize": 96, "fill": "#ffffff" }, "initial": { "x": "GW/2", "y": "GH/2", "z": 0, "anchorX": 0.5, "anchorY": 0.5 } },
    { "type": "shape", "shape": "circle", "radius": 140, "threeD": true, "initial": { "x": "GW/2 + 260", "y": "GH/2", "z": -500, "fillColor": "#3a6ea5" } }
  ]
}
```

A focus pull is a normal keyframe on `focus`; a layer name works there too:

```json
{
  "sequences": [
    { "type": "camera", "initial": { "focus": "front", "aperture": 60 },
      "keyframes": [{ "at": 1, "to": { "focus": "back" }, "duration": 1, "ease": "power2.inOut" }] },
    { "type": "shape", "shape": "rect", "name": "front", "width": 300, "height": 200, "threeD": true, "initial": { "x": "GW/2 - 200", "y": "GH/2", "z": 100, "fillColor": "#d96a3a" } },
    { "type": "shape", "shape": "rect", "name": "back", "width": 300, "height": 200, "threeD": true, "initial": { "x": "GW/2 + 200", "y": "GH/2", "z": -400, "fillColor": "#3a6ea5" } }
  ]
}
```

- `aperture` is the lens diameter in pixels; the blur radius of a layer is `aperture × focal × |1/depth − 1/focusDepth| / 2` (focal = `(H/2)/tan(fov/2)`), capped at 32 px. With the default camera at 720p and the focus on `z = 0`, a layer at `z = −400` blurs by: `aperture 10` → 1.4 px (a soft hint), `30` → 4.3 px (clearly shallow), `60` → 8.6 px (strong), `100` → 14.4 px (extreme). A layer further away blurs more, up to the cap.
- A layer name in `focus` means **the first `z`** of that layer; if its `z` moves later, animate `focus` itself with numbers (a warning says so).
- The blur is the same over the whole layer (decided by the layer's origin depth). A tilted floor is one blur: split it into layers.
- It blurs `threeD` layers only. A nested `threeD` composition is blurred as one layer by its parent's camera.
- The layer's own `blur` and its `filters` are separate and add to it.
- More than 20 blurred layers at once warns (one filter pass each).
````
上の `aperture` ごとの px は閉じた式から出した値（720p、`z = −400`、`0.288 × aperture / 2`）。Task 7 Step 4 で絵を見て「軽い／はっきり／強い／極端」の言葉が合わないと思ったら、言葉か既定値を直し、台帳に書く。

- [ ] **Step 2: AI 向けの文書**
  - `ai/reference/cheatsheet.md` の camera の行（82 行付近）: 「props」に `focus aperture` を足し、1 文「`focus` = the sharp plane (a threeD layer's name or a z), `aperture` = how shallow (30 default, 0 off): depth-of-field blur on threeD layers」。
  - `ai/reference/recipes.md`: 「## A rack focus (depth of field)」を `## Camera flight and a camera shake` の後に足す。本体は `// @recipe rack-focus` の js ブロック（`Recipes.test.ts` がビルドして lint する。既存の `camera-fly-through` と同じ書式）。内容は 3 層（手前・中・奥）に文字を置き、カメラの `focus` を `'near'` → `'far'` に 1 秒で送る。
  - `ai/reference/pitfalls.md`: 74〜76 を足す（番号は最後の 73 の次）。74「`focus` を層の名前で書くと、その層の最初の z。動く層に追従したいなら `focus` を数でキーフレームする」。75「ぼけは threeD 層だけ。2D 層はぼけない。ぼかしたい物は `threeD: true` にして `z` を離す（`z: 0` の層と同じ深さだと鮮明）」。76「`aperture` は強さではなく**レンズの直径(px)**: 大きいほど浅い。30 が既定、0 で切る。層が 20 枚以上ぼけると重い（警告）」。
  - `ai/SKILL.md` の 35 行付近の「2.5D needs `threeD: true`」の項に、`focus` / `aperture` を 1 文足す。「Built in:」の列にも `depth of field (camera focus + aperture)` を足す。
  - `site/guide/` の該当章に、同じ内容の短い節（人向けの言葉で、`docs/dsl.md` の例を 1 つ）。

- [ ] **Step 3: CHANGELOG** — `## Unreleased` の先頭に 1 項目

```
- **Depth of field.** The camera takes `focus` (the plane that is sharp: a `threeD` layer's name or a z) and `aperture` (how shallow; 30 by default, 0 = off): `threeD` layers blur with their distance from the focus, with a disc ("bokeh") blur, and a rack focus is an ordinary keyframe on `focus`. Free when unused. Warnings for a layer name that is not there (with did-you-mean), a layer that is not `threeD`, a focus behind the camera and a crowd of blurred layers; `inspect` reports each layer's blur (`depthBlur`).
```

- [ ] **Step 4: 生成物とテスト**

```bash
npm run build:ai; echo "exit=$?"
npm run site:sync -- --check; echo "exit=$?"
npx vitest run tests/docs tests/tools/noFalseWarnings.test.ts; echo "exit=$?"
```
Expected: すべて exit=0。`noFalseWarnings` は Chrome を使う（ギャラリー全作品が新しい警告を出さないことの確認。ここで 1 回だけ走らせる）。落ちたら、落ちたテスト名と原因を読んで直す。

- [ ] **Step 5: コミット**（変えたファイルを 1 つずつ明示する。`git status --short` で確かめてから）

```bash
git status --short
git add docs/dsl.md ai/reference/cheatsheet.md ai/reference/recipes.md ai/reference/pitfalls.md ai/SKILL.md <Step 2 で変えた site/guide/ の章のファイル> CHANGELOG.md llms-full.txt
git commit -m "docs: depth of field (camera focus and aperture): dsl, cheatsheet, recipe, pitfalls, guide, changelog

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: プレイグラウンドの例とギャラリーの見せ場

**Files:**
- Create: `examples/playground/presets/16-depth-of-field.js`、`examples/gallery/rack-focus.html`（ファイル名は作品の名前に合わせて確定）、`examples/gallery/_notes/<name>.md`、`examples/gallery/posters/<name>.jpg`
- Modify: `examples/playground/presets/index.js`、`tests/playground/presets.test.ts`（ID の一覧）、`examples/gallery/pieces.json`、`examples/gallery/posters/manifest.json`、`examples/gallery/MODELS.md`、作品数が書かれた箇所（`rewind-title` を足したコミットが触ったファイルが目安: `README.md`、`index.html`、`site/landing/FACTS.md`、`site/landing/NOTES.md`）

**Interfaces:** なし。

- [ ] **Step 1: プレイグラウンドの例（16）**

`examples/playground/presets/15-time-remap.js` の書式に合わせて、`16-depth-of-field.js` を作る。内容: 3 面の文字（手前・中・奥）で、ピントを手前→奥へ 1 秒で送り、戻す。`index.js` に `import depthOfField from './16-depth-of-field.js';` と `{ id: '16-depth-of-field', label: '16 · depth of field: rack focus', code: depthOfField }` を足し、`tests/playground/presets.test.ts` の一覧（15 行）に `'16-depth-of-field'` を足す。

Run: `npx vitest run tests/playground; echo "exit=$?"` → exit=0

- [ ] **Step 2: ギャラリー作品の設計（作る前に書く）**

`examples/gallery/BRIEF.md` と `examples/gallery/MODELS.md` を読み、既存の作品（`rewind-title.html` とその `_notes/rewind-title.md`）の作り方に従う。**まず設計を 10 行以内で `_notes/<name>.md` の冒頭に書く**: 何を見せるか、レイアウト、色、時間配分、音。骨子（実際の細部は作りながら絵を見て直す）:

- 題材: 「ピント送り」（奥行きのある机の上）。手前に大きな円形のバッジ（`near`、z = +150）、中央にタイトル文字（`title`、z = 0）、奥に街の光のような大小の円（`bokeh-far` 群、z = −500〜−900）を散らす。
- カメラ: `focus: 'near'` から始まり、1.2 秒で `focus: 'title'`、2.4 秒で `focus: 'bokeh-far'` ではなく奥の看板の文字（`sign`、z = −600）へ送り、最後に `title` に戻す。ゆっくりした dolly（`z` を 60 だけ寄せる）を同時に付ける。
- 音: `sfx` の軽いクリック（ピントが決まる瞬間）と、`music` の短い pad。
- 長さ 6 秒、1280×720、30 fps。

- [ ] **Step 3: 作る → 見る → 直す**

`rewind-title` と同じ手順で作る: HTML を書く → `node ai/tools/check.mjs examples/gallery/<name>.html --out <リポジトリの外のフォルダ>` を回し、**コンタクトシートの PNG を開いて自分で見る**（ピントが送られているか、ぼけの縞やはみ出しがないか、文字が読めるか）。警告が 1 つでも出たら直す。見た絵（ピントが手前 / 中 / 奥の各時点）の評価を `_notes/<name>.md` に書く。作品の作者の記録（`piece-meta` の `model`、`MODELS.md` の行）は、既存の sonnet の作品がどう書かれているかに合わせる。

- [ ] **Step 4: 登録と数の更新**

`rewind-title` を足したコミットの触ったファイルの一覧（`git show --stat $(git log --format=%h --grep='rewind' -1 -- examples/gallery/rewind-title.html)`）を見て、同じ種類のファイルを更新する: `pieces.json`、`posters/manifest.json`（`npm run build:gallery` が作るものは生成する）、`MODELS.md`（行と作品数）、`README.md` / `index.html` / `site/landing/FACTS.md` / `site/landing/NOTES.md` の作品数（45 → 46）。`npm run build:gallery; echo "exit=$?"` と `npx vitest run tests/docs tests/tools/gallery.test.ts; echo "exit=$?"` が、足りない所を教える。

- [ ] **Step 5: コミット**

```bash
git status --short
git add examples/playground/presets/16-depth-of-field.js examples/playground/presets/index.js tests/playground/presets.test.ts <ギャラリーで変えたファイルを 1 つずつ>
git commit -m "feat: playground preset 16 and a gallery piece for the rack focus

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
注: 手順 3 で出たコンタクトシートは、**最終報告でオーナーに見せる**（ファイルの場所を知らせる）。

---

### Task 10: 全体の確認と最終レビュー

**Files:** なし（確認と台帳）

- [ ] **Step 1: 変えたものに応じたテスト、そして速い層**

```bash
npm run build; echo "exit=$?"
npm run test:changed; echo "exit=$?"
npm run test:fast; echo "exit=$?"
npx tsc --noEmit; echo "exit=$?"
```
Expected: すべて exit=0。落ちたものは名前と原因を記録して直す。**`release:check` は走らせない**（リリースの合図を待つ）。

- [ ] **Step 2: 最終レビュー**（skills `executing-plans` の「Final Review」に従う）

`review-package` を作り、「fable」の新しい文脈のレビュアー（サブエージェント）に渡す。計画の Review Focus（上の 5 つ）をそのまま渡し、台帳の `Ruling:` の行を指す。Critical / Important は 1 回の修正でテスト付きで直す。Minor は台帳と最終報告の「Deferred minors」に書く。

- [ ] **Step 3: 最終報告**

オーナーへ（日本語）: 何が入ったか、測った数字（ブラウザテストの実測、WebGPU を確かめられたか／できなかったか）、ギャラリーのコンタクトシートの場所、`Ruling:` の一覧（少なくとも次の 3 つ）、Deferred minors、**push していないこと**。
  - Ruling 1: 設計メモ 2 章の「未検証の片付け」を 1 つの手順にせず、担当するタスクのテストに畳んだ（`to:` の層名 = Task 3 / spring・式 = Task 7 / `hideBehindCamera`・極端な `aperture`・書き出し = Task 7）。
  - Ruling 2: `aperture` は物理どおりの半径（係数なし）、`MAX_BLUR = 32`（Task 7 Step 4 で見て決めた値に直したならその値）。
  - Ruling 3: `review()` にはピント送りの行を足さない（`review` は問題を報告するもの。`inspect` の `depthBlur` で足りる）。
  - Ruling 4: メモの警告表の「`aperture` を書いたが threeD 層が 1 枚もない」は、既存の「camera has no effect: this composition has no threeD layers」で既に出る。

Finish: `superpowers:finishing-a-development-branch`（この計画は `main` 上でローカルにコミットするだけ。マージ・push の選択肢は、オーナーの合図まで出さない）。
