# 0.22 ブレンドモード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `blendMode` に `overlay` `soft-light` `hard-light` `color-dodge` `color-burn` `darken` `lighten` `difference` `exclusion` `hue` `saturation` `color` `luminosity` `linear-burn` の 14 種を足す（既存の 4 種と合わせて 18 種）。自前の `BlendModeFilter` を、使う作品でだけ遅延読み込みする。

**Architecture:** `src/core/blend.ts` が名前の表・警告・「高度なモードを使うか」の判定・フィルタ工場の登録口を持つ（Pixi に依存しない）。`src/filters/blendModes.ts`（新規、動的 import）が 14 本の `BlendModeFilter` を、`Movie.init` が使っている pixi のインスタンスの `extensions` に登録し、工場を blend.ts に渡す。`applyBlendMode` は、フィルタのない層には `display.blendMode = '名前'`（Pixi の BlendModePipe が登録済みのフィルタで描く）、フィルタ付きの層にはフィルタ列の最後にブレンドフィルタを足す。被写界深度のぼかしが付く `threeD` 層は、ぼかしフィルタ → ブレンドフィルタの順に並べる。

**Tech Stack:** TypeScript、PixiJS v8.22（`BlendModeFilter` / `extensions` / `ExtensionType`、公開 API として `pixi.js` から import できることは試作で確認済み）、vitest（単体は `tests/space/mockPixi.ts`、実ブラウザは `ai/tools/check.mjs` の `serve` と `tests/support/browser.ts` の `launchPage`）、tsup（`splitting: true`、`pixi.js` は external）。

**Spec:** `docs/superpowers/specs/2026-10-09-blend-modes-0.22-design.md`（承認済み。8 章の 7 つは推しのとおり）

**試作の置き場（写し元）:** `docs/superpowers/spikes-0.21-0.22/blend-modes/`（`blendModes.ts`、`spike.patch`、`pages/`）。シェーダーの式（`SEPARABLE` / `NONSEP` / `GL_MAIN` / `GPU_MAIN`）は 4 構成で W3C と 1/255 以内で一致した実績があるので、**Task 2 のコードブロックにそのまま写す**。違い: (1) 試作の `Movie` の `useBackBuffer: false` を常に設定する変更は**しない**（使わない作品の挙動を変えない）。(2) 登録・工場・遅延読み込みの形（試作は静的 import）。(3) blend.ts の検査表と警告、同時に出る数の警告、被写界深度との併用、`maskInverted` の扱いは新規。

## Global Constraints

- 返信は日本語。コミットはタスクごと。**push も公開もしない**。コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。数字は測ったものだけ。
- **`git add -A` を使わない**（ファイルを明示する）。
- 破壊的変更は許される（後方互換の殻は作らない）が、**`blendMode` を使わない作品、または基本 4 種（normal / add / screen / multiply）だけの作品は、新しい警告を 1 つも出さず、ピクセルも変わらず、動的 import もバックバッファの変更も起きない**こと（ギャラリー、ガイドの例、レシピ、`examples/`、プレイグラウンドのプリセット）。
- 時間は決定的: 前向き・ジャンプ・後ろ向きのシークで全フレームが同一（実ブラウザで確かめる）。**描画の経路に、直前のフレームに依存する状態（ヒステリシスなど）を入れない**（0.21 で踏んだ: 絵は「そのフレームのカメラと層」だけの関数）。
- `src/core/blend.ts` は **pixi.js を import しない**（Pixi のモックの単体テストで読めること、`filters/blendModes.ts` を遅延読み込みにできること）。`filters/blendModes.ts` を静的に import するのは、動的 import（`Movie` から）と、そのファイルのテストだけ。
- 追加の依存を入れない。名前は CSS の `mix-blend-mode` に揃える（例外: `add` は既存、`linear-burn` は CSS にない名前で、After Effects と Photoshop の名前。文書に書く）。**公開文書・コード・コミットメッセージに、閉じたベータ版の名前や中身を書かない。**
- 共通のパラメータルール（設計メモ 4.2）: `blendMode` は最上位の固定設定（動かせない）。値の名前の検査表は blend.ts の 1 か所。打ち間違い・別名は `suggestName` で直し方つきの警告。エンジンの名前を含む名前を作らない（`tests/docs/EngineNames.test.ts` が守る）。
- 警告の書式: `pixi-effects: <where>: <what>` ＋ 何を書けばよいか。**例外にせず警告**。同じ誤りに警告を 2 回出さない。
- macOS は大文字小文字を区別しない。`sed -i ''`。zsh は `$VAR` を単語に分けない。ブラウザのテストが読む `dist/` は、ソースを変えたら `npm run build` で作り直す。コミットの前に必ず終了コードを読む（`echo "exit=$?"`）。
- 文書は生成物を含む: `npm run build:ai`、`npm run site:sync -- --check`、`npx vitest run tests/docs`。
- 版番号・CHANGELOG の見出しは `## Unreleased` のまま。リリースはオーナーの合図を待つ。
- テストは安さの順に: `npm run test:fast` → `npm run test:changed`。**Chrome を起動するのは Task 5・6 の 1 ファイルと、Task 8 の `noFalseWarnings`、Task 9 の check / playground のみ**（テスト用 Chrome は `--disable-audio-output` つきで、コアオーディオ負荷は出ない）。`release:check` はこの計画では実行しない。

## Review Focus

最終レビュアーが意図して確かめる、テストの手薄な入力（上ほど噛みやすい）:

1. **高度なモードを使わない作品**: 動的 import が起きず、`useBackBuffer` が変わらず、ピクセルが同じ。→ Task 5 のテスト。
2. **フィルタ付きの層、被写界深度のぼかしが付く `threeD` 層に高度なモード**: ブレンドフィルタが最後に付き、ぼかしが消えると元に戻り、フィルタが漏れない。→ Task 4 のテスト。
3. **背景が透明なところに混ぜる**（`threeD` の入れ子の合成層の中。背景のアルファ 0）: 結果は通常描画と同じになる（W3C の式で αb = 0）。→ Task 5 のテスト。
4. **名前の綴りの揺れ**（`softlight` / `soft_light` / `SoftLight` / `dodge` / `colour`）: 直し方つきで警告。→ Task 1 のテスト。
5. **シーク順序**: ブレンドとフィルタの組み合わせで、前向き・ジャンプ・後ろ向きのシークが同じ絵。→ Task 5 のテスト。

---

### Task 1: 検査表・型・警告・「高度なモードを使うか」

**Files:**
- Modify: `src/core/blend.ts`、`src/types.ts`、`tests/sequences/BlendMode.test.ts`
- Test: `tests/core/blend.test.ts`（新規）

**Interfaces:**
- Consumes: `suggestName` (`src/core/options.ts`)、`describeLayer` (`src/core/lint.ts`)
- Produces（後続タスクが使う名前）:
  - `export const BASIC_BLEND_MODES = ['normal', 'add', 'screen', 'multiply'] as const`
  - `export const ADVANCED_BLEND_MODES = ['overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'linear-burn'] as const`
  - `export const BLEND_MODES: readonly string[]`（上の 2 つを合わせた 18 種）
  - `export function isAdvancedBlend(mode: unknown): boolean`
  - `export function blendProblem(mode: unknown): string | null`（問題がなければ null。あれば警告の本文）
  - `export function usesAdvancedBlend(spec: unknown): boolean`
  - `export type BlendModeName`（`types.ts`）

- [ ] **Step 1: 失敗するテストを書く** — `tests/core/blend.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BASIC_BLEND_MODES, ADVANCED_BLEND_MODES, BLEND_MODES, isAdvancedBlend, blendProblem, usesAdvancedBlend } from '../../src/core/blend';

describe('the blend mode table', () => {
  it('is 4 basic and 14 advanced modes: the CSS names (add and linear-burn are the two that CSS does not have)', () => {
    expect(BASIC_BLEND_MODES).toEqual(['normal', 'add', 'screen', 'multiply']);
    expect(ADVANCED_BLEND_MODES).toHaveLength(14);
    expect(BLEND_MODES).toHaveLength(18);
    for (const m of ['overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']) {
      expect(ADVANCED_BLEND_MODES).toContain(m);
    }
    expect(new Set(BLEND_MODES).size).toBe(18);
  });
  it('isAdvancedBlend: the 14, not the basic 4, not a typo', () => {
    expect(isAdvancedBlend('soft-light')).toBe(true);
    expect(isAdvancedBlend('add')).toBe(false);
    expect(isAdvancedBlend('normal')).toBe(false);
    expect(isAdvancedBlend('softlight')).toBe(false);
    expect(isAdvancedBlend(undefined)).toBe(false);
  });
});

describe('blendProblem', () => {
  it('is null for every name in the table', () => {
    for (const m of BLEND_MODES) expect(blendProblem(m)).toBeNull();
  });
  it('says what was meant for the usual slips, and lists the modes', () => {
    const cases: Array<[string, string]> = [
      ['softlight', 'soft-light'], ['soft_light', 'soft-light'], ['SoftLight', 'soft-light'], ['hardlight', 'hard-light'],
      ['dodge', 'color-dodge'], ['colour', 'color'], ['overlay2', 'overlay'], ['lumiosity', 'luminosity'], ['Multiply', 'multiply'],
    ];
    for (const [typed, meant] of cases) {
      const p = blendProblem(typed)!;
      expect(p, typed).toContain(`blendMode "${typed}" is not supported`);
      expect(p, typed).toContain(`did you mean "${meant}"?`);
      expect(p).toContain('soft-light');
    }
  });
  it('a name that is nothing like any mode has no guess, still lists the modes; a non-string is a problem too', () => {
    expect(blendProblem('glow')).toMatch(/not supported \(use normal, add, screen, multiply, overlay/);
    expect(blendProblem('glow')).not.toContain('did you mean');
    expect(blendProblem(3)).toMatch(/blendMode 3 is not supported/);
  });
});

describe('usesAdvancedBlend', () => {
  const comp = (sequences: unknown[], extra: Record<string, unknown> = {}) => ({ type: 'composition', sequences, ...extra });
  it('finds an advanced mode on a layer, in a nested composition, and on a mask layer', () => {
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', blendMode: 'overlay' }]))).toBe(true);
    expect(usesAdvancedBlend(comp([comp([comp([{ type: 'text', text: 'a', blendMode: 'hue' }])])]))).toBe(true);
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', mask: { type: 'shape', shape: 'rect', blendMode: 'difference' } }]))).toBe(true);
    expect(usesAdvancedBlend(comp([{ type: 'composition', blendMode: 'color', sequences: [] }]))).toBe(true);
  });
  it('is false for no blend mode, the basic four, a typo, and for things that are not specs', () => {
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle' }]))).toBe(false);
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', blendMode: 'add' }, { type: 'text', text: 'a', blendMode: 'multiply' }]))).toBe(false);
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', blendMode: 'softlight' }]))).toBe(false);
    expect(usesAdvancedBlend(undefined)).toBe(false);
    expect(usesAdvancedBlend('soft-light')).toBe(false);
  });
});
```

`tests/sequences/BlendMode.test.ts` の既存の 1 件（`warns about a mode it does not support`）は、`overlay` がこれから有効な名前になるので書き換える（この Step で書き換える。まだ落ちたままでよい）:

```ts
  it('warns about a mode it does not support, with the likely name and the choices, and leaves the layer alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, name: 'halo', blendMode: 'softlight' }]);
    expect(blendOf(comp, 0)).toBeUndefined();
    const msg = warn.mock.calls.map(c => String(c[0])).find(m => m.includes('blendMode'))!;
    expect(msg).toContain('layer "halo"');
    expect(msg).toContain('"softlight"');
    expect(msg).toContain('did you mean "soft-light"?');
    expect(msg).toMatch(/add.*screen.*multiply/);
  });
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/core/blend.test.ts tests/sequences/BlendMode.test.ts; echo "exit=$?"`
Expected: FAIL（`BASIC_BLEND_MODES` が export されていない、`did you mean "soft-light"` が出ない）、exit=1

- [ ] **Step 3: 実装する** — `src/core/blend.ts` を次にする（`applyBlendMode` の高度なモードの配線は Task 4。ここでは検証だけ新しくし、動きは今までと同じ）

```ts
import { describeLayer } from './lint';
import { suggestName } from './options';

/** The modes Pixi draws itself (`add`, `screen`, `multiply`) and `normal`. */
export const BASIC_BLEND_MODES = ['normal', 'add', 'screen', 'multiply'] as const;
/** The modes that need the backdrop: our own `BlendModeFilter`s (`src/filters/blendModes.ts`), loaded only when a movie uses one. */
export const ADVANCED_BLEND_MODES = [
  'overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity', 'linear-burn',
] as const;
/** Every `blendMode` there is (the one table the warnings, the types and the docs check against). */
export const BLEND_MODES: readonly string[] = [...BASIC_BLEND_MODES, ...ADVANCED_BLEND_MODES];

export function isAdvancedBlend(mode: unknown): boolean {
  return typeof mode === 'string' && (ADVANCED_BLEND_MODES as readonly string[]).includes(mode);
}

/** Why `mode` is not a blend mode, with the likely name and the choices; null when it is one. */
export function blendProblem(mode: unknown): string | null {
  if (typeof mode === 'string' && BLEND_MODES.includes(mode)) return null;
  const guess = typeof mode === 'string' ? suggestName(mode, BLEND_MODES) : null;
  const shown = typeof mode === 'string' ? `"${mode}"` : String(mode);
  return `blendMode ${shown} is not supported${guess ? `; did you mean "${guess}"?` : ''} (use ${BLEND_MODES.join(', ')})`;
}

/** Does any layer of this composition (or one nested in it, or a mask layer) use an advanced blend? */
export function usesAdvancedBlend(spec: unknown): boolean {
  const visit = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return false;
    if (Array.isArray(n)) return n.some(visit);
    const o = n as Record<string, unknown>;
    return isAdvancedBlend(o.blendMode) || visit(o.sequences) || visit(o.mask);
  };
  return visit(spec);
}

/** Apply a layer's `blendMode` to its display object; an unknown mode warns and is ignored. */
export function applyBlendMode(spec: { blendMode?: string; name?: string; type: string }, display: { blendMode?: unknown; filters?: unknown }): void {
  const mode = spec.blendMode;
  if (mode === undefined) return;
  const problem = blendProblem(mode);
  if (problem) {
    console.warn(`pixi-effects: ${describeLayer(spec)}: ${problem}`);
    return;
  }
  // A container's blend mode applies INSIDE a filter's offscreen pass (against transparent black: multiply gave
  // solid black) and not to the filtered result. With filters, the pass that draws onto the backdrop is the last
  // filter's, so the mode goes there; the container stays normal.
  const filters = display.filters;
  if (Array.isArray(filters) && filters.length > 0) {
    (filters[filters.length - 1] as { blendMode?: unknown }).blendMode = mode;
    return;
  }
  display.blendMode = mode;
}
```

`src/types.ts` の 238 行の `blendMode?: 'normal' | 'add' | 'screen' | 'multiply';` を次にする（直前に型を足す）:

```ts
/** How a layer blends with what is behind it: the CSS `mix-blend-mode` names, plus `add` and `linear-burn`. */
export type BlendModeName =
  | 'normal' | 'add' | 'screen' | 'multiply'
  | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity' | 'linear-burn';
```
```ts
  blendMode?: BlendModeName;
```
`src/index.ts` の型の再 export（`export type {` の並び）に `BlendModeName` を足す（`SequenceCommon` などを `types` から再 export している行に並べる。`grep -n "SequenceCommon" src/index.ts` で見つける）。

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/core tests/sequences/BlendMode.test.ts; echo "exit=$?"; npx tsc --noEmit; echo "tsc=$?"`
Expected: PASS、exit=0、tsc=0。`suggestName` の案内が 1 件でも合わないときは、その入力を手で確かめ、**表や候補を直すのではなく**テストの期待を実際の `suggestName` の挙動に合わせてよいか判断する（案内が出ないなら `suggestName` の距離規則の範囲外。そのときは、ハイフンとアンダースコアを外した小文字の比較を `blendProblem` に足す: `mode.toLowerCase().replace(/[-_ ]/g, '')` が表の名前から同じ形を作ったものと一致するなら、それを案内する）。

- [ ] **Step 5: コミット**

```bash
git add src/core/blend.ts src/types.ts src/index.ts tests/core/blend.test.ts tests/sequences/BlendMode.test.ts
git commit -m "feat: blend mode table (18 names), did-you-mean warning, usesAdvancedBlend

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ブレンドフィルタ 14 本と工場の登録口

**Files:**
- Create: `src/filters/blendModes.ts`
- Modify: `src/core/blend.ts`（工場の登録口）、`tests/space/mockPixi.ts`（`BlendModeFilter` / `ExtensionType` / `extensions`）
- Test: `tests/filters/blendModes.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `ADVANCED_BLEND_MODES`
- Produces:
  - blend.ts: `export type BlendFilterLike = { blendMode?: unknown; destroy(): void }`、`export function setBlendFilterFactory(f: ((mode: string) => BlendFilterLike | null) | null): void`、`export function blendFilterFor(mode: string): BlendFilterLike | null`
  - blendModes.ts: `export function registerBlendModes(): void`（何度呼んでも 1 回だけ登録し、工場を blend.ts に渡す）、`export function createBlendFilter(mode: string): BlendFilterLike | null`、`export const OWN_MODES: readonly string[]`

- [ ] **Step 1: モックに足す** — `tests/space/mockPixi.ts` の `Filter` クラス（`class Filter {…}`）の下に追加し、`return { … }` に載せる

```ts
  class BlendModeFilter extends Filter { options: unknown; constructor(options: unknown) { super(); this.options = options; } }
  const ExtensionType = { BlendMode: 'blend-mode' };
  const added: unknown[] = [];
  const extensions = { add(c: unknown) { added.push(c); }, __added: added };
```
`return { Container, …, Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert: '', … }` に `BlendModeFilter, ExtensionType, extensions` を足す。

- [ ] **Step 2: 失敗するテストを書く** — `tests/filters/blendModes.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());

import { extensions } from 'pixi.js';
import { ADVANCED_BLEND_MODES, blendFilterFor, setBlendFilterFactory } from '../../src/core/blend';
import { registerBlendModes, createBlendFilter, OWN_MODES } from '../../src/filters/blendModes';

const added = () => (extensions as unknown as { __added: Array<{ extension: { name: string; type: string } }> }).__added;

beforeEach(() => { setBlendFilterFactory(null); });

describe('the blend filters', () => {
  it('there is one for each advanced mode of the table, and no other', () => {
    expect([...OWN_MODES].sort()).toEqual([...ADVANCED_BLEND_MODES].sort());
  });
  it('registerBlendModes registers each once under its CSS name, and again does nothing', () => {
    registerBlendModes();
    registerBlendModes();
    const names = added().map(c => c.extension.name);
    expect([...names].sort()).toEqual([...ADVANCED_BLEND_MODES].sort());
    expect(added().every(c => c.extension.type === 'blend-mode')).toBe(true);
  });
  it('after registering, blend.ts can make a filter for a mode: a new one each time; none for a basic mode or a typo', () => {
    registerBlendModes();
    const a = blendFilterFor('overlay'), b = blendFilterFor('overlay');
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
    expect(blendFilterFor('add')).toBeNull();
    expect(blendFilterFor('softlight')).toBeNull();
    expect(createBlendFilter('hue')).not.toBeNull();
  });
  it('before registering there is no factory: blend.ts makes nothing', () => {
    expect(blendFilterFor('overlay')).toBeNull();
  });
});
```

- [ ] **Step 3: 落ちるのを確かめる**

Run: `npx vitest run tests/filters/blendModes.test.ts; echo "exit=$?"`
Expected: FAIL（`blendModes` が無い）、exit=1

- [ ] **Step 4: 実装する**

`src/core/blend.ts` に追加（ファイルの末尾）:

```ts
/** What blend.ts needs of a blend filter (the real ones are Pixi filters; tests use plain objects). */
export type BlendFilterLike = { blendMode?: unknown; destroy(): void };
let factory: ((mode: string) => BlendFilterLike | null) | null = null;

/** `filters/blendModes.ts` hands its filter maker here when it registers, so this file never imports Pixi. */
export function setBlendFilterFactory(f: ((mode: string) => BlendFilterLike | null) | null): void {
  factory = f;
}

/** A fresh blend filter for an advanced mode, or null when the blends are not registered (or the mode is not an advanced one). */
export function blendFilterFor(mode: string): BlendFilterLike | null {
  return isAdvancedBlend(mode) && factory ? factory(mode) : null;
}
```

`src/filters/blendModes.ts` を新規作成（式は試作 `docs/superpowers/spikes-0.21-0.22/blend-modes/blendModes.ts` のものを**そのまま**使う。W3C 基準と 4 構成で 1/255 以内だった。ここでは構成だけ変える）:

```ts
import { BlendModeFilter, ExtensionType, extensions } from 'pixi.js';
import { setBlendFilterFactory, type BlendFilterLike } from '../core/blend';

/**
 * The W3C compositing blend modes as our own `BlendModeFilter`s, registered on the SAME pixi instance the movie uses (this file imports
 * 'pixi.js' like the rest of the library; `import 'pixi.js/advanced-blend-modes'` would register on its own copy of `extensions` when
 * the page maps pixi.js to an esm.sh bundle, and then nothing is registered and the layer silently draws as `normal`). It also avoids
 * what pixi 8.22's own versions get wrong: the source colour is premultiplied (a half-transparent layer was blended with its darkened
 * colour and then faded again), the backdrop's alpha is ignored, soft-light is inverted on WebGPU (`select` arguments swapped),
 * linear-light and saturation are wrong. Loaded by `Movie.init` only when a layer uses one of these (see `usesAdvancedBlend`).
 */
type Sep = { gl: string; gpu: string };   // a separable blend: the body of  B(b, s)  for one channel

const SEPARABLE: Record<string, Sep> = {
  overlay:       { gl: 'return b <= 0.5 ? 2.0 * b * s : 1.0 - 2.0 * (1.0 - b) * (1.0 - s);', gpu: 'return select(1.0 - 2.0 * (1.0 - b) * (1.0 - s), 2.0 * b * s, b <= 0.5);' },
  'hard-light':  { gl: 'return s <= 0.5 ? 2.0 * b * s : 1.0 - 2.0 * (1.0 - b) * (1.0 - s);', gpu: 'return select(1.0 - 2.0 * (1.0 - b) * (1.0 - s), 2.0 * b * s, s <= 0.5);' },
  'soft-light':  {
    gl: 'if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b); float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return b + (2.0 * s - 1.0) * (d - b);',
    gpu: 'let d = select(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, b <= 0.25); return select(b + (2.0 * s - 1.0) * (d - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), s <= 0.5);',
  },
  'color-dodge': { gl: 'if (b <= 0.0) return 0.0; return s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s));', gpu: 'if (b <= 0.0) { return 0.0; } return select(min(1.0, b / (1.0 - s)), 1.0, s >= 1.0);' },
  'color-burn':  { gl: 'if (b >= 1.0) return 1.0; return s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s);', gpu: 'if (b >= 1.0) { return 1.0; } return select(1.0 - min(1.0, (1.0 - b) / s), 0.0, s <= 0.0);' },
  darken:        { gl: 'return min(b, s);', gpu: 'return min(b, s);' },
  lighten:       { gl: 'return max(b, s);', gpu: 'return max(b, s);' },
  difference:    { gl: 'return abs(b - s);', gpu: 'return abs(b - s);' },
  exclusion:     { gl: 'return b + s - 2.0 * b * s;', gpu: 'return b + s - 2.0 * b * s;' },
  'linear-burn': { gl: 'return max(0.0, b + s - 1.0);', gpu: 'return max(0.0, b + s - 1.0);' },
};

const GL_NONSEP = `
float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
vec3 clipColor(vec3 c) { float l = lum(c); float n = min(c.r, min(c.g, c.b)); float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + (c - l) * l / (l - n); if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l); return c; }
vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float sat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
vec3 setSat(vec3 c, float s) { float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b)); return mx > mn ? (c - mn) * s / (mx - mn) : vec3(0.0); }`;
const GPU_NONSEP = `
fn lum(c: vec3<f32>) -> f32 { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
fn clipColor(c0: vec3<f32>) -> vec3<f32> { var c = c0; let l = lum(c); let n = min(c.r, min(c.g, c.b)); let x = max(c.r, max(c.g, c.b));
  if (n < 0.0) { c = l + (c - l) * l / (l - n); } if (x > 1.0) { c = l + (c - l) * (1.0 - l) / (x - l); } return c; }
fn setLum(c: vec3<f32>, l: f32) -> vec3<f32> { return clipColor(c + (l - lum(c))); }
fn sat(c: vec3<f32>) -> f32 { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
fn setSat(c: vec3<f32>, s: f32) -> vec3<f32> { let mx = max(c.r, max(c.g, c.b)); let mn = min(c.r, min(c.g, c.b)); if (mx > mn) { return (c - vec3<f32>(mn)) * s / (mx - mn); } return vec3<f32>(0.0); }`;
const NONSEP: Record<string, { gl: string; gpu: string }> = {
  hue:        { gl: 'return setLum(setSat(cs, sat(cb)), lum(cb));', gpu: 'return setLum(setSat(cs, sat(cb)), lum(cb));' },
  saturation: { gl: 'return setLum(setSat(cb, sat(cs)), lum(cb));', gpu: 'return setLum(setSat(cb, sat(cs)), lum(cb));' },
  color:      { gl: 'return setLum(cs, lum(cb));', gpu: 'return setLum(cs, lum(cb));' },
  luminosity: { gl: 'return setLum(cb, lum(cs));', gpu: 'return setLum(cb, lum(cs));' },
};

const GL_MAIN = `
  vec3 cs = front.a > 0.0 ? front.rgb / front.a : vec3(0.0);
  vec3 cb = back.a > 0.0 ? back.rgb / back.a : vec3(0.0);
  vec3 mixed = front.rgb * (1.0 - back.a) + front.a * back.a * blendRGB(cb, cs) + (1.0 - front.a) * back.rgb;
  finalColor = vec4(mixed, blendedAlpha) * uBlend;`;
const GPU_MAIN = `
  let cs = select(vec3<f32>(0.0), front.rgb / front.a, front.a > 0.0);
  let cb = select(vec3<f32>(0.0), back.rgb / back.a, back.a > 0.0);
  let mixed = front.rgb * (1.0 - back.a) + front.a * back.a * blendRGB(cb, cs) + (1.0 - front.a) * back.rgb;
  out = vec4<f32>(mixed, blendedAlpha) * blendUniforms.uBlend;`;

const CLASSES = new Map<string, new () => BlendModeFilter>();

/** A fresh blend filter for a layer that has filters of its own (it goes last in the chain and reads the backdrop). */
export function createBlendFilter(name: string): BlendFilterLike | null {
  const C = CLASSES.get(name);
  return C ? (new C() as unknown as BlendFilterLike) : null;
}

function make(name: string, gl: string, gpu: string): void {
  const C = class extends BlendModeFilter {
    static extension = { name, type: ExtensionType.BlendMode };
    constructor() { super({ gl: { functions: gl, main: GL_MAIN }, gpu: { functions: gpu, main: GPU_MAIN } }); }
  };
  CLASSES.set(name, C);
  extensions.add(C as never);
}

export const OWN_MODES: readonly string[] = [...Object.keys(SEPARABLE), ...Object.keys(NONSEP)];

let done = false;
/** Register the blends (once per page), and give `core/blend.ts` the maker for the filter chain case. */
export function registerBlendModes(): void {
  if (done) return;
  done = true;
  for (const [name, s] of Object.entries(SEPARABLE)) {
    make(name,
      `float B(float b, float s) { ${s.gl} }\nvec3 blendRGB(vec3 cb, vec3 cs) { return vec3(B(cb.r, cs.r), B(cb.g, cs.g), B(cb.b, cs.b)); }`,
      `fn B(b: f32, s: f32) -> f32 { ${s.gpu} }\nfn blendRGB(cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> { return vec3<f32>(B(cb.r, cs.r), B(cb.g, cs.g), B(cb.b, cs.b)); }`);
  }
  for (const [name, s] of Object.entries(NONSEP)) {
    make(name, `${GL_NONSEP}\nvec3 blendRGB(vec3 cb, vec3 cs) { ${s.gl} }`, `${GPU_NONSEP}\nfn blendRGB(cb: vec3<f32>, cs: vec3<f32>) -> vec3<f32> { ${s.gpu} }`);
  }
  setBlendFilterFactory(createBlendFilter);
}
```

注: `registerBlendModes` が「1 回だけ」なのは、1 ページに複数の `Movie` があっても同じ pixi の `extensions` に二重登録しないため。テストでは `done` がモジュール内に残るので、`registerBlendModes` を呼ぶテストは、同じファイル内で 1 つの登録を共有する前提で書く（上のテストはそのとおり）。「before registering」のテストは、`setBlendFilterFactory(null)` を `beforeEach` で呼んでいるので、登録済みでも工場なしの状態を作れる。

- [ ] **Step 5: 通るのを確かめる**

Run: `npx vitest run tests/filters/blendModes.test.ts tests/core tests/space; echo "exit=$?"; npx tsc --noEmit; echo "tsc=$?"`
Expected: PASS、exit=0、tsc=0。`BlendModeFilter` が `@internal` 型でも `pixi.js` から import できること（`tsc` が通れば可）。通らないときは `import { BlendModeFilter } from 'pixi.js'` の型の出どころを確かめ、`as never` / `as unknown as` で最小限に型をなだめる（実行時の形は試作で確認済み）。

- [ ] **Step 6: コミット**

```bash
git add src/filters/blendModes.ts src/core/blend.ts tests/space/mockPixi.ts tests/filters/blendModes.test.ts
git commit -m "feat: 14 blend filters (W3C modes) registered on the movie's own pixi, loaded lazily through a factory in blend.ts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `Movie.init` の配線（使う作品だけ遅延読み込み）

**Files:**
- Modify: `src/core/blend.ts`（`enableAdvancedBlend`）、`src/core/Movie.ts`、`scripts/post-publish-check.mjs`（新しいチャンクの名前）、`tsup.config.ts`（変更なし。分割は既に有効）
- Test: `tests/core/blend.test.ts`（追記）。実ブラウザでの確認は Task 5。

**Interfaces:**
- Consumes: Task 1 の `usesAdvancedBlend`、Task 2 の `registerBlendModes`
- Produces: `export async function enableAdvancedBlend(renderer: unknown): Promise<void>`（blend.ts。動的 import で `filters/blendModes` を読み、登録し、WebGL ではバックバッファを有効にする）

- [ ] **Step 1: 失敗するテストを書く** — `tests/core/blend.test.ts` の先頭に `vi.mock` を足し、末尾に追記

先頭の import を次に直す:
```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { BASIC_BLEND_MODES, ADVANCED_BLEND_MODES, BLEND_MODES, isAdvancedBlend, blendProblem, usesAdvancedBlend, enableAdvancedBlend, blendFilterFor } from '../../src/core/blend';
```
末尾に:
```ts
describe('enableAdvancedBlend', () => {
  it('registers the blends (blend.ts can then make a filter) and turns the WebGL back buffer on', async () => {
    const renderer = { backBuffer: { useBackBuffer: false } };
    await enableAdvancedBlend(renderer);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    expect(blendFilterFor('overlay')).not.toBeNull();
  });
  it('a renderer with no back buffer (WebGPU) is fine', async () => {
    await expect(enableAdvancedBlend({})).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/core/blend.test.ts; echo "exit=$?"`
Expected: FAIL（`enableAdvancedBlend` が無い）、exit=1

- [ ] **Step 3: 実装する**

`src/core/blend.ts` に追加:
```ts
/**
 * Called by `Movie.init` when a layer uses an advanced mode, and only then: loads our blend filters (a separate chunk), registers them on
 * the pixi the movie runs on, and on WebGL turns the back buffer on (an advanced blend reads what is already drawn; WebGPU copies the
 * backdrop by itself, and has no such switch). A movie that uses none never reaches this, so nothing about it changes.
 */
export async function enableAdvancedBlend(renderer: unknown): Promise<void> {
  const { registerBlendModes } = await import('../filters/blendModes');
  registerBlendModes();
  const bb = (renderer as { backBuffer?: { useBackBuffer: boolean } }).backBuffer;
  if (bb) bb.useBackBuffer = true;
}
```

`src/core/Movie.ts`: 先頭の import に `import { usesAdvancedBlend, enableAdvancedBlend } from './blend';` を足し、WebGPU/WebGL の `try / catch` の直後、`const root = new Container();` の直前に:
```ts
      if (usesAdvancedBlend(options.composition)) await enableAdvancedBlend(this.app.renderer);
```

`scripts/post-publish-check.mjs` の `FILES` の `readdirSync('dist').filter(...)` を、新しいチャンクも数えるように直す:
```js
...readdirSync('dist').filter(f => /^(music|blendModes)-.*\.js$/.test(f))
```

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/core/blend.test.ts tests/tools 2>&1 | tail -4; npx tsc --noEmit; echo "tsc=$?"; npm run build 2>&1 | tail -3; ls dist | grep -i blendModes`
Expected: 単体 PASS、tsc=0、ビルド成功、`dist/blendModes-XXXX.js`（と `.cjs` / `.map`）ができる。**できなければ**、tsup が動的 import を静的にまとめている: `await import('../filters/blendModes')` の文字列がそのまま残っているかを `grep -n "blendModes" dist/index.js | head -3` で確かめる。`tests/tools` は Chrome を使うテストを含むので、ここでは走らせない（`tests/core/blend.test.ts` だけ）。

- [ ] **Step 5: コミット**

```bash
git add src/core/blend.ts src/core/Movie.ts scripts/post-publish-check.mjs tests/core/blend.test.ts
git commit -m "feat: Movie.init loads and registers the blend filters only when a layer uses an advanced mode

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `applyBlendMode` の配線（フィルタ付きの層、被写界深度との順序）

**Files:**
- Modify: `src/core/blend.ts`（`applyBlendMode`）、`src/space/Layer3D.ts`（`setBlur`）
- Test: `tests/sequences/BlendMode.test.ts`（追記）、`tests/space/Layer3D.test.ts`（追記）

**Interfaces:**
- Consumes: Task 2 の `setBlendFilterFactory` / `blendFilterFor`、Task 1 の `isAdvancedBlend`
- Produces: なし（動作の変更）

- [ ] **Step 1: 失敗するテストを書く**

`tests/sequences/BlendMode.test.ts` の先頭の import に `import { setBlendFilterFactory } from '../../src/core/blend';` を足し、末尾に追記:

```ts
describe('an advanced blendMode', () => {
  const made: Array<{ mode: string; blendMode?: unknown; destroy(): void }> = [];
  beforeEach(() => {
    made.length = 0;
    setBlendFilterFactory(mode => { const f = { mode, destroy() {} }; made.push(f); return f; });
  });

  it('on a layer with no filters is set on the display object, like the basic modes (Pixi draws it through the registered filter)', async () => {
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'soft-light' }]);
    expect(blendOf(comp, 0)).toBe('soft-light');
    expect(made).toHaveLength(0);
  });

  it('on a layer WITH filters becomes one more filter, last in the chain (a mode on the last filter would only blend a basic mode)', async () => {
    const f1: Record<string, unknown> = { apply() {} };
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    const display = comp.layers()[0]!.display as unknown as { filters: unknown[]; blendMode?: string };
    expect(display.filters).toHaveLength(2);
    expect(display.filters[0]).toBe(f1);
    expect((display.filters[1] as { mode: string }).mode).toBe('overlay');
    expect(f1.blendMode).toBeUndefined();            // the layer's own filter stays normal
    expect(display.blendMode).toBeUndefined();       // and so does the container
  });

  it('with the blends not registered (no factory), a layer with filters warns once and draws normal; one without filters is left to Pixi', async () => {
    setBlendFilterFactory(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f1: Record<string, unknown> = { apply() {} };
    const comp = await build([{ type: 'shape', shape: 'circle', radius: 10, name: 'glow', blendMode: 'overlay', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    const display = comp.layers()[0]!.display as unknown as { filters: unknown[] };
    expect(display.filters).toHaveLength(1);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('blendMode'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('layer "glow"');
    expect(said[0]).toMatch(/not set up|could not/);
  });

  it('the basic modes behave exactly as before (the last filter carries the mode)', async () => {
    const f1: Record<string, unknown> = { apply() {} };
    await build([{ type: 'shape', shape: 'circle', radius: 10, blendMode: 'screen', filters: [{ type: 'custom', name: 'a', filter: f1 }] }]);
    expect(f1.blendMode).toBe('screen');
    expect(made).toHaveLength(0);
  });
});
```

`tests/space/Layer3D.test.ts` の `describe('Layer3D.setBlur (depth of field)', …)` の中（最後の `it` の後）に追記（先頭の import に `import { setBlendFilterFactory } from '../../src/core/blend';` を足す）:

```ts
  describe('with an advanced blend mode on the layer', () => {
    const made: Array<{ mode: string; destroyed: boolean; destroy(): void }> = [];
    beforeEach(() => {
      made.length = 0;
      setBlendFilterFactory(mode => { const f = { mode, destroyed: false, destroy() { f.destroyed = true; } }; made.push(f); return f; });
    });
    afterAll(() => setBlendFilterFactory(null));

    it('the blur filter goes first and a blend filter last (blur, then blend); the display itself is normal', () => {
      const { layer } = setup();
      const d = layer.display as unknown as { blendMode: string; filters: Array<{ mode?: string }> | null };
      d.blendMode = 'overlay';
      layer.setBlur(6);
      expect(d.filters).toHaveLength(2);
      expect(d.filters![1]!.mode).toBe('overlay');
      expect(d.blendMode).toBe('normal');
    });
    it('when the blur goes, the mode is back on the display and the blend filter is destroyed (no filter is left behind)', () => {
      const { layer } = setup();
      const d = layer.display as unknown as { blendMode: string; filters: unknown[] | null };
      d.blendMode = 'soft-light';
      layer.setBlur(6);
      layer.setBlur(0);
      expect(d.filters).toBeNull();
      expect(d.blendMode).toBe('soft-light');
      expect(made).toHaveLength(1);
      expect(made[0]!.destroyed).toBe(true);
    });
    it('turning the blur on and off again gives the same state each time', () => {
      const { layer } = setup();
      const d = layer.display as unknown as { blendMode: string; filters: unknown[] | null };
      d.blendMode = 'hue';
      for (let i = 0; i < 3; i++) {
        layer.setBlur(5);
        expect(d.filters).toHaveLength(2);
        layer.setBlur(0);
        expect(d.filters).toBeNull();
        expect(d.blendMode).toBe('hue');
      }
      expect(made.every(f => f.destroyed)).toBe(true);
    });
    it('a basic mode is still carried by the blur filter, as in 0.21', () => {
      const { layer } = setup();
      const d = layer.display as unknown as { blendMode: string };
      d.blendMode = 'add';
      layer.setBlur(5);
      expect(d.blendMode).toBe('normal');
      expect(made).toHaveLength(0);
    });
  });
```
（`beforeEach` / `afterAll` は `vitest` から import する: 先頭の `import { describe, it, expect, vi, beforeEach } from 'vitest';` に `afterAll` を足す。）

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/sequences/BlendMode.test.ts tests/space/Layer3D.test.ts; echo "exit=$?"`
Expected: 新しい 2 つの `describe` が FAIL（フィルタ付きの層で `filters` が 1 のまま、`made` が空）、exit=1

- [ ] **Step 3: 実装する**

`src/core/blend.ts` の `applyBlendMode` のフィルタ付きの分岐を次にする:

```ts
  const filters = display.filters;
  if (Array.isArray(filters) && filters.length > 0) {
    if (isAdvancedBlend(mode)) {
      // an advanced mode is a filter of its own (it reads the backdrop): it joins the chain as the last pass
      const blend = blendFilterFor(mode);
      if (!blend) {
        console.warn(`pixi-effects: ${describeLayer(spec)}: blendMode "${mode}" could not be set up (the blend filters are not registered); the layer is drawn normal`);
        return;
      }
      display.filters = [...filters, blend];
      return;
    }
    (filters[filters.length - 1] as { blendMode?: unknown }).blendMode = mode;
    return;
  }
```
（`blendFilterFor` は同じファイルの下にあるが、関数宣言なので呼べる。）

`src/space/Layer3D.ts` の `setBlur`: import に `import { blendFilterFor, isAdvancedBlend, type BlendFilterLike } from '../core/blend';` を足し、クラスのフィールドに `private blendFilter: BlendFilterLike | null = null;` を足し、`setBlur` の `r === 0` の分岐と、フィルタを作る分岐を次にする:

```ts
    if (r === 0) {
      if (this.blurFilter) {
        d.filters = null;
        d.blendMode = this.blendWas;
        this.blurFilter.destroy();
        this.blurFilter = null;
        this.blendFilter?.destroy();
        this.blendFilter = null;
      }
      return;
    }
    if (!this.blurFilter) {
      this.blurFilter = new DiscBlurFilter(r);
      this.blendWas = d.blendMode ?? 'normal';
      const chain: unknown[] = [this.blurFilter];
      if (isAdvancedBlend(this.blendWas)) {
        // an advanced mode is a filter of its own: blur first, then blend what is blurred onto the backdrop
        this.blendFilter = blendFilterFor(this.blendWas);
        if (this.blendFilter) { chain.push(this.blendFilter); d.blendMode = 'normal'; }
      } else if (this.blendWas !== 'normal' && this.blendWas !== 'inherit') {
        // only an explicit basic mode moves ('inherit' is Pixi's default for a container and 'normal' is the filter's own: nothing to move)
        this.blurFilter.blendMode = this.blendWas as never;
        d.blendMode = 'normal';
      }
      d.filters = chain;
    }
    this.blurFilter.radius = r;
```
（元の `if (this.blendWas !== 'normal' && this.blendWas !== 'inherit') {…}` の塊はこの形に置き換える。コメントの「No hysteresis on purpose」はそのまま残す。）

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/sequences tests/space tests/core; echo "exit=$?"; npx tsc --noEmit; echo "tsc=$?"`
Expected: PASS、exit=0、tsc=0

- [ ] **Step 5: コミット**

```bash
git add src/core/blend.ts src/space/Layer3D.ts tests/sequences/BlendMode.test.ts tests/space/Layer3D.test.ts
git commit -m "feat: an advanced blend is the last filter of a layer's chain (after the depth-of-field blur on a threeD layer)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 実ブラウザでの受け入れ（14 種を W3C の基準と画素で比べる）

**Files:**
- Create: `tests/support/blendReference.ts`（W3C の式、テスト専用）、`tests/tools/blendReference.test.ts`（基準そのものの自己検査）、`examples/_checks/blend-modes.html`、`tests/tools/blendModes.test.ts`
- Modify: `scripts/test-changed.mjs`（領域を足す）

**Interfaces:**
- Consumes: Task 1〜4 の全部。`dist/index.js`（`npm run build`）
- Produces: ページの関数 `mk(opts)`, `snap(f)`, `px(url, x, y)`（RGBA 0..255 の配列）, `diff(a, b)`, `orders(frames)`, `lib()`（`movie.app.renderer` の情報: `name`、`backBuffer?.useBackBuffer`）。テストは**測った最大差**を `console.log` に出す。

- [ ] **Step 1: 基準実装を書く** — `tests/support/blendReference.ts`（W3C Compositing and Blending Level 1 の式。**ライブラリのコードは使わない**）

```ts
/** The W3C Compositing and Blending Level 1 blend functions, written from the specification (not from the shaders), for the tests. Channels are 0..1. */
type RGB = [number, number, number];

const sep = (f: (b: number, s: number) => number) => (cb: RGB, cs: RGB): RGB => [f(cb[0], cs[0]), f(cb[1], cs[1]), f(cb[2], cs[2])];
const multiply = (b: number, s: number) => b * s;
const screen = (b: number, s: number) => b + s - b * s;
const hardLight = (b: number, s: number) => (s <= 0.5 ? multiply(b, 2 * s) : screen(b, 2 * s - 1));
const softLight = (b: number, s: number) => {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
};

const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const clipColor = (c: RGB): RGB => {
  const l = lum(c), n = Math.min(...c), x = Math.max(...c);
  let out: RGB = [...c] as RGB;
  if (n < 0) out = out.map(v => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map(v => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
};
const setLum = (c: RGB, l: number): RGB => { const d = l - lum(c); return clipColor([c[0] + d, c[1] + d, c[2] + d]); };
const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
const setSat = (c: RGB, s: number): RGB => {
  const mx = Math.max(...c), mn = Math.min(...c);
  return mx > mn ? (c.map(v => ((v - mn) * s) / (mx - mn)) as RGB) : [0, 0, 0];
};

/** The blend function B(cb, cs) of each advanced mode (cb: backdrop colour, cs: source colour; both un-premultiplied). */
export const BLEND: Record<string, (cb: RGB, cs: RGB) => RGB> = {
  overlay: sep((b, s) => hardLight(s, b)),
  'hard-light': sep(hardLight),
  'soft-light': sep(softLight),
  'color-dodge': sep((b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)))),
  'color-burn': sep((b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s))),
  darken: sep((b, s) => Math.min(b, s)),
  lighten: sep((b, s) => Math.max(b, s)),
  difference: sep((b, s) => Math.abs(b - s)),
  exclusion: sep((b, s) => b + s - 2 * b * s),
  'linear-burn': sep((b, s) => Math.max(0, b + s - 1)),
  hue: (cb, cs) => setLum(setSat(cs, sat(cb)), lum(cb)),
  saturation: (cb, cs) => setLum(setSat(cb, sat(cs)), lum(cb)),
  color: (cb, cs) => setLum(cs, lum(cb)),
  luminosity: (cb, cs) => setLum(cb, lum(cs)),
};

/**
 * The colour a source of colour `cs` and alpha `as` makes over a backdrop of colour `cb` and alpha `ab`, as 0..255 channels, in the
 * source-over compositing with a blend function (W3C: Co = (1 - ab) * as * Cs + (1 - as) * ab * Cb + as * ab * B(Cb, Cs), premultiplied;
 * the result here is un-premultiplied by the result alpha).
 */
export function blendPixel(mode: string, cb: RGB, ab: number, cs: RGB, as: number): [number, number, number, number] {
  const B = BLEND[mode]!(cb, cs);
  const ar = as + ab * (1 - as);
  const out = [0, 1, 2].map(i => ((1 - ab) * as * cs[i]! + (1 - as) * ab * cb[i]! + as * ab * B[i]!) / (ar || 1));
  return [out[0]! * 255, out[1]! * 255, out[2]! * 255, ar * 255];
}

export const hexToRgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
```

`tests/tools/blendReference.test.ts`（基準そのものの自己検査。Chrome なし。仕様書の既知の値で）:
```ts
import { describe, it, expect } from 'vitest';
import { BLEND, blendPixel, hexToRgb } from '../support/blendReference';

describe('the W3C reference blend functions', () => {
  const grey = (v: number): [number, number, number] => [v, v, v];
  it('multiply-like and extremes: overlay of mid-grey over x is x; difference of equal colours is black; exclusion with black is the backdrop', () => {
    expect(BLEND.overlay!(grey(0.25), grey(0.5))[0]).toBeCloseTo(0.25, 12);
    expect(BLEND.difference!(grey(0.4), grey(0.4))[0]).toBe(0);
    expect(BLEND.exclusion!(grey(0.7), grey(0))[0]).toBeCloseTo(0.7, 12);
    expect(BLEND['hard-light']!(grey(0.5), grey(1))[0]).toBe(1);
    expect(BLEND['linear-burn']!(grey(0.3), grey(0.4))[0]).toBe(0);
  });
  it('dodge and burn at the edges (W3C: a black backdrop stays black under dodge; a white one stays white under burn)', () => {
    expect(BLEND['color-dodge']!(grey(0), grey(0.9))[0]).toBe(0);
    expect(BLEND['color-dodge']!(grey(0.5), grey(1))[0]).toBe(1);
    expect(BLEND['color-burn']!(grey(1), grey(0.1))[0]).toBe(1);
    expect(BLEND['color-burn']!(grey(0.5), grey(0))[0]).toBe(0);
  });
  it('soft-light: a mid-grey source changes nothing; a bright source lightens a dark backdrop a little', () => {
    expect(BLEND['soft-light']!(grey(0.3), grey(0.5))[0]).toBeCloseTo(0.3, 12);
    expect(BLEND['soft-light']!(grey(0.2), grey(1))[0]).toBeGreaterThan(0.2);
    expect(BLEND['soft-light']!(grey(0.2), grey(1))[0]).toBeLessThan(0.5);
  });
  it('the non-separable modes keep their promises: luminosity keeps the backdrop hue, color keeps the backdrop luminance', () => {
    const cb = hexToRgb('#3366cc'), cs = hexToRgb('#ffcc00');
    const lum = (c: number[]) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
    expect(lum(BLEND.color!(cb, cs))).toBeCloseTo(lum(cb), 9);
    expect(lum(BLEND.luminosity!(cb, cs))).toBeCloseTo(lum(cs), 9);
    for (const c of [BLEND.hue!(cb, cs), BLEND.saturation!(cb, cs), BLEND.color!(cb, cs), BLEND.luminosity!(cb, cs)]) for (const v of c) { expect(v).toBeGreaterThanOrEqual(-1e-9); expect(v).toBeLessThanOrEqual(1 + 1e-9); }
  });
  it('blendPixel: alpha 1 over an opaque backdrop is the blend; alpha 0 is the backdrop; over a transparent backdrop it is the source (normal)', () => {
    const cb = hexToRgb('#336699'), cs = hexToRgb('#cc9933');
    const full = blendPixel('overlay', cb, 1, cs, 1);
    const B = BLEND.overlay!(cb, cs);
    expect(full[0]).toBeCloseTo(B[0] * 255, 9);
    expect(blendPixel('overlay', cb, 1, cs, 0).slice(0, 3).map(Math.round)).toEqual([0x33, 0x66, 0x99]);
    const over = blendPixel('overlay', cb, 0, cs, 1);
    expect(over.slice(0, 3).map(Math.round)).toEqual([0xcc, 0x99, 0x33]);
    expect(over[3]).toBe(255);
  });
});
```

- [ ] **Step 2: 基準の自己検査を走らせる**

Run: `npx vitest run tests/tools/blendReference.test.ts; echo "exit=$?"`
Expected: PASS（Chrome なし。基準が仕様書の性質を満たすこと）、exit=0。落ちたら**基準の式を仕様書に照らして直す**（ライブラリのシェーダーを見て合わせない）。

- [ ] **Step 3: チェックページを書く** — `examples/_checks/blend-modes.html`

`examples/_checks/depth-of-field.html` と同じ骨格（`?backend=webgl` で `navigator.gpu` を隠す、`window.__logs`、importmap、`import { Movie } from '../../dist/index.js'`、`__ready`）。関数:

```js
    const FPS = 30;
    window.mk = async (opts) => {
      if (window.movie) { await window.movie.destroy(); window.movie = null; }
      window.__logs.length = 0;
      const movie = new Movie(); window.movie = movie;
      await movie.init({ canvas: document.createElement('canvas'), width: 160, height: 90, duration: opts.duration ?? 1, frameRate: FPS, background: opts.background ?? '#000000', ...opts });
      return { backend: movie.app.renderer.name || String(movie.app.renderer.type), backBuffer: movie.app.renderer.backBuffer ? movie.app.renderer.backBuffer.useBackBuffer : null };
    };
    const toImg = (url) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
    const pixels = async (url) => { const i = await toImg(url); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    window.snap = (f) => window.movie.snapshot(f, { as: 'dataURL' });
    window.px = async (url, x, y) => { const P = await pixels(url); const o = (y * 160 + x) * 4; return [P[o], P[o + 1], P[o + 2], P[o + 3]]; };
    window.diff = async (a, b) => { if (a === b) return 0; const A = await pixels(a), B = await pixels(b); let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.abs(A[i] - B[i])); return m; };
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
冒頭のコメントに、受け入れチェックで例ではないこと、`tests/tools/blendModes.test.ts` が使うこと、各関数の役割を書く。

- [ ] **Step 4: 失敗するテストを書く** — `tests/tools/blendModes.test.ts`

`tests/tools/depthOfField.test.ts` と同じ `withPage(fn, query)` の作り（`vi.setConfig({ testTimeout: 60000 })`、`launchPage`、`describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])`）。ケース（`blendPixel` / `hexToRgb` を `../support/blendReference` から）:

```ts
const MODES = ['overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'linear-burn'];
// three backdrops (a dark, a mid and a bright colour with different hues) and three sources: the picture is a 3 x 3 grid of cells, one per pair
const BACK = ['#2a3f6b', '#b0703a', '#e8e0c8'];
const SRC = ['#ff8a3d', '#3dd6c8', '#7a2fd0'];
const TOLERANCE = 2;                                       // 8-bit channels; the library's own measure was 1, and a second step is for the rounding of an alpha 0.5 cell

/** A 160 x 90 movie: three bands (the backdrops) and over them three squares (the sources), each blended with `mode` at alpha `a`. */
const scene = (mode: string, alpha: number, extra: Record<string, unknown> = {}) => ({ sequences: [
  ...BACK.map((c, i) => ({ type: 'shape', shape: 'rect', name: `back${i}`, width: 160, height: 30, anchorX: 0, anchorY: 0, initial: { x: 0, y: i * 30, fillColor: c } })),
  ...BACK.flatMap((_, i) => SRC.map((c, j) => ({ type: 'shape', shape: 'rect', name: `src${i}${j}`, width: 20, height: 20, anchorX: 0, anchorY: 0, blendMode: mode,
    initial: { x: 10 + j * 50, y: i * 30 + 5, fillColor: c, alpha }, ...extra }))),
] });
```
Test 1 — **各モード、アルファ 1 と 0.5、基準と 2/255 以内**:
```ts
  for (const alpha of [1, 0.5]) it(`all 14 advanced modes at alpha ${alpha} match the W3C reference within ${TOLERANCE}/255`, async () => {
    await withPage(async (cdp) => {
      let worst = 0;
      for (const mode of MODES) {
        const info = await cdp.eval(`mk(${JSON.stringify({ composition: scene(mode, alpha) })})`);
        const url = await cdp.eval('snap(0)');
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const got: number[] = await cdp.eval(`px(${JSON.stringify(url)}, ${20 + j * 50}, ${i * 30 + 15})`);
          const want = blendPixel(mode, hexToRgb(BACK[i]!), 1, hexToRgb(SRC[j]!), alpha);
          for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(got[k]! - want[k]!));
          for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `${mode} a=${alpha} backdrop ${i} source ${j} channel ${k} (backend ${info.backend}): got ${got} want ${want.map(Math.round)}`).toBeLessThanOrEqual(TOLERANCE);
        }
      }
      console.log(`[blend] alpha ${alpha}: worst channel difference ${worst.toFixed(2)} of 255`);
    });
  });
```
Test 2 — **使わない作品**: 基本 4 種だけ → `backBuffer` は `false`（WebGL）/ `null`（WebGPU）のまま、`window.__logs` に pixi-effects の警告なし; 高度なモードを使う作品 → WebGL なら `backBuffer === true`:
```ts
  it('a movie that uses no advanced mode leaves the back buffer alone; one that does turns it on (WebGL)', async () => {
    await withPage(async (cdp) => {
      const basic = await cdp.eval(`mk(${JSON.stringify({ composition: scene('multiply', 1) })})`);
      expect(basic.backBuffer === false || basic.backBuffer === null).toBe(true);
      const adv = await cdp.eval(`mk(${JSON.stringify({ composition: scene('overlay', 1) })})`);
      if (adv.backBuffer !== null) expect(adv.backBuffer).toBe(true);
    });
  });
```
Test 3 — **基本 4 種のピクセルは変わらない**（`multiply` / `screen` / `add` を基準で: multiply = `b*s`、screen = `b+s-bs`、add = `min(1,b+s)` の 3 つを `blendPixel` ではなく直接式で、アルファ 1 のセルが 2/255 以内）。
Test 4 — **フィルタ付きの層**: 各セルの四角に、色を変えないフィルタ（単位行列の `colorMatrix`: `filters: [{ type: 'colorMatrix', matrix: [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0] }]`）を付けた版（`scene('overlay', 1, { filters: [...] })`）が、基準と 2/255 以内で同じ（フィルタなしの版と同じ絵）。
Test 5 — **`threeD` 層**: `extra = { threeD: true }` でも基準と 2/255 以内（z 0・既定のカメラなので位置は同じ）。
Test 6 — **背景が透明なところ**: `threeD` の入れ子の合成層（`{ type: 'composition', width: 160, height: 90, threeD: true, sequences: [overlay の四角] }`）の中で、背景（親の矩形）を持たない四角は、通常描画と同じ色（W3C の αb = 0）。
Test 7 — **被写界深度との併用**: カメラ `{ initial: { focus: 'sharp', aperture: 40 } }` と、ぼける位置にある `threeD` 層に `soft-light` → 描かれる（ぼけた層が基準の混ぜ方で背景に乗っている: 層の中心の画素が、ぼかしで色が薄まらない大きな四角で 2/255 以内）、フィルタが残らず（ぼけない位置のフレームに動かすと元に戻る）。
Test 8 — **シーク順序**: `orders([0, 3, 6, 9, 12])` で `bwdMax` と `jmpMax` が 0（高度なモード + フィルタ付き + `threeD` を含む 1 作品で、キーフレームで `x` を動かす）。

- [ ] **Step 5: 走らせる（ここが実機の確認）**

Run: `npm run build; echo "build=$?"; npx vitest run tests/tools/blendModes.test.ts > /tmp/claude-501/blend5.log 2>&1; echo "exit=$?"; grep -E "passed|failed|×|→|\[blend\]" /tmp/claude-501/blend5.log | head -30`
Expected: 全件 PASS（WebGPU と WebGL）。**落ちたら `superpowers:systematic-debugging`**。見るもの: 登録されていない（どのモードも通常描画: 実測値が「前景がそのまま」）、WebGL でバックバッファが無効、`filters` の連結の順序、フィルタ付きの層で最後の 1 枚だけ混ざる。許容 `TOLERANCE` を緩めるのは、**測った最大差と理由を台帳に書いたうえで**だけ。1 回目から全部通ったときは、`ADVANCED_BLEND_MODES` の 1 つを `blendModes.ts` の式から一時的に壊して（例: `darken` を `max` にする）落ちることを確かめてから戻す（変異確認、台帳に書く。**変異のあとは `npm run build` をやり直す**）。

- [ ] **Step 6: 領域を足してコミット**

`scripts/test-changed.mjs` に: `{ name: 'blend modes', paths: ['src/core/blend.ts', 'src/filters/blendModes.ts', 'src/space/Layer3D.ts', 'examples/_checks/blend-modes.html', 'tests/support/blendReference.ts'], tests: ['tests/tools/blendModes.test.ts'] },`

```bash
npx vitest run tests/tools/testChanged.test.ts tests/tools/blendReference.test.ts; echo "exit=$?"
git add tests/support/blendReference.ts tests/tools/blendReference.test.ts examples/_checks/blend-modes.html tests/tools/blendModes.test.ts scripts/test-changed.mjs
git commit -m "test: the 14 advanced blends against the W3C reference on a real browser (WebGPU and WebGL), with filters, threeD, depth of field and every seek order

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `maskInverted` と併用するブレンドモード（既存の不具合）

**Files:**
- Modify: `tests/tools/blendModes.test.ts`（追記）、原因しだいで `src/sequences/Composition.ts` / `src/core/blend.ts`
- Test: 同上

**Interfaces:**
- Consumes: Task 5 のページ
- Produces: （直した場合）マスク付きの層でブレンドが期待どおり。（直せない場合）`blendMode` と `maskInverted` の併用は、作るときに警告して `blendMode` を無視する。

- [ ] **Step 1: 失敗するテストを書く（再現）** — `tests/tools/blendModes.test.ts` の describe に追記

```ts
  it('maskInverted with a blendMode: the layer blends where it shows and leaves the backdrop alone in the hole (basic and advanced)', async () => {
    await withPage(async (cdp) => {
      const hole = { type: 'shape', shape: 'circle', radius: 15, initial: { x: 80, y: 45, fillColor: '#ffffff' } };
      for (const mode of ['multiply', 'overlay']) {
        const comp = { sequences: [
          { type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#b0703a' } },
          { type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, blendMode: mode, mask: hole, maskInverted: true, initial: { x: 0, y: 0, fillColor: '#3dd6c8' } },
        ] };
        await cdp.eval(`mk(${JSON.stringify({ composition: comp })})`);
        const url = await cdp.eval('snap(0)');
        const outside: number[] = await cdp.eval(`px(${JSON.stringify(url)}, 10, 10)`);      // the layer shows here: blended
        const inside: number[] = await cdp.eval(`px(${JSON.stringify(url)}, 80, 45)`);       // the hole: the backdrop
        const want = mode === 'multiply'
          ? hexToRgb('#b0703a').map((b, k) => b * hexToRgb('#3dd6c8')[k]! * 255)
          : blendPixel('overlay', hexToRgb('#b0703a'), 1, hexToRgb('#3dd6c8'), 1).slice(0, 3);
        for (let k = 0; k < 3; k++) {
          expect(Math.abs(outside[k]! - want[k]!), `${mode}: outside the hole, channel ${k}: got ${outside}`).toBeLessThanOrEqual(TOLERANCE);
          expect(Math.abs(inside[k]! - hexToRgb('#b0703a')[k]! * 255), `${mode}: in the hole, channel ${k}: got ${inside}`).toBeLessThanOrEqual(TOLERANCE);
        }
      }
    });
  });
```
Run: `npx vitest run tests/tools/blendModes.test.ts -t "maskInverted"; echo "exit=$?"`
Expected: FAIL（既存の不具合の再現。**何が違うか（全面が黒か、混ざらないか、穴にも出るか）を記録する**）

- [ ] **Step 2: 原因を調べる**（`superpowers:systematic-debugging`）

手がかり: `src/sequences/Composition.ts` の `maskInverted` の処理（`AlphaMask` を `addEffect` し、`t.setMask?.({ mask: undefined as never, inverse })` で「alpha パイプは `inverse` をマスクされる側のマスクオプションから読む」）。Pixi の `AlphaMaskPipe` は、マスク付きの要素を**フィルタ相当の別パス**に描き、その結果を戻す。`BlendModePipe` の `pushBlendMode` / 高度なモードのフィルタと、`AlphaMaskPipe` の順序・スタックの扱い、基本の `multiply` が壊れる理由（ブレンドが「マスクの別パスの中」で背景（透明）に対して適用される）を、Pixi の `lib/rendering/mask/alpha/AlphaMaskPipe.mjs` と `BlendModePipe.mjs` を読んで特定する。**時間の枠を 1 時間とする。**

- [ ] **Step 3: 直す（原因が分かり、小さく直せるとき）／警告にする（そうでないとき）**

(a) 直せる場合: 最小の修正と、Step 1 のテストが PASS することを記録する（修正の中身は原因しだい。例: ブレンドを、マスクをかけたあとの層ではなく、マスクを含む外側のコンテナへ移す、など）。
(b) 直せない場合: `src/sequences/Composition.ts` の、マスクを組み立てる箇所（`const maskSpec = …` の直後）に次を足す。`blendMode` が基本・高度どちらでも `normal` 以外で、`maskInverted` が真のとき:
```ts
      if (maskSpec && (child.spec as { maskInverted?: boolean }).maskInverted && child.spec.blendMode && child.spec.blendMode !== 'normal') {
        console.warn(`pixi-effects: ${describeLayer(child.spec)}: blendMode "${child.spec.blendMode}" cannot be used together with maskInverted (the blend is lost); the layer is drawn normal. Draw the hole as the mask layer's own shape instead of inverting it`);
        child.spec = { ...child.spec, blendMode: undefined } as typeof child.spec;     // applyBlendMode below then does nothing
      }
```
（`child.spec` が readonly なら、`applyBlendMode` を呼ぶ直前に条件で分岐してスキップする形にする: `if (!skipBlend) applyBlendMode(...)`。）そのとき Step 1 のテストは、警告が出て通常描画になる期待に書き換える: 穴の外側は**背景が見えず前景そのまま**（`#3dd6c8`）、穴の中は背景、警告が 1 回、とする。

- [ ] **Step 4: 通るのを確かめる**

Run: `npm run build; npx vitest run tests/tools/blendModes.test.ts tests/sequences tests/space; echo "exit=$?"`
Expected: PASS、exit=0

- [ ] **Step 5: コミット**

```bash
git add tests/tools/blendModes.test.ts src/sequences/Composition.ts src/core/blend.ts
git commit -m "fix: blendMode with maskInverted (fixed / warned, see the ledger)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
（実際に変えたファイルだけを `git add` する。）

---

### Task 7: 同時に出る高度なモードの層が多いときの警告

**Files:**
- Modify: `src/core/blend.ts`（`maxConcurrentAdvanced`、`MANY_ADVANCED`）、`src/sequences/Composition.ts`（ビルドで 1 回）
- Test: `tests/core/blend.test.ts`（追記）、`tests/sequences/BlendMode.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `isAdvancedBlend`
- Produces: `export const MANY_ADVANCED = 10`、`export function maxConcurrentAdvanced(layers: ReadonlyArray<{ at?: number; duration?: number; blendMode?: unknown }>, span: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/blend.test.ts` に追記（import に `maxConcurrentAdvanced, MANY_ADVANCED` を足す）:
```ts
describe('maxConcurrentAdvanced', () => {
  const L = (at: number, duration: number | undefined, blendMode: unknown = 'overlay') => ({ at, duration, blendMode });
  it('counts the most layers with an advanced mode that are on screen at one instant (from their at and duration, not the order they were visited)', () => {
    expect(MANY_ADVANCED).toBe(10);
    expect(maxConcurrentAdvanced(Array.from({ length: 12 }, () => L(0, undefined)), 10)).toBe(12);
    expect(maxConcurrentAdvanced(Array.from({ length: 24 }, (_, i) => L(i, 1)), 24)).toBe(1);         // slides one after another
    expect(maxConcurrentAdvanced([L(0, 5), L(2, 5), L(4, 5)], 10)).toBe(3);                            // 4–5 s: all three
    expect(maxConcurrentAdvanced([L(0, 2), L(2, 2)], 10)).toBe(1);                                     // [0, 2) and [2, 4) do not overlap
  });
  it('does not count the basic modes, normal, or layers with no mode; a layer with no duration lasts to the end of the composition', () => {
    expect(maxConcurrentAdvanced([L(0, 5, 'add'), L(0, 5, 'normal'), L(0, 5, undefined), L(0, 5, 'multiply')], 10)).toBe(0);
    expect(maxConcurrentAdvanced([L(8, undefined), L(9, undefined)], 10)).toBe(2);
    expect(maxConcurrentAdvanced([], 10)).toBe(0);
  });
});
```
`tests/sequences/BlendMode.test.ts` に追記:
```ts
describe('many advanced blends at once', () => {
  it('warns once when 10 or more layers with an advanced mode are on screen together, and not for a slideshow of them', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pile = Array.from({ length: 12 }, () => ({ type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay' }));
    await build(pile);
    const said = warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('advanced blendMode'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/12 layers/);
    warn.mockClear();
    const slides = Array.from({ length: 12 }, (_, i) => ({ type: 'shape', shape: 'circle', radius: 10, blendMode: 'overlay', at: i * 0.5, duration: 0.5 }));
    await build(slides);
    expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('advanced blendMode'))).toEqual([]);
  });
});
```

- [ ] **Step 2: 落ちるのを確かめる**

Run: `npx vitest run tests/core/blend.test.ts tests/sequences/BlendMode.test.ts; echo "exit=$?"`
Expected: FAIL（`maxConcurrentAdvanced` が無い）、exit=1

- [ ] **Step 3: 実装する**

`src/core/blend.ts` に追加:
```ts
/** This many layers with an advanced blend on screen at once is slow: each is a full-frame pass (measured on WebGL: about 1.5–2 ms each at 1080p). */
export const MANY_ADVANCED = 10;

/** The most layers with an advanced mode on screen at one instant, from their `at` and `duration` (a layer with no duration lasts to the end). */
export function maxConcurrentAdvanced(layers: ReadonlyArray<{ at?: number; duration?: number; blendMode?: unknown }>, span: number): number {
  const events: Array<[number, number]> = [];
  for (const l of layers) {
    if (!isAdvancedBlend(l.blendMode)) continue;
    const start = Math.max(0, l.at ?? 0);
    const end = l.duration === undefined ? span : start + l.duration;
    if (end > start) events.push([start, 1], [end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);                  // at one instant, the layers that end go before the ones that start
  let now = 0, most = 0;
  for (const [, d] of events) { now += d; most = Math.max(most, now); }
  return most;
}
```
`src/sequences/Composition.ts`: import に `maxConcurrentAdvanced, MANY_ADVANCED` を足し、`build()` の lint ループ（`for (const message of summarizeWarnings(lateKeyframes)) …` の直後）に:
```ts
    const crowd = maxConcurrentAdvanced((this.spec.sequences ?? []) as Array<{ at?: number; duration?: number; blendMode?: unknown }>, span);
    if (crowd >= MANY_ADVANCED) {
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${crowd} layers with an advanced blendMode are on screen at once; each is a full-frame pass (about 2 ms on WebGL). Put fewer layers in the blend (or draw the glow as one layer), or use add / screen / multiply`);
    }
```

- [ ] **Step 4: 通るのを確かめる**

Run: `npx vitest run tests/core tests/sequences tests/space; echo "exit=$?"; npx tsc --noEmit; echo "tsc=$?"`
Expected: PASS、exit=0、tsc=0

- [ ] **Step 5: コミット**

```bash
git add src/core/blend.ts src/sequences/Composition.ts tests/core/blend.test.ts tests/sequences/BlendMode.test.ts
git commit -m "feat: warn once when 10 or more advanced blends are on screen together

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 文書

**Files:**
- Modify: `docs/dsl.md`（`#### blendMode`）、`ai/reference/cheatsheet.md`（43 行付近）、`ai/reference/recipes.md`、`ai/reference/pitfalls.md`、`ai/SKILL.md`（39 行付近）、`site/guide/images-video.md`（70 行付近）、`CHANGELOG.md`（`## Unreleased`）、`llms-full.txt`（生成）
- Test: 既存の `tests/docs/*`

**Interfaces:** なし（文書）。

- [ ] **Step 1: `docs/dsl.md`** — `#### \`blendMode\`` の節を、18 種の表と例に置き換える（1 節。既存の `add` の例は残す）

内容（実際の測定値は Task 5 のログ `[blend] … worst channel difference` を、**測った値で**書く。値が分からないうちは書かない）:
- `'normal'`（既定）と、基本 4 種（`add` `screen` `multiply`、Pixi が描く）と、高度な 14 種の表: 名前 / 一言（`overlay` = 背景が暗いところは暗く、明るいところは明るく、コントラストが上がる、`soft-light` = やわらかい `overlay`（色かぶり、ビネット）、`hard-light`、`color-dodge`（強い光源、白飛び）、`color-burn`（深い影）、`darken` / `lighten`、`difference`（反転・位置合わせ）、`exclusion`、`linear-burn`（After Effects と Photoshop の名前で、CSS にはない）、`hue` / `saturation` / `color` / `luminosity`（色相・彩度・色・明るさだけを背景に重ねる））。
- 規則 6 つ（設計メモ 3.1 の 1〜6）を 1 行ずつ。
- 例 2 つ（`soft-light` のグラデーションの色かぶり、`color-dodge` の光源）。**例は `fillGradient` をレイヤーの最上位に書く**（`initial` には書かない）。
- 「普通の合成層に付けると子が別々に混ざる。まとめて 1 枚として混ぜたいときは `threeD: true` かフィルタを付ける」。
- 「`maskInverted` との併用」: Task 6 の結果（直した、または警告して無視）を 1 行。
- コスト: WebGL で高度なモード 1 層 1.5〜2 ms（試作の測定）、10 枚以上が同時に出ると警告。WebGPU は軽い。
- 「GPU が違うと 2/255 程度ずれる（同じ環境ではバイト一致）」。

- [ ] **Step 2: AI 向けの文書**
  - `ai/reference/cheatsheet.md` の `blendMode:` の行（43 行）を `blendMode: 'normal' | 'add' | 'screen' | 'multiply' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'linear-burn'` にし、コメントに「CSS の mix-blend-mode の名前。添えるのは層の上下順で、その下のもの全体と混ざる。composition に付けると子が別々に混ざる（まとめるなら threeD / filters）。高度なモードは WebGL で 1 層 約 2 ms」を足す。
  - `ai/reference/recipes.md`: 「## Light leaks and colour casts (blend modes)」を、既存の glow のレシピの近く（`## A hand-held shake…` の前後）に足す。本体は `// @recipe light-leak` の js ブロック（`Recipes.test.ts` がビルドして lint する。**アセットを使わず**図形とグラデーションだけ: 暗い背景、`soft-light` の色かぶりのグラデーション、`color-dodge` の光源、`multiply` のビネット）。
  - `ai/reference/pitfalls.md`: 78〜80 を足す（`pitfalls` の最後の番号の次）。78「`blendMode` は層の上下順: その層の**下**にあるもの全部と混ざる。混ぜたい背景を、その層より前（配列で先）に置く」。79「普通の `composition` に高度な（も基本も）`blendMode` を付けても、子が別々に混ざる。まとめて 1 枚として混ぜたいなら `threeD: true` かフィルタを付ける」。80「高度なモードは重い（WebGL で 1 層 約 2 ms）。10 枚以上が同時に出ると警告する。光のにじみは 1 層で描く。名前は CSS と同じハイフンつき（`soft-light`、`softLight` ではない）」。
  - `ai/SKILL.md` 39 行の「Blend modes:」を、18 種（CSS の名前）、「`soft-light` などは背景全体と混ざる」、「普通の composition に付けると子が別々に混ざる」、に更新する。
  - `site/guide/images-video.md` 70 行付近の段落を、18 種と、`soft-light` / `color-dodge` / `multiply` の使いどころの 1 段落に更新する（人向けの言葉で、レシピ `light-leak` への言及つき）。

- [ ] **Step 3: CHANGELOG** — `## Unreleased` の `**Added**` に追加（`## Unreleased` の最初の節として。既に `**Fixed**` / `**Changed**` があるときは、`**Added**` を先頭に作る）

```
- **Blend modes: 18, the CSS names.** `blendMode` takes `overlay`, `soft-light`, `hard-light`, `color-dodge`, `color-burn`, `darken`, `lighten`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` and `linear-burn` besides `normal`, `add`, `screen` and `multiply`. They are our own blend filters, checked against the W3C formulas on WebGPU and WebGL (within 2/255), loaded only by a movie that uses one (nothing changes for the others), and they work on a layer with filters, on a `threeD` layer (after the depth-of-field blur) and on a composition. A typo (`softlight`, `soft_light`) says what was meant; 10 or more on screen at once warns (about 2 ms each on WebGL).
```
（Task 6 の結果の 1 行も書く: `maskInverted` との併用を直した、または警告して通常描画にする、のどちらか。）

- [ ] **Step 4: 生成物とテスト**

```bash
npm run build:ai; echo "ai=$?"
npm run site:sync -- --check; echo "sync=$?"
npx vitest run tests/docs tests/core tests/sequences tests/space; echo "exit=$?"
npx vitest run tests/tools/noFalseWarnings.test.ts; echo "nfw=$?"
```
Expected: すべて exit=0。`noFalseWarnings`（Chrome を使う）は、ギャラリー全作品・番号つきの例が**新しい警告を出さない**ことの確認で、ここで 1 回だけ走らせる。

- [ ] **Step 5: コミット**（変えたファイルを 1 つずつ明示）

```bash
git status --short
git add docs/dsl.md ai/reference/cheatsheet.md ai/reference/recipes.md ai/reference/pitfalls.md ai/SKILL.md site/guide/images-video.md CHANGELOG.md llms-full.txt
git commit -m "docs: blend modes (18 CSS names): dsl, cheatsheet, recipe light-leak, pitfalls 78-80, guide, changelog

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: プレイグラウンドの例とギャラリーの見せ場

**Files:**
- Create: `examples/playground/presets/17-blend-modes.js`、`examples/gallery/<id>.html`、`examples/gallery/_notes/<id>.md`、`examples/gallery/posters/<id>.jpg`
- Modify: `examples/playground/presets/index.js`、`tests/playground/presets.test.ts`、`tests/tools/playground.test.ts`（数と題名）、ギャラリーの登録（`pieces.json`、`posters/manifest.json`、`MODELS.md`、作品数が書かれた箇所）

**Interfaces:** なし。

- [ ] **Step 1: プレイグラウンドの例 17**

`examples/playground/presets/16-depth-of-field.js` の書式（`export default \`…\`` の中に `W, H, FPS, DURATION, BACKGROUND, sequences, POSTER`）に合わせて `17-blend-modes.js` を作る。内容: 暗い街の背景（図形で）に、`soft-light` の色かぶりのグラデーションを 1 秒かけて橙 → 青にゆっくり変え、`color-dodge` の光源（円）が右から左へ流れ、`multiply` のビネットを重ねる。長さ 6 秒。`index.js` に `import blendModes from './17-blend-modes.js';` と `{ id: '17-blend-modes', label: '17 · blend modes: light and colour', code: blendModes }` を足し、`tests/playground/presets.test.ts` の一覧と題名（`plus time remap and depth of field` → `plus time remap, depth of field and blend modes`）、`tests/tools/playground.test.ts` の `s.presets).toBe(14)` → `15` と題名（`fourteen` → `fifteen`）を直す。

Run: `npx vitest run tests/playground; echo "exit=$?"; npx vitest run tests/tools/playground.test.ts; echo "exit=$?"`
Expected: PASS（後者は Chrome を 1 つ使い、15 個のプリセットが警告なしで走る）

- [ ] **Step 2: ギャラリー作品を、新しい文脈の作者に作らせる**（プロジェクトの方式: `examples/gallery/BRIEF.md` と文書だけで作り、つまずきメモを書く。私は作品を書かず、登録だけ行う。理由は 0.21 の台帳の Ruling と同じ: 作者の文書の読み方が、新しい文書への実地テストになる）

サブエージェント（`general-purpose`、`model: "sonnet"`）に渡す指示（0.21 の `rack-focus` のときと同じ形）:
- `examples/gallery/BRIEF.md` を最初に読み、そのとおりにする。文書は `ai/SKILL.md`、`ai/reference/*`、`docs/dsl.md`。**この作品は、新しい blendMode の文書の実地テストでもある**ので、足りなかったことを正直にメモに書く。
- 作品 id: `light-leaks`、作る物: `examples/gallery/light-leaks.html` と `examples/gallery/_notes/light-leaks.md` だけ。ポスター・`pieces.json`・`MODELS.md`・数・README は触らない。git / npm を使わない。Chrome は同時に 1 つ。
- この機械での BRIEF.md からの変更: `agent-browser` とポート 5190 は使わず、`node ai/tools/check.mjs examples/gallery/light-leaks.html --out /private/tmp/claude-501/light-leaks-check`（反復中は `--no-export --at <秒>`、最後に 1 回だけ全部）で確かめ、出力の PNG を開いて**見る**。`--help` が使える。`--at` は被写界深度の層のぼけ量も出す。importmap は BRIEF のとおりローカルの `dist` を指す。`piece-meta` の `"model": "sonnet"`。`poster:` を movie.init に付ける。`Model:` の行は `sonnet (Claude Sonnet 5.5, self-reported)`。
- 企画（設計してから作る）: 「Light leaks」 — 1280×720、30 fps、6〜8 秒。夕景の街の絵（図形とグラデーションだけ。外部の画像なし）に、`soft-light` の色かぶり（橙 → 青）、`color-dodge` の光漏れ（円とグラデーションの帯がゆっくり横切る）、`overlay` のコントラスト、`multiply` のビネットを重ねる。色かぶりの段階的な変化で物語（昼 → 夕 → 夜）を作る。小さなタイトルを `luminosity` か `difference` で重ねてもよい。高度なモードの層は 10 枚未満にし、光の帯は 1 層のグラデーションで描く。文字は外側 5% を避ける。効果音は短い `sfx` のみ。
- 終わりに: 作ったもの、`check` の結果（警告なし、書き出しのサイズ）、見た絵の評価、つまずきメモの場所。

- [ ] **Step 3: 作品を確かめる**

作者の報告を**そのまま信じず**、`/private/tmp/claude-501/light-leaks-check/sheet.png`（`Read` で開く）を自分で見る: 時間ごとに色かぶりが変わっているか、光漏れが読めるか、文字が潰れていないか、警告がないか。直しが要るなら、作者に `SendMessage` で具体的に依頼する（1 回まで）。

- [ ] **Step 4: 登録と数の更新**

```bash
node scripts/make-posters.mjs --only light-leaks
```
`MODELS.md` に行を足し（`| sonnet | Light leaks — … | 1280×720 | light-leaks.html |`）、作品数の行（`Counts: fable 13, opus 13, sonnet 17, haiku 3 (46 pieces).` → sonnet 18、47）と、数が書かれた `index.html`（`46 pieces` と `sonnet 17` の 2 か所）、`README.md`（`46 portfolio pieces`）、`site/landing/FACTS.md`（`46 complete pieces`、`sonnet 17`）、`site/landing/NOTES.md`（`of the 46 posters`、`covers all 46`）を更新し、`MODELS.md` の末尾に `light-leaks` の 1 段落（作った日、使った文書の版、モデル名は作者の自己申告）を足す。`npm run build:gallery` で `pieces.json` を作る。CHANGELOG の `## Unreleased` に、ギャラリー作品と Playground の例 17 の 1 項目を足す。

Run: `npm run build:ai; npm run site:sync -- --check; npx vitest run tests/docs tests/tools/gallery.test.ts tests/tools/landing.test.ts; echo "exit=$?"`
Expected: PASS、exit=0

- [ ] **Step 5: コミット**（変えたファイルを 1 つずつ。`git status --short` で確かめる）

```bash
git add examples/playground/presets/17-blend-modes.js examples/playground/presets/index.js tests/playground/presets.test.ts tests/tools/playground.test.ts examples/gallery/light-leaks.html examples/gallery/_notes/light-leaks.md examples/gallery/posters/light-leaks.jpg examples/gallery/posters/manifest.json examples/gallery/pieces.json examples/gallery/MODELS.md index.html README.md site/landing/FACTS.md site/landing/NOTES.md CHANGELOG.md llms-full.txt
git commit -m "feat: playground preset 17 and a gallery piece for the blend modes (light-leaks)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 全体の確認と最終レビュー

**Files:** なし（確認と台帳）

- [ ] **Step 1: 変えたものに応じたテスト、そして速い層**

```bash
npm run build; echo "build=$?"
npx tsc --noEmit; echo "tsc=$?"
npm run test:fast; echo "fast=$?"
npx vitest run tests/tools/blendModes.test.ts tests/tools/depthOfField.test.ts tests/tools/cardSeek.test.ts tests/tools/parent.test.ts tests/tools/maskBugs.test.ts; echo "browser=$?"
```
Expected: すべて exit=0。`maskBugs`（マスクの既存の不具合のテスト）が Task 6 の修正で影響を受けていないことをここで確かめる。落ちたものは名前と原因を記録して直す。**`release:check` は走らせない**。

- [ ] **Step 2: 最終レビュー**（skills `executing-plans` の「Final Review」に従う）

`review-package` を作り、「fable」の新しい文脈のレビュアー（サブエージェント）に渡す。計画の Review Focus（上の 5 つ）、仕様書、台帳の `Ruling:` を渡す。読み取り専用、Chrome は起動しない。Critical / Important は 1 回の修正でテスト付きで直す。Minor は台帳と最終報告の「Deferred minors」に書く。

- [ ] **Step 3: 最終報告**

オーナーへ（日本語）: 何が入ったか、測った数字（Task 5 のログの最大差、WebGPU と WebGL、コスト）、`maskInverted` の結果（直した／警告にした）、ギャラリーのコンタクトシートの場所、`Ruling:` の一覧、Deferred minors、**push していないこと**（`## Unreleased`、リリースの合図待ち）。メモリ（`project_state-0-22.md` と `MEMORY.md`）を更新する。

Finish: `superpowers:finishing-a-development-branch`（この計画は `main` 上でローカルにコミットするだけ。push の選択肢は、オーナーの合図まで出さない）。
