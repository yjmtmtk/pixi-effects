# 0.19.0「動きと色」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スプリングの ease、`fillGradient` のアニメーション（図形・文字）、grain（粒状ノイズのフィルター）、未知のキー・不正な値への警告を、1 つの版（0.19.0）に入れる。

**Architecture:** 4 つとも既存の層・フィルターの内側で完結し、互いに独立（順序は 1→2→3→4）。実験（スパイク）で書いた試作を、`docs/superpowers/plans/2026-10-08-expressiveness-0.19-spikes/` に**そのまま写してある**。各タスクは、その試作を出発点にして、設計メモで決めた変更を加えて本番にする。試作は使い捨てだったので、**テストを先に書いて失敗を見てから**、試作を写す。

**Tech Stack:** TypeScript、PixiJS v8（WebGPU 優先、WebGL 代替）、GSAP 3、vitest（単体はノード／jsdom、実ブラウザは `ai/tools/check.mjs` の `serve` / `launchChrome` / `Cdp`）。

**Spec:** `docs/superpowers/specs/2026-10-08-expressiveness-0.19-design.md`（承認済み。8 章の決定はすべて推しのとおり）

**試作の置き場（写し元）:** `docs/superpowers/plans/2026-10-08-expressiveness-0.19-spikes/`
`spring.ts`・`spring.test.ts`、`gradientAnim.ts`・`gradient-shape-text.patch`・`gradient-anim.html`、`Grain.ts`・`grain-movie-named.patch`・`grain-flat.html`。パッチは試作時の `main`（0.17 より前）に対するもの: **そのまま当たらないことがある。意味を写す**。

## Global Constraints

- 返信は日本語。コミットはタスクごと。**push も公開もしない**。コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。数字は測ったものだけ。
- 破壊的変更は許される（後方互換の殻は作らない）が、**ギャラリー 39 作品・ガイドの例・レシピ・`examples/` は、新しい警告を 1 つも出さず、ピクセルも変わらない**こと。
- 時間は決定的: 前向き・ジャンプ・後ろ向きのシークで、全フレームが同一（実ブラウザで確かめる）。
- 追加の依存を入れない。
- macOS は大文字小文字を区別しない。`sed -i ''`。zsh は `$VAR` を単語に分けない（複数の引数は変数にまとめない）。ブラウザのテストが読む `dist/` は、ソースを変えたら `npm run build` で作り直す。コミットの前に必ず終了コードを読む（`echo "exit=$?"`、`grep` で隠さない）。
- 文書は生成物を含む: `npm run build:ai`、`npm run site:sync -- --check`、`npx vitest run tests/docs`。
- 警告の書式: `pixi-effects: <where>: <what>` ＋ 何を書けばよいか（did-you-mean は `suggestName`）。**例外にせず警告**（4 章を除き、既存の「throw する入力」は変えない）。
- 版番号・CHANGELOG の見出しは `## Unreleased` のまま。リリース（0.19.0 への bump、`release:check`、`npm publish`、push、tag）は、オーナーの合図を待つ。0.18.1（`animateText` の警告、コミット済み）は別に出すかもしれない。

## Review Focus

- **偽の警告**: 正しい書き方（ギャラリー 39 作品、ガイドの例、レシピ、`examples/`、`ai/template.html`、`ai/chat-template.html` の既定、Playground のプリセット 12 本）が、新しい警告（4 章の `lintKeys`、2 章のグラデーション検査、1 章の ease 検査）を出さないこと → Task 4 のテスト（全部を読み込んで警告数 0）。
- **シークの同一性**: スプリング・グラデーション・grain が、前向き・ジャンプ・後ろ向きで同一のフレームを返すこと（オーバーシュートする値、`from` つきのキーフレーム、`repeat` / `yoyo`、チェーンしたキーフレーム）→ 各タスクの実ブラウザのテスト。
- **スプリングの `duration: 'auto'` の誤用**: spring でない ease に使う、`animateText` / `orbit` の tween に使う、`stagger` の遅れにスプリングを使う（範囲外・負の `at` になる）→ Task 1 のテスト。
- **GPU 資源のリーク**: アニメするグラデーションが、フレームごとに新しい `FillGradient` / Texture を作らないこと（層を壊したとき Texture を捨てる）。grain のフィルターを層ごとに作ったとき、壊すと一覧から外れること → Task 2 / 3 のテスト。
- **grain の決定性と WebGL / WebGPU の一致**: 同じ種・同じ時刻で同じ絵（整数ハッシュ）、シード違いは無相関、`fps` 未満の間は同じ絵、平均輝度がずれない（黒と白は変わらない）→ Task 3 の実ブラウザのテスト。
- **モーションブラーとの相互作用**: 副フレームが grain の時間を 1 つに共有すること、グラデーションとスプリングがブラー下でも落ちないこと → Task 2 / 3 のテスト。

---

## File Structure

- Create: `src/core/spring.ts`（スプリングの式・プリセット・登録・`kfDuration`・`springProblem`）、`src/sequences/gradientAnim.ts`、`src/filters/Grain.ts`、`src/core/layerKeys.ts`（層の種類ごとのキーの表）
- Modify: `src/core/ease.ts`（spring の検査）、`src/core/Timeline.ts` / `src/sequences/{Image,Shape,Text}.ts`（`kfDuration`、グラデーション）、`src/presets/stagger.ts`（0〜1 に切る）、`src/filters/named.ts`、`src/sequences/Base.ts`（時間を受けるフィルターの登録）、`src/core/Movie.ts`（時間を渡す）、`src/core/lint.ts`（`lintKeys`）、`src/sequences/Composition.ts`（`lintKeys` を呼ぶ）、`src/types.ts`
- Create（検査用ページ）: `examples/_checks/{spring,gradient-anim,grain}.html`
- Create（テスト）: `tests/core/{spring,lintKeys}.test.ts`、`tests/sequences/gradientAnim.test.ts`、`tests/filters/grain.test.ts`、`tests/tools/{springSeek,gradientAnim,grain}.test.ts`
- Docs: `ai/reference/{cheatsheet,recipes,pitfalls}.md`、`ai/SKILL.md`、`docs/dsl.md`、`site/guide/{motion,shapes,text,filters,cookbook}.md`、`CHANGELOG.md`、`llms*.txt`（`npm run build:ai`）
- Gallery: 見せ場の作品 2 本（Task 5）

---

### Task 1: スプリングの ease

**Files:**
- Create: `src/core/spring.ts`、`tests/core/spring.test.ts`、`tests/tools/springSeek.test.ts`、`examples/_checks/spring.html`
- Modify: `src/core/ease.ts`、`src/core/Timeline.ts:50`、`src/sequences/Image.ts:57`、`src/sequences/Shape.ts:563`、`src/sequences/Text.ts:199,261`、`src/core/Movie.ts`、`src/presets/_ease.ts`、`src/presets/stagger.ts`、`src/types.ts`（`Keyframe.duration?: number | 'auto'`）

**Interfaces:**
- Produces（`spring.ts`）: `springResponse(t, {mass,stiffness,damping})`、`springDuration(params, tol = 0.005): number`、`springEase(params): (p) => number`、`SPRING_PRESETS`（`gentle` / `snappy` / `bouncy` / `wobbly` / `slow`）、`springProblem(name): string | null`、`parseSpring(name): Required<SpringParams> | null`、`registerSpringEases(): void`（冪等）、`kfDuration(kf): number`（`'auto'` は spring の落ち着く時間、spring でないなら 0.5 s で警告）。
- Consumes: `core/ease.ts` の `checkEase(ease, where)`（0.17）。試作 `spring.ts` が持っていた `checkEase` / `warned` は**写さない**（`ease.ts` が持つ）。

- [ ] **Step 1: テストを書く**

`docs/superpowers/plans/2026-10-08-expressiveness-0.19-spikes/spring.test.ts` を `tests/core/spring.test.ts` に写し（インポートの相対パスを直す）、次を足す:

```ts
import { springProblem, parseSpring, kfDuration, SPRING_PRESETS } from '../../src/core/spring';
import { checkEase, __resetEaseWarnings } from '../../src/core/ease';
import { stagger } from '../../src/presets/stagger';

describe('spring: mistakes are said out loud', () => {
  it('springProblem names what is wrong, or is null for a good spring', () => {
    expect(springProblem('spring')).toBeNull();
    expect(springProblem('spring(1, 170, 12)')).toBeNull();
    expect(springProblem('spring.bouncy')).toBeNull();
    expect(springProblem('spring(1, 170')).toMatch(/expected "spring\(mass, stiffness, damping\)"/);
    expect(springProblem('spring(1,-5,3)')).toMatch(/greater than 0/);
    expect(springProblem('spring.floppy')).toMatch(/no preset "floppy".*gentle/);
  });
  it('checkEase says it once per name, with the spring reason, and is quiet for a good spring', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); __resetEaseWarnings();
    checkEase('spring.bouncy', 'x'); checkEase('spring(1, 170, 12)', 'x');
    expect(warn).not.toHaveBeenCalled();
    checkEase('spring.floppy', 'layer "a"'); checkEase('spring.floppy', 'layer "a"');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/layer "a".*spring\.floppy.*no preset "floppy"/s);
    warn.mockRestore();
  });
  it("duration 'auto' is the time the spring takes to settle; without a spring ease it warns and uses 0.5 s", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(kfDuration({ duration: 'auto', ease: 'spring.bouncy' })).toBeCloseTo(1.08, 1);
    expect(kfDuration({ duration: 2 })).toBe(2);
    expect(kfDuration({})).toBe(0);
    expect(kfDuration({ duration: 'auto', ease: 'power2.out' })).toBe(0.5);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/'auto' needs a spring ease/));
    warn.mockRestore();
  });
  it('the presets settle in the measured time (peak and settle time of the spike: gentle 0.72 s, snappy 0.42 s, bouncy 1.08 s, wobbly 1.61 s, slow 1.29 s)', () => {
    const want: Record<string, number> = { gentle: 0.72, snappy: 0.42, bouncy: 1.08, wobbly: 1.61, slow: 1.29 };
    for (const [n, t] of Object.entries(want)) expect(springDuration(SPRING_PRESETS[n]!), n).toBeCloseTo(t, 1);
  });
  it('stagger keeps its delays inside 0..amount even when the shape ease overshoots (a spring)', () => {
    const d = stagger(8, { each: 0.1, ease: 'spring.wobbly' });
    for (const v of d) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0.7 + 1e-9); }
    expect(d[0]).toBe(0);
  });
});
```
（`springDuration` は `spring.test.ts` の既存の import に含まれる。`stagger` の戻りの形が違うときは、`stagger.ts` を読んで合わせる。）

Run: `npx vitest run tests/core/spring.test.ts`
Expected: FAIL（`src/core/spring` が無い）

- [ ] **Step 2: `spring.ts` を写して整える**

`spikes/spring.ts` → `src/core/spring.ts`。変える点: (a) 末尾の `warned` と `checkEase` を**消す**、(b) ファイルの最後に `registerSpringEases();` を 1 行足す（import しただけで GSAP に登録される。`Movie` も `presets/_ease.ts` も import するので、どの道からでも名前が通る）、(c) `config` の中の警告は**消す**（GSAP が壊れた入力で層ごとに `config` を呼ぶため、同じ警告が繰り返す）。`config` は不正な値なら既定値で作るだけにし、報告は `checkEase` が 1 回だけ行う。

`src/core/ease.ts` の `checkEase` の先頭（`typeof ease !== 'string'` の次）に足す:

```ts
import { springProblem } from './spring';
// …
  if (/^\s*spring/.test(ease)) {                                      // GSAP resolves a registered spring; a malformed one must be said, once
    const problem = springProblem(ease);
    if (!problem || warned.has(ease)) return;
    warned.add(ease);
    console.warn(`pixi-effects: ${where}: unknown ease "${ease}" — ${problem}. GSAP would run it as its default ease, power1.out.`);
    return;
  }
```

- [ ] **Step 3: `kfDuration` を 5 か所に差し込む**

`Timeline.ts:50`、`Image.ts:57`、`Shape.ts:563`、`Text.ts:199`、`Text.ts:261` の `kf.duration ?? 0` を `kfDuration(kf)` に（`import { kfDuration } from '../core/spring'`）。`types.ts` の `Keyframe.duration` を `number | 'auto'` にして、説明を足す。`Movie.ts` と `presets/_ease.ts` に `import '../core/spring'`（登録のため。`registerSpringEases()` の呼び出しは spring.ts の末尾が行う）。`npx tsc --noEmit` で、他に `kf.duration` を数として読む箇所が出たら、同じく `kfDuration` に替える。

`stagger.ts`: 形の ease を通した値を 0〜1 に切る（`shape(p)` の結果に `Math.min(1, Math.max(0, …))`）。先頭は 0、最後は全幅のまま。

Run: `npx vitest run tests/core/spring.test.ts tests/core/ease.test.ts tests/presets; echo "exit=$?"`
Expected: PASS、`exit=0`

- [ ] **Step 4: 実ブラウザで、シークの同一性と、オーバーシュートの実測**

`examples/_checks/spring.html`: 試作の `spring.html`（`.claude/worktrees/agent-a43c779960d439b54/examples/_checks/spring.html`、無ければ次の形で書く）。1280×720、30 fps、4 s。四角（`x` を `spring.bouncy` / `duration: 'auto'` で 150→1050）、円（`scale` を `spring(1, 170, 12)`、`duration: 0.8`）、色（`fillColor` を `spring(1, 120, 8)`、`colorSpace: 'oklab'`）。`window.__ready` を出す。`?bad` で壊れた ease（`spring(1, 170`、`spring.floppy`）を足す。

`tests/tools/springSeek.test.ts`（`tests/tools/playground.test.ts` の `withPlayground` と同じ作り: `check.serve(root)`、`check.launchChrome`、`Cdp`）:
1. 前向きにフレーム 0, 8, 10, 12, 14, 16, 18, 20, 24, 30, 45 の `movie.snapshot(f, { as: 'dataURL' })` を取り、ジャンプ（45, 8, 0, 30, 16, 12, 45）と後ろ向きで取り直した絵が**全部同じ**。
2. 四角の `x` の最大が目標（1050）を超える（オーバーシュート）、最後は目標に落ち着く（`movie.inspect(f)` の層の範囲から読む。試作の実測は 1219 まで行き 1049.5 に落ち着いた）。
3. `?bad` で、`window.__logs` に `spring.floppy` と `spring(1, 170` の警告が**各 1 回**。

Run: `npm run build; npx vitest run tests/tools/springSeek.test.ts; echo "exit=$?"`
Expected: PASS

- [ ] **Step 5: 文書とレシピ**

- `ai/reference/cheatsheet.md` の ease の行: `spring(質量, 剛性, 減衰)`・`spring.gentle|snappy|bouncy|wobbly|slow`・`duration: 'auto'`。**`duration` を数にしたら、`duration` が落ち着く時間になる（形は減衰比だけで決まる）。本物の物理は `'auto'`**。`animateText` / `orbit` の tween は文字列の ease を渡せば使えるが `'auto'` は使えない。`stagger` の ease に spring は使えるが 0〜1 に切られる。
- `ai/reference/pitfalls.md` に 1 項目（番号は末尾の次）: 例の `spring(1,170,26)` は臨界減衰で弾まない（弾ませるなら剛性 170 で減衰 20 未満）。色は OKLab で切られ、alpha は 1 を超えても見えない。プリセット名から選ぶ。
- `ai/reference/recipes.md` に `// @recipe spring-pop`（テストされる形式。既存のレシピの書き方に合わせる）。
- `docs/dsl.md` の `Keyframe`、`site/guide/motion.md`（スプリングの節）、`ai/SKILL.md` に 1 行。
- `CHANGELOG.md` の `## Unreleased` に **Added**: スプリング（測った値: 各プリセットの落ち着く時間とピーク、`ease` の生成 約 5 µs、評価 約 36 ns は試作の実測として書く場合は「試作で」と断る。**本番で測り直した値を書く**）。

Run: `npm run build:ai && npx vitest run tests/docs; echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 6: 全体とコミット**

Run: `npm run test:fast; echo "exit=$?"`（`exit=0`）。ギャラリーとガイドの警告が増えていないことは Task 4 で一括して確かめる。

```bash
git add -A
git commit -m "feat: spring easing (spring(m, k, c), spring.<preset>, duration: 'auto'), a malformed spring is said once, stagger keeps its delays inside the spread

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `fillGradient` のアニメーション（図形・文字）

**Files:**
- Create: `src/sequences/gradientAnim.ts`、`tests/sequences/gradientAnim.test.ts`、`tests/tools/gradientAnim.test.ts`、`examples/_checks/gradient-anim.html`
- Modify: `src/sequences/Shape.ts`、`src/sequences/Text.ts`、`src/types.ts`（キーフレームの `fillGradient`、文字の `fillGradient`）

**Interfaces:**
- Produces（`gradientAnim.ts`）: `GradState`、`gradStateFrom(g: GradientSpec): GradState`、`mergeGrad(base, patch, who): GradState`、`tweenGradient(...)`、`GradientPainter`（`size` 既定 **512**、`paint(g): { texture, textureSpace: 'local' }`、`destroy()`）、`bindGradientKeyframes(...)`、`hasGradientKeys(keyframes): boolean`、**新規** `validateGradientKeyframes(spec: { keyframes?: Keyframe[]; fillGradient?: unknown; initial?: Props }, who: string, warn = console.warn): void`（ビルド時に 1 回）。
- Consumes: `buildColorInterp` / `ColorSpace`（`expr/colorInterp`）、`revertibleSet`、`resolveAt` / `loopVars`、`Task 1` の `kfDuration`（`tweenGradient` が数の `duration` を受け取る前に解く）。

- [ ] **Step 1: テストを書く**（ノード／jsdom。`tests/sequences/gradientAnim.test.ts`）

```ts
// mergeGrad: keys left out stay; a keyframe's stops need the same count; type cannot change
// validateGradientKeyframes (build time, once): 
//   wrong stop count → /same number of stops \(2, got 3\)/
//   typo `angel` → /fillGradient\.angel.*did you mean "angle"/
//   keyframe gradient but no initial gradient → /give it a fillGradient first/
//   `'fillGradient.angle'` or `gradientAngle` in to/from/set → /write fillGradient: \{ angle \}/
//   `fillGradient: 'red'` → /must be an object/
//   a good spec → no warning
```
各行を `it` にして、期待する警告の文面を正規表現で固定する（上のコメントのとおり）。警告は**ビルド時に 1 回**: `validateGradientKeyframes` を 3 回呼んでも、層ごとに 1 回ずつ（呼び出し側が 1 回しか呼ばないことは Step 3 のテストで見る）。`tweenGradient` の `onStart` の中で警告が出ないこと（`mergeGrad` に警告の関数を渡さず、検査を前もって済ませる形にする）。

さらに `tweenGradient` の途中の値: 線形の角度（0→360 の半分で 180）、`colorSpace: 'oklch'` と `'rgb'` で、2 色の中間の色が違うこと。数値の色（`0xff0000`）を `fillColor` と stops に渡したときの補間（rgb）が、CSS 文字列と同じ結果になること（**試作が未検証と言った点: まず `fillColor` の補間で実際に壊れるか確かめ、壊れるなら `fillColor` の側も直す。直した場合は `Task 2: Ruling` に書く**）。

Run: `npx vitest run tests/sequences/gradientAnim.test.ts`
Expected: FAIL

- [ ] **Step 2: `gradientAnim.ts` を写して整える**

`spikes/gradientAnim.ts` → `src/sequences/gradientAnim.ts`。変える点:
1. `__naive` の分岐（SPIKE ONLY）を**消す**。
2. `GradientPainter` の既定を 512。`destroy()` を足す（Texture と canvas を捨てる）。
3. `mergeGrad` の警告をやめ、`validateGradientKeyframes` が同じ文面で**ビルド時に 1 回**出す。AI が推測する名前（キーが `gradient` で始まる、`fillGradient.` で始まる）には、「`fillGradient: { angle }` と書く」を出す。キーの typo は `suggestName`（`options.ts`）で did-you-mean。
4. `tweenGradient` / `bindGradientKeyframes` が `kf.duration` を直接読む所は `kfDuration(kf)`。

- [ ] **Step 3: `Shape.ts` / `Text.ts` / `types.ts` に結ぶ**

`spikes/gradient-shape-text.patch` の意味を写す（行番号は変わっている）:
- `Shape.ts`: `LiveKey` に `'fillGradient'`。`build` で、キーフレームが `fillGradient` を含む（`hasGradientKeys`）ときだけ `GradientPainter` と live の `GradState` を作る。含まないときは今の静的な道のまま（Step 6 で統一を判断する）。`_redraw` はグラデーションが変わったときだけ描き直す。`bindTimeline` が `bindGradientKeyframes` を呼ぶ。汎用の live キーのループは `fillGradient` を飛ばす。**`validateGradientKeyframes(this.spec, describeLayer(this.spec))` を `build` で 1 回だけ呼ぶ。層を壊すとき（`destroy`）に `painter.destroy()`**。
- `Text.ts`: 変わるたびに `style.fill` を新しい `FillGradient` にし、古いものを捨てる（約 12 行）。同じく `build` で 1 回の検査、`destroy` で後始末。
- `types.ts`: `TextSequenceSpec` に `fillGradient?: GradientSpec`、キーフレームの `set` / `from` / `to` が `fillGradient` の部分オブジェクトを受けること（`Props` が数か文字列だけなので、`KeyframeProps = Props & { fillGradient?: Partial<GradientSpec> }` のように足す。`npx tsc --noEmit` が通るまで）。

Run: `npx vitest run tests/sequences tests/space; echo "exit=$?"`（既存の図形・文字のテストが全部通る）、`npx vitest run tests/sequences/gradientAnim.test.ts`
Expected: PASS

- [ ] **Step 4: 実ブラウザの検査**

`examples/_checks/gradient-anim.html`: 試作（`spikes/gradient-anim.html`）を写す。モード `demo`（角度の回転＋色のクロスフェード、放射状の中心移動と半径、文字）、`bad`（上の警告の各種）、`many`（50 図形）、`static`（キーフレームなしの静的）、`color`（rgb と oklch の比較）、`texts`。`tests/tools/gradientAnim.test.ts`:
1. `demo`: フレーム 0, 15, 30, 45, 60 を前向き → ジャンプ（60, 45, 0, 30, 15, 45, 60, 0, 30, 15, 45）→ 後ろ向きに取り、**全部同じ**（図形・文字とも）。
2. `bad`: `__logs` に Step 1 の各警告が**各 1 回**、シークを繰り返しても増えない。
3. `color`: 同じ 2 色の途中（フレーム 30）で、rgb は灰緑、oklch は鮮やか（中間の画素の彩度 `max(r,g,b)−min(r,g,b)` が oklch のほうが大きい）。
4. リーク: `many` を 20 回シークしても、`document` の canvas の数と、Pixi の Texture の数（`PIXI.Cache` ではなく `movie.app.renderer.texture` から読める数。読めなければ `GradientPainter` のインスタンス数を `window.__gradientPainters` で数える）が増えない。
5. モーションブラー（`motionBlur: true`）の下でも、前向きとジャンプが同じ。

Run: `npm run build; npx vitest run tests/tools/gradientAnim.test.ts; echo "exit=$?"`
Expected: PASS

- [ ] **Step 5: 速さを測る**

試作の表（1080p・ソフトウェア GL・50 図形: 色の基準 約 1.5 ms、静的グラデーション 約 1.6 ms、アニメ 約 9 ms、素朴な方法 約 19 ms）を、`many` で測り直す（同じ条件）。実 GPU の値は別に測る（headless Chrome は実 GPU を使う）。測った値を `CHANGELOG` に書く。

- [ ] **Step 6: 静的な道との統一を判断する**

静的な `fillGradient`（キーフレームなし）を使うギャラリー・例（`grep -ln fillGradient examples/gallery/*.html examples/*.html`）の、ポスターのフレームと 2 つの別フレームを、統一の前後で比べる（`movie.snapshot` の dataURL を画素で比べる。許容は各チャンネル 2/255、差の画素が全体の 0.1% 以下）。**同じなら 1 本の道（canvas）にまとめる。違うなら 2 本のまま残し、`Task 2: Ruling` に書く**。どちらにしても、ギャラリーのピクセルは変えない。

- [ ] **Step 7: 文書と、全体とコミット**

`ai/reference/cheatsheet.md`（`fillGradient` のキーフレーム、`colorSpace: 'oklch'` を勧める、ストップの個数は変えられない、`type` は変えられない、マスク下のグラデーションは切る前の図形全体に広がる）、`site/guide/shapes.md` と `text.md`、`docs/dsl.md`、レシピ `// @recipe gradient-shift`、CHANGELOG の Added。

Run: `npm run build:ai && npm run test:fast && npx vitest run tests/tools/gradientAnim.test.ts; echo "exit=$?"`

```bash
git add -A
git commit -m "feat: fillGradient can be animated (a partial gradient in set / from / to, stop colours through colorSpace), on shapes and text, checked once at build

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: grain（粒状ノイズのフィルター）

**Files:**
- Create: `src/filters/Grain.ts`、`tests/filters/grain.test.ts`、`tests/tools/grain.test.ts`、`examples/_checks/grain.html`
- Modify: `src/filters/named.ts`、`src/types.ts`（`NamedFilterType` に `'grain'`）、`src/sequences/Base.ts`（`buildFilters`）、`src/core/Movie.ts`（`_renderNow`）

**Interfaces:**
- Produces（`Grain.ts`）: `class GrainFilter extends Filter`（オプション `amount` 0.08、`size` 1.5、`seed` 0、`fps` 24、`color` 0。プロパティの getter / setter でキーフレーム `filters.<name>.amount` が通る。`setTime(t: number): void`）、純関数 `hash32(x, y, frame, seed): number`（0〜1 の値を返す。ノードの単体テスト用）。
- Produces（`Base.ts`）: `Sequence.timeFilters: Set<{ setTime(t: number): void }>` は**ルートの層が持つ**。`buildFilters` が、`setTime` を持つフィルターを `this.root`（`scope()` が使うのと同じ）の `timeFilters` に足し、`destroy` で外す。`Movie._renderNow` が `this._rootSequence.timeFilters` に `setTime(this._timeOf(this.currentFrame))` を渡す（試作の「ステージの木を歩く」`_feedTime` は**写さない**）。

- [ ] **Step 1: テストを書く**

ノード（`tests/filters/grain.test.ts`）: `hash32` が (a) 同じ入力で同じ値、(b) `[0, 1)`、(c) 1 万点の平均が 0.5±0.02 と分散が一様分布に近い（1/12±0.005）、(d) `seed` を変えると相関が |r| < 0.05、(e) `frame` が 1 違うと相関 |r| < 0.05。`named.ts` が `{ type: 'grain' }` を作れる。未知のオプション（`amout`）に did-you-mean の警告（`warnUnknownOptions` を使う）。

Run: `npx vitest run tests/filters/grain.test.ts`
Expected: FAIL

- [ ] **Step 2: `Grain.ts` を写して整える**

`spikes/Grain.ts` → `src/filters/Grain.ts`。変える点: 重み付けは**放物線 4L(1−L)**（平方根の重み付けは暗い画面を持ち上げたので捨てる）、整数ハッシュ（`#version 300 es` と、同じ版の頂点シェーダー。Pixi は GLSL を WebGL1 互換でコンパイルするので `uint` が使えない）、WGSL も持つ。`hash32` を JS 側にも同じ式で書いて export（テストと GLSL / WGSL の一致を、Step 4 で実機で確かめる）。`named.ts` に `grain` を足す（`spikes/grain-movie-named.patch` の `named.ts` と `types.ts` の分）。

- [ ] **Step 3: 時間の渡し方（ムービーが持つ一覧）**

`Base.ts`: `timeFilters` をルートの層に持たせ、`buildFilters` で登録する。`Movie.ts` の `_renderNow` で渡す。`Sequence` を壊すとき `timeFilters.delete`。テスト（ノード、`tests/filters/grain.test.ts` に足す）: 層が `setTime` を持つフィルターを持つと、`movie` の描画で `setTime` が呼ばれ、層を壊すと呼ばれない。

Run: `npx vitest run tests/filters tests/sequences; echo "exit=$?"`
Expected: PASS

- [ ] **Step 4: 実ブラウザの測定**

`examples/_checks/grain.html`: 試作（`spikes/grain-flat.html`）を写す。平らな灰色（`#808080`）1080p、`?amount=&size=&seed=&fps=&color=&mode=layer|root&gl`。`tests/tools/grain.test.ts`（`withPage` 形式。WebGPU を既定、`?gl` で WebGL）:
1. **標準偏差**: 中間灰で `amount` 0.08 のとき、加わったノイズの標準偏差が 20.4/255 ±1。`amount` 0.02 で 5.1±0.5。`size` 1, 1.5, 3 で変わらない。平均のずれ |mean| < 0.5/255。
2. **黒と白**: `#000000` と `#ffffff` で絵が変わらない。暗いギャラリー作品（`aurora-logo` のポスター）の平均輝度のずれ < 0.2%。
3. **シーク**: フレーム 10 を、前向き → 90 → 11 → 10 と、119 からのジャンプで取り、全部同じ。
4. **種**: seed 0 と 1 の相関 |r| < 0.05。0 に戻すと同じ絵。
5. **fps**: 30 fps の中の `fps: 24` で、フレーム 10 と 11 が同じ（拍）、11→12 と 12→13 は別の絵で相関 |r| < 0.05。`fps: 0` はずっと同じ。
6. **WebGL と WebGPU**: 同じフレームの差が、全バイトの 0.01% 以下。
7. **キーフレーム**: `filters.g.amount` を 0.02→0.2 に動かすと、標準偏差が単調に増える（3 点で測る）。
8. **ルートに掛ける**（`composition.filters`）と、層に掛ける、の両方が動く。ルートのときだけ全面の中間パスが 1 本増える（`movie` のフィルター一覧を見る）。
9. **モーションブラー**（`motionBlur: true`）の副フレームが、grain の絵を 1 つに共有する（ブラー下の 1 フレームを、副フレーム数 2 と 8 で取り、粒の標準偏差が同じ。1/√N に減らない）。
10. 速さ: 1080p で、基準・grain（モノ）・grain（色）・`noise` を測る（ソフトウェア GL と実 GPU を分けて書く。試作は software GL で +1.0 / +2.5 / +0.55 ms）。

Run: `npm run build; npx vitest run tests/tools/grain.test.ts; echo "exit=$?"`
Expected: PASS（落ちた項目は、`Grain.ts` を直す。しきい値を緩めて通さない。実測と違う前提はレジャーに Ruling として書く）

- [ ] **Step 5: 書き出し（mp4 / webm）と、文書**

`render` で grain 付きの mp4 を作り、ビットレートが増えることを測る（同じ作品で grain あり・なし、サイズを書く）。文書に「粒は H.264 のビットレートを食う。上げる」と書く。`ai/reference/cheatsheet.md`（`grain` のオプションと 1 行の使い方）、`site/guide/filters.md`、`docs/dsl.md`、`noise` の説明に「固定・種なし・黒を持ち上げる。フィルムの粒は `grain`」。レシピ `// @recipe film-grain`。CHANGELOG の Added。

- [ ] **Step 6: 全体とコミット**

Run: `npm run build:ai && npm run test:fast; echo "exit=$?"`

```bash
git add -A
git commit -m "feat: grain, a film-grain filter (seeded, per-frame at its own fps, mid-tone weighted, integer hash: the same picture on any GPU)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 未知のキー・不正な値への警告（`lintKeys`）

**Files:**
- Modify: `src/core/lint.ts`、`src/sequences/Composition.ts:58`（`lintKeys(s)` を `lintTiming` の隣で呼ぶ）、`src/types.ts`（キーの表の網羅チェック）
- Create: `src/core/layerKeys.ts`（層の種類ごとのキーの表）、`tests/core/lintKeys.test.ts`、`tests/docs/NoFalseWarnings.test.ts`

**Interfaces:**
- Produces（`layerKeys.ts`）: **型から外れない作り**にする: 各種類について `const RECT_KEYS = [...] as const satisfies readonly (keyof RectShapeSpec)[];` と、型の網羅チェック `type _Rect = Exclude<keyof RectShapeSpec, (typeof RECT_KEYS)[number]> extends never ? true : never; const _r: _Rect = true;`（キーを足し忘れると `tsc` が落ちる）。`keysFor(spec): readonly string[]`、`STYLE_KEYS`（Pixi の text style で、このライブラリが受け付けるもの）、`PROP_KEYS`（キーフレーム・`initial` の動かせるプロパティ名の全集合。`normalizeProps` / 各層の live キー / `filters.` / `three.` / `value` / `fillGradient` を含む）。
- Produces（`lint.ts`）: `lintKeys(spec: SequenceSpec, warn = defaultWarn): void`。
- Consumes: `suggestName`（`options.ts`）、`describeLayer`、`collectPropKeys`（`space/specKeys.ts`）。**`src/space/specKeys.ts` は既にある別物（キーフレームのプロパティ名を集める）: 名前が紛らわしいので、新しい表は `src/core/layerKeys.ts` に置く。**

- [ ] **Step 1: テストを書く**（`tests/core/lintKeys.test.ts`）

```ts
// 層のキー
//   { type: 'text', text: 'a', bogus: 1 }            → /unnamed text layer: "bogus" is not a text layer key/
//   { type: 'text', text: 'a', duraton: 3 }          → …did you mean "duration"?
//   { type: 'shape', shape: 'rect', radius: 5 }      → /"radius" is not a rect shape key.*circle/   (別の図形のキーなら、その図形を教える)
// キーフレームのプロパティ名 (to / from / set / initial)
//   keyframes: [{ at: 0, to: { alhpa: 1 } }]         → /"alhpa" is not an animatable property.*did you mean "alpha"/
//   'filters.g.amount' / 'three.x.y' / 'fillGradient' / 'value' / 'tint' / 'scaleX'  → 警告なし
// style
//   style: { fontSzie: 20 }                          → /style\.fontSzie.*did you mean "fontSize"/
// 値
//   style: { fontSize: 'nope' } / initial: { x: 'GW/' }  → /"nope" is not a number or an expression/
//   'GW/2', 'min(GW, GH) * 0.4', 40, '40' は警告なし
// 警告は例外にしない。同じ警告は層ごとに 1 回
```
上の各行を `it` にする。各層の種類（`text` `shape`（7 つの図形）`image` `video` `audio`（asset / sfx / music）`composition` `camera` `null` と、three 層（`pixi-effects/three` が足す `three` 種類。登録された種類は `keysFor` が拡張点を持つ））を最低 1 つずつ、「正しいキーだけの仕様」で警告ゼロにする。

**表の網羅**は型で守る（Interfaces 参照）。`npx tsc --noEmit` が、表に無いキーを足した型を拒むことを、わざとキーを 1 つ消して確かめる（確認だけ。元に戻す）。

Run: `npx vitest run tests/core/lintKeys.test.ts`
Expected: FAIL

- [ ] **Step 2: 表と `lintKeys` を書く**

`src/core/layerKeys.ts` に、種類ごとの表（`SequenceCommon` のキー ＋ 種類ごとの固有キー）。`lintKeys`: (a) 層のキー（表に無い → 警告。別の種類の表にあれば「それは `<type>` 層のキー」と教える）、(b) `initial` と keyframes の `set` / `to` / `from` のキー（`PROP_KEYS` と、接頭辞つき `filters.` `three.`、その種類固有の live キー）、(c) `style` のキー、(d) `initial` / keyframes / `style` の値が文字列のとき、`expr` のパーサーで構文を確かめる（`'GW/2'` は通り、`'nope'` と `'GW/'` は警告。色やフォント名など、文字列が正しい値のキーは検査しない: キーごとに「数か式のはず」の表を持つ）。did-you-mean は `suggestName`。1 層 1 回、文言は「`<key>` は <type> 層のキーではありません（候補: …）」と**何が正しいかを言う**。例外にしない。

`Composition.ts:58` の `lintTiming(...)` の隣に `lintKeys(s)`（警告の出し方は `lintTiming` と同じ、`summarizeWarnings` に乗せる）。

Run: `npx vitest run tests/core/lintKeys.test.ts; npx tsc --noEmit; echo "exit=$?"`
Expected: PASS、`exit=0`

- [ ] **Step 3: 偽の警告が無いこと（この版の合格条件）**

`tests/docs/NoFalseWarnings.test.ts`（実ブラウザではなくノードで、層の仕様の木だけを検査する）: ギャラリー 39 作品・`examples/*.html`・`examples/_guide/*.html`・`ai/template.html`・`ai/chat-template.html` の既定・`examples/playground/presets/*.js` の 12 本・ガイドとレシピ（`// @recipe`）の例を、実際に走らせて警告を集めるのが確実。**実ブラウザで走らせる**: `tests/tools/noFalseWarnings.test.ts` が、すべてのページを `check.serve` + `launchChrome` で開き、`window.__logs` が**空**であることを確かめる（既存の `gallery.test.ts` の作りを参考に）。落ちたページが出たら、それは (1) 表の取りこぼし（表を直す）か、(2) 本当の誤り（そのページを直す）。判断を `Task 4: Ruling` に残す。**警告の出ない側に緩める（検査を弱める）のは、(1) のときだけ。**

Run: `npm run build; npx vitest run tests/tools/noFalseWarnings.test.ts; echo "exit=$?"`
Expected: PASS（全ページで `__logs` が空）

- [ ] **Step 4: 文書、全体、コミット**

`ai/SKILL.md`（警告は指示。未知のキーの警告は「その種類で使えるキー」を言う）、`ai/reference/pitfalls.md`、CHANGELOG の Added（検査する範囲と、検査しない範囲: 値の範囲は意図があるので見ない）。

Run: `npm run build:ai && npm run test:fast; echo "exit=$?"`

```bash
git add -A
git commit -m "feat: unknown layer keys, unknown animatable properties, unknown style keys and values that are neither a number nor an expression are warned about, with what is right (and no false warning on any gallery piece, example or recipe)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 見せ場の作品 2 本

**Files:**
- Create: `examples/gallery/<id>.html` ×2、`examples/gallery/posters/<id>.jpg` ×2、`examples/gallery/_notes/<id>.md` ×2
- Modify: `examples/gallery/pieces.json`（`node scripts/build-gallery.mjs`）、`examples/gallery/posters/manifest.json`（`node scripts/make-posters.mjs`）、件数が書いてある文書（`site/landing/FACTS.md`、`README.md`、`index.html`、`site/landing/PIECES.txt` など。`grep -rn "39" ...` で洗い出す）

**Interfaces:** 作品の書き方・メタ（`#piece-meta`）・ポスターは `examples/gallery/BRIEF.md` と `MODELS.md` に従う。

- [ ] **Step 1: 2 本の企画**

(1) **スプリングと grain**: 弾むカードやボタンの UI の動き（スプリングのプリセット 3 種の違いが見える）に、フィルムの粒を重ねた短い作品。(2) **グラデーションの文字**: 角度が回り、色が移ろう大きな文字と、放射状の光が動く背景。どちらも**設計された作品**（色数 2〜3、リズム、最後のフレームが決まっている）。ブリーフの書き方で、新しい機能の名前を 1 つずつ使う。

- [ ] **Step 2: 作る**

`ai/SKILL.md` に従う新しいサブエージェント（`BRIEF.md` と `AGENTS.md` の最初の 1 文だけを渡す）に各 1 本ずつ書かせ、`check` の警告ゼロと、コンタクトシートを自分の目で見る（この版の機能が実際に見えていること）。モデル名はそのセッションのもの（`MODELS.md`）。

- [ ] **Step 3: 登録とポスター**

Run: `node scripts/build-gallery.mjs && node scripts/make-posters.mjs; echo "exit=$?"`、`npx vitest run tests/docs/Gallery.test.ts tests/tools/gallery.test.ts; echo "exit=$?"`
Expected: `exit=0`。件数（39 → 41、モデル別の数）が書いてある場所をすべて直す（`grep -rn "39 " site index.html README.md llms*.txt` と、`FACTS.md`・`PIECES.txt`）。

- [ ] **Step 4: 全体とコミット**

Run: `npm run build:ai && npm run site:sync -- --check && npm run test:fast; echo "exit=$?"`

```bash
git add -A
git commit -m "feat: two gallery pieces for 0.19: springs under film grain, and a gradient that moves through type

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 文書・CHANGELOG・最終確認

**Files:** `CHANGELOG.md`、`site/guide/{motion,shapes,text,filters,cookbook,with-ai}.md`、`ai/SKILL.md`、`ai/reference/*`、`README.md`、`llms*.txt`、`docs/superpowers/specs/2026-10-08-expressiveness-0.19-design.md`（状態）

- [ ] **Step 1: 文書の整合**: 各タスクで足した文書を通読し、重複・食い違いを直す。CHANGELOG の `## Unreleased` を、**Added**（スプリング、`fillGradient` のアニメーション、grain、未知のキーへの警告、作品 2 本）と**測った値**（スプリングの落ち着く時間、グラデーション 50 図形の 1 フレーム、grain の標準偏差とコスト、mp4 のサイズ）に整える。`## Unreleased` のまま（0.18.1 のぶんの `animateText` の項は残す）。
- [ ] **Step 2: 仕様の状態を更新**: 設計メモの先頭を「承認済み・実装済み」にし、末尾に「実装での調整」（`Task N: Ruling` と、実機で測った値）を書く。
- [ ] **Step 3: 生成物と整合**

Run: `npm run build:ai && npm run site:sync -- --check && npx vitest run tests/docs; echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 4: 最終確認**

Run: `npm run release:check; echo "exit=$?"`
Expected: `exit=0`

撮影の最終確認: スプリングの作品と grain の作品、グラデーションの文字の作品を、コンタクトシートと実寸のスナップショットで、1 枚ずつ Read で見て、機能が見えていること、文字が切れていないことを確かめる。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "docs: 0.19 changelog (spring, animated gradients, grain, key warnings), guide pages and generated AI docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**完了の報告に含めること:** Rulings、測った値（スプリングの各プリセット、グラデーション・grain のコスト、ソフトウェア GL と実 GPU を分けて）、偽の警告のテストの結果、シークの同一性の結果、push していないこと。リリース（版番号を 0.19.0 に上げる、`release:check`、`npm publish`）は、オーナーの合図を待つ。
