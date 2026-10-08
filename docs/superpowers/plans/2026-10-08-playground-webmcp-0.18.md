# 0.18 Playground の作り直しと WebMCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playground を、サンドボックスの iframe で動く本物の「試せる場所」に作り直し、WebMCP のツールでブラウザの中の AI が「書く → 走らせる → 確かめる」を回せるようにする。

**Architecture:** 判断のコード（どのフレームを見るか、問題のまとめ方）は `movie.review()` としてライブラリに 1 つだけ置き、`check` コマンド・Playground の問題の欄・WebMCP の `check` ツールが同じものを呼ぶ。Playground は `ai/chat-template.html` を実行時に取得して「EDIT 部分」だけをエディタの本文に差し替え、`sandbox="allow-scripts allow-downloads"`（オリジンなし）の iframe に `srcdoc` として入れる。親と iframe は `postMessage` の許可リストのブリッジだけで話す。WebMCP の層は薄く、ツール本体は普通の関数。

**Tech Stack:** TypeScript（`src/`）、素の ES モジュール（`examples/playground/`、ビルドなし）、CodeMirror 6（esm.sh）、vitest、Chrome（`--enable-features=WebMCP`）。

**Spec:** [docs/superpowers/specs/2026-10-08-playground-webmcp-0.18-design.md](../specs/2026-10-08-playground-webmcp-0.18-design.md)（承認済み: 7 つの決定はすべて推しどおり）

## Global Constraints

- 新しい依存を入れない（CodeMirror は今も esm.sh から読んでいる）。ページ読み込み時に読むのはいまと同じもの（esm.sh の CodeMirror、jsDelivr、同じサイト）だけ。
- 既存の URL は変えない（`/examples/playground.html`）。ライブラリの公開 API は足すだけ（`movie.review()`、`movie.resolveAt()`）。
- `pixi-effects-check` は、ページのライブラリが 0.18 以上であることを要求してよい（オーナーの方針: 破壊的な変更は可、互換の仕組みは入れない）。古いと、分かりやすいメッセージで終了コード 2。`report.json` の形と終了コードは変えない。
- 共有リンクで開いたコードは**自動で走らせない**。サンドボックスに `allow-same-origin`・`allow-top-navigation`・`allow-popups`・`allow-forms` を付けない。
- 全テストは各タスクの終わりに `npx vitest run`、途中は `npm run test:fast` と関連ファイルだけ。**コミットの前に、テストの終了コードを自分で読む**（パイプの途中の `grep` で隠さない）。
- コミットはタスクごと。**push も公開もしない**。末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。返信は日本語。数字は測ったものだけ。
- macOS は大文字小文字を区別しない。`sed -i` は `sed -i ''`。zsh は `$VAR` を単語に分けない（複数の引数は変数にまとめない）。ブラウザのテストが読む `dist/` は、ソースを変えたら `npm run build` で作り直す。

## Rulings（仕様からの調整。最後にオーナーへ報告する）

- **R1: `check.mjs` は旧ライブラリ向けの退避経路を持たない。** `movie.review` が無いページには、「このページの pixi-effects は check より古い。0.18 以上にしてください」と言って終了コード 2。理由: 判断のコードが 2 つになるのを避けるため（オーナーの方針とも合う）。
- **R2: `movie.resolveAt(list)` を公開する。** `--at` の誤りを遅い処理の前に報告する（0.17.1 で直した挙動）を、`review()` に移しても保つため。
- **R3: テンプレートに、任意の `const INIT = {…}` を足す**（`movie.init` の追加オプションと `composition` の追加キー。`assets`、`transitions` など）。プリセットが必要とするため。テンプレートの既定の EDIT 部分には現れず、AI 向けの文書には 1 行だけ足す。

## File Structure

| ファイル | 役割 | 作る/変える |
|---|---|---|
| `src/core/review.ts` | `sampleFrames`、`resolveAtList`、`groupIssues`、`splitIssues`、`reviewMovie` | 作る |
| `src/core/Movie.ts`、`src/index.ts` | `movie.review()`、`movie.resolveAt()`、型の export | 変える |
| `ai/tools/check.mjs` | `movie.review()` を呼ぶ。移した関数と掃引のスクリプトを消す。`launchChrome` に追加引数 | 変える |
| `ai/chat-template.html` | 任意の `INIT` | 変える |
| `examples/playground.html` | 新しい画面（共通ヘッダーの上） | 作り直す |
| `examples/playground/doc.js` | EDIT 部分の取り出し・差し替え、`srcdoc` の組み立て、保存用の HTML | 作る |
| `examples/playground/bridge.js` | iframe 側のブリッジ（文字列）と、親側の命令の検査 | 作る |
| `examples/playground/host.js` | サンドボックスの iframe の実行（`createRunner`） | 作る |
| `examples/playground/share.js` | 共有リンクの圧縮・復元 | 作る |
| `examples/playground/editor.js` `problems.js` `app.js` `playground.css` | エディタ、問題の欄、画面の動き、見た目 | 作る |
| `examples/playground/presets/*.js` + `index.js` | 12 本を新しい形に書き直す | 作る（旧 `examples/_presets/` は削除） |
| `examples/playground/mcp.js` | WebMCP のツール定義と登録 | 作る |
| `tests/core/review.test.ts`、`tests/playground/*.test.ts`、`tests/tools/playground*.test.ts` | 検査 | 作る |
| `site/guide/playground.md`、`AGENTS.md`、`ai/CHAT.md`、`ai/SKILL.md`、`CHANGELOG.md`、`llms*.txt` | 文書 | 作る・変える |

## Review Focus

- **サンドボックスの抜け道**: iframe のコードが親のページ・`localStorage`・他のサイトのデータに触れないこと、ページを遷移させられないこと → Task 2 の実ブラウザ検査（`parent.document` が例外、`top.location` の変更が無効）。
- **`postMessage` の相手の確認**: 親は `event.source === iframe.contentWindow` のメッセージだけ、iframe 側は `event.source === parent` のだけを受ける。命令は許可リストと引数の型の検査を通ったものだけ → Task 2 の単体テスト。
- **`check` の結果が移し替えで変わる** → Task 1 の最後に、旧 `check.mjs` と新しいものを同じページ（ギャラリーの数作品と `_checks`）で走らせて、`report.json` の `inspect` / `fonts` / `audio` / `at` を比べる。
- **Run を繰り返すと GL コンテキストが溜まる**（Chrome は 16 個前後で警告） → Task 3 で 20 回 Run して、警告が出ないこと。
- **WebMCP の呼び出しが Run の途中で重なる** → ツールの呼び出しを 1 本ずつ順に処理する（キュー）。Task 5 のテスト。
- **共有リンクの展開結果が巨大**（圧縮爆弾）や壊れた入力 → 上限（200 KB）と、落ちずにメッセージを出すことを Task 4 の単体テストで。
- **テンプレートを実行時に読むので、印が消える** → 印が無いと、はっきり言って止まる。印が `ai/chat-template.html` にあることを守るテスト。

---

### Task 1: `movie.review()` と `movie.resolveAt()`

**Files:**
- Create: `src/core/review.ts`, `tests/core/review.test.ts`
- Modify: `src/core/Movie.ts`, `src/index.ts`, `ai/tools/check.mjs`, `tests/tools/check.test.ts`, `tests/tools/checkAt.test.ts`

**Interfaces:**
- Produces:
  - `sampleFrames({ totalFrames, frameRate, scenes?, step?, cap? }): number[]`、`resolveAtList(list, ctx): Array<{ label: string; frame: number }>`、`groupIssues(perFrame)`、`splitIssues(groups, strict?)`（いずれも `ai/tools/check.mjs` の今のものと同じ中身。型をつける）
  - `movie.resolveAt(list: string): Array<{ label: string; frame: number }>`（誤りは、層の名前などを書いた例外）
  - `movie.review(opts?: { at?: string; strict?: boolean }): Promise<ReviewReport>`
    ```ts
    interface IssueGroup { message: string; count: number; firstFrame: number; lastFrame: number }
    interface ReviewReport {
      frames: number;               // 見たフレームの数
      problems: IssueGroup[];       // 文字が切れている・画面の外・大きさなし（strict では全部）
      review: IssueGroup[];         // 文字の重なり、使えないフォント（目で確かめる）
      fonts: FontReport;
      audio: AudioReport | null;    // 音がなければ null
      at: Array<{ label: string; frame: number }>;
    }
    ```

- [ ] **Step 1: 移す前の `check` の結果を保存する**（比較の基準）

```bash
mkdir -p /tmp/review-before
git show HEAD:ai/tools/check.mjs > ai/tools/check-before.mjs
for p in ma christmas-eve quiet-hours kinetic-manifesto news-package; do node ai/tools/check-before.mjs examples/gallery/$p.html --no-export --at "1,title@end" --out /tmp/review-before/$p > /dev/null 2>&1; done
node ai/tools/check-before.mjs examples/_checks/fonts.html --no-export --out /tmp/review-before/fonts > /dev/null 2>&1
ls /tmp/review-before
```
Expected: 6 つのフォルダに `report.json`。`ai/tools/check-before.mjs` は**このタスクの終わりに削除する**（コミットしない）。

- [ ] **Step 2: 純関数のテストを `tests/core/review.test.ts` に移す**

`tests/tools/checkAt.test.ts` の `sampleFrames`・`resolveAtList`・`scenes` の parity のテストと、`tests/tools/check.test.ts` の `groupIssues`・`splitIssues` のテストを、**中身を変えずに** `tests/core/review.test.ts` へ移す（`check.sampleFrames` → `sampleFrames`、import は `../../src/core/review`）。`scenes` の parity のテストは、`namedScenes` だけの検査にする（`check.scenesOf` は消える）。`checkAt.test.ts` には `parseArgs`（`--at` / `--draft` / `--onion` / `--query`）のテストだけを残す。

Run: `npx vitest run tests/core/review.test.ts`
Expected: FAIL（`src/core/review.ts` が無い）

- [ ] **Step 3: 関数を `src/core/review.ts` に移す**

`ai/tools/check.mjs` の `sampleFrames`、`resolveAtList`、`groupIssues`、`splitIssues` を、そのまま TypeScript にして `src/core/review.ts` に置く（`export`）。型は上の `IssueGroup` などを使う。`scenesOf` は `src/core/scenes.ts` の `namedScenes` を使うので移さない。

Run: `npx vitest run tests/core/review.test.ts`
Expected: PASS（移す前と同じ値）。

- [ ] **Step 4: `reviewMovie` と `Movie` のメソッド**（`src/core/review.ts` に足す）

```ts
import type { Movie } from './Movie';
import { namedScenes } from './scenes';
import type { AudioReport } from './inspectAudio';
import type { FontReport } from './inspectFonts';

export interface ReviewOptions { at?: string; strict?: boolean }
export interface ReviewReport {
  frames: number; problems: IssueGroup[]; review: IssueGroup[]; fonts: FontReport; audio: AudioReport | null;
  at: Array<{ label: string; frame: number }>;
}

/** What `pixi-effects-check` and the Playground tell about a movie that is ready: warnings come from the page (window.__logs), the rest from here. */
export async function reviewMovie(movie: Movie, opts: ReviewOptions = {}): Promise<ReviewReport> {
  const rows = movie.timelineData().rows;
  const at = opts.at ? resolveAtList(opts.at, { frameRate: movie.frameRate, totalFrames: movie.totalFrames, duration: movie.duration, rows }) : [];
  const frames = sampleFrames({ totalFrames: movie.totalFrames, frameRate: movie.frameRate, scenes: namedScenes(rows) });
  const perFrame: Array<{ frame: number; issues: string[] }> = [];
  for (const frame of frames) {
    const r = await movie.inspect(frame, { layers: 'none' });
    if (r.issues.length) perFrame.push({ frame, issues: r.issues });
  }
  const grouped = splitIssues(groupIssues(perFrame), !!opts.strict);
  const fonts = movie.inspectFonts();
  for (const m of fonts.missing) {
    (opts.strict ? grouped.problems : grouped.review).push({ message: `layer "${m.layer}": none of the fonts "${m.family}" is available here (it is drawn in a fallback font)`, count: 1, firstFrame: 0, lastFrame: 0 });
  }
  for (const f of fonts.failedUnused) grouped.review.push({ message: `web font "${f}" failed to load, but no text layer uses it (a broken or unused @font-face)`, count: 1, firstFrame: 0, lastFrame: 0 });
  return { frames: frames.length, problems: grouped.problems, review: grouped.review, fonts, audio: movie.audioBuffer ? movie.inspectAudio() : null, at };
}
```

`Movie.ts` に足す（`inspectFonts` の隣）:

```ts
  /** The pictures to look at for `--at` style moments: `3.5`, `50%`, `f120`, `title@end`. A mistake says what could not be read. */
  resolveAt(list: string): Array<{ label: string; frame: number }> {
    this._requireReady('resolveAt');
    return resolveAtList(list, { frameRate: this.frameRate, totalFrames: this.totalFrames, duration: this.duration, rows: this.timelineData().rows });
  }

  /** One call that looks at everything `pixi-effects-check` looks at in the page: layout issues over the whole timeline, fonts, sound. See `ReviewReport`. */
  review(opts: ReviewOptions = {}): Promise<ReviewReport> {
    warnUnknownOptions('movie.review()', opts, ['at', 'strict']);
    this._requireReady('review');
    return reviewMovie(this, opts);
  }
```
`src/index.ts` に `export type { ReviewOptions, ReviewReport, IssueGroup } from './core/review';` を足す。

テスト（`tests/core/review.test.ts` に足す。`Movie` を使う実ブラウザの検査は Step 6）: `reviewMovie` の戻りの形は、Step 6 の実ブラウザで確かめる。

- [ ] **Step 5: `check.mjs` を `movie.review()` に載せ替える**

1. `INFO` に `hasReview: typeof m.review === 'function'` を足す。`runCheck` はページが ready になった直後に、`!info.hasReview` なら `throw new Error('this page\'s pixi-effects is older than the check tool: use 0.18 or newer (the version in the page\'s import map)')`。
2. `--at` の早期の検査は `await cdp.eval(\`JSON.stringify(movie.resolveAt(${JSON.stringify(opts.at)}))\`)`（誤りはここで例外 → 終了コード 2）に置き換える。`--onion` の範囲の検査は今のまま（`info.duration`）。
3. 掃引・フォント・音の 3 か所を、1 回の `const rv = await cdp.eval(\`movie.review(${JSON.stringify({ at: opts.at ?? undefined, strict: !!opts.strict })})\`)` に置き換え、`report.inspect = { checkedFrames: rv.frames, issues: rv.problems, review: rv.review }`、`report.fonts = rv.fonts`、`report.audio = rv.audio`（`info.hasAudio` のとき）、`report.at = rv.at`。`report.problems` への追加（レイアウトの種類の数、読み込みに失敗したフォント）は今の文言のまま。strict のときのフォントの行は、レイアウトの欄の行（`rv.problems` の中身）として出るので、別に足していた `report.problems.push('layer "…": none of its fonts is available (…)')` は消す。`tests/tools/check.test.ts` の該当の期待は `/none of the fonts "ThisFontDoesNotExist123, NopeNope" is available/` に直す。
4. `sampleFrames`、`resolveAtList`、`groupIssues`、`splitIssues`、`scenesOf`、`sweepScript`、`INFO` の `rows` の項目（Task 3 以降で要らなければ）を `check.mjs` から消す。`--at` の画像を撮る部分は `rv.at`（`label`・`frame`）を使う。
5. `launchChrome(chrome, userDataDir, extraArgs = [])` に、Chrome の追加引数を足す（Task 5 のテストが使う）。

Run: `npx tsc --noEmit && npx vitest run tests/core/review.test.ts tests/tools/checkAt.test.ts`
Expected: PASS。

- [ ] **Step 6: 実ブラウザで、移す前と比べる**

`npm run build` のあと:
```bash
mkdir -p /tmp/review-after
for p in ma christmas-eve quiet-hours kinetic-manifesto news-package; do node ai/tools/check.mjs examples/gallery/$p.html --no-export --at "1,title@end" --out /tmp/review-after/$p > /dev/null 2>&1; done
node ai/tools/check.mjs examples/_checks/fonts.html --no-export --out /tmp/review-after/fonts > /dev/null 2>&1
python3 - <<'EOF'
import json, os
bad = 0
for d in sorted(os.listdir('/tmp/review-before')):
    a = json.load(open(f'/tmp/review-before/{d}/report.json')); b = json.load(open(f'/tmp/review-after/{d}/report.json'))
    for k in ['inspect', 'fonts', 'at', 'problems']:
        if a.get(k) != b.get(k): bad += 1; print('DIFF', d, k)
    if (a.get('audio') or {}).get('loudness') != (b.get('audio') or {}).get('loudness'): bad += 1; print('DIFF', d, 'audio.loudness')
print('differences:', bad)
EOF
rm -f ai/tools/check-before.mjs
```
Expected: `differences: 0`。差があれば、**原因を調べて直す**（許容で隠さない）。`ma` のようにギャラリー作品の `check` が秒数の差だけで通る。`tests/tools/check.test.ts` の実ブラウザのテストがすべて通ること:

Run: `npx vitest run tests/tools/check.test.ts tests/tools/fonts.test.ts`
Expected: PASS。

- [ ] **Step 7: 全体とコミット**

Run: `npm run test:fast; echo "exit=$?"`（`exit=0` を確かめてからコミット）

```bash
git add -A
git commit -m "feat: movie.review() and movie.resolveAt(): what check looks at, in the library (check, the Playground and the WebMCP tools will share it); check needs a page with pixi-effects 0.18 or newer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ドキュメントの形、サンドボックスの iframe、ブリッジ（まず動くことを実機で証明する）

**Files:**
- Modify: `ai/chat-template.html`（任意の `INIT`）、`ai/CHAT.md`（1 行）
- Create: `examples/playground/doc.js`, `examples/playground/bridge.js`, `examples/playground/host.js`, `examples/_checks/sandbox-runner.html`, `tests/playground/doc.test.ts`, `tests/playground/bridge.test.ts`, `tests/tools/playgroundSandbox.test.ts`

**Interfaces:**
- Produces（`doc.js`）:
  - `EDIT_FROM`、`EDIT_UNTIL`（印の文字列）
  - `editRegion(templateHtml): string`（印の間のコード。字下げを 4 文字ぶん外す）
  - `withRegion(templateHtml, code): string`（印の間を差し替える。字下げを戻す）
  - `compose(templateHtml, code, { distBase, assetBase, extraImports? }): string`（サンドボックス用の `srcdoc`: 印の差し替え、`pixi-effects@x.y.z/dist/` を `distBase` に置換、`<base href=assetBase>`、ブリッジの挿入、`extraImports` を import map に足す）
  - `standalone(templateHtml, code): string`（保存用: 印の差し替えだけ）
- Produces（`bridge.js`）: `BRIDGE_SOURCE: string`（iframe に入れるスクリプトの本文）、`COMMANDS`（許可リスト: 名前 → 引数の検査関数）、`validateCommand(msg): { ok: true } | { ok: false; error: string }`
- Produces（`host.js`）: `createRunner({ container, templateUrl, distBase, assetBase, onEvent }): { run(code): Promise<Status>, call(cmd, args): Promise<unknown>, destroy(): void }`、`Status = { ready: boolean; logs: string[]; duration?: number; width?: number; height?: number; frameRate?: number; totalFrames?: number; failed?: string }`

- [ ] **Step 1: テンプレートに任意の `INIT` を足す**（テストが先: `tests/tools/chatTemplate.test.ts` の「CHAT.md の例がテンプレートで動く」は今のまま通ること）

`ai/chat-template.html` の `movie.init({…})` を次にする（EDIT 部分の既定のコードは変えない）:

```js
    // Optional, for advanced pages: const INIT = { assets: [...], transitions: [...], motionBlur: true } adds movie.init options (and composition keys).
    const EXTRA = typeof INIT === 'object' && INIT ? INIT : {};
    try {
      await movie.init({
        canvas: document.getElementById('stage'),
        width: W, height: H, duration: DURATION, frameRate: FPS,
        poster: POSTER,
        background: BACKGROUND,
        ...EXTRA,
        composition: { sequences, ...(EXTRA.composition || {}) },
      });
```
`ai/CHAT.md` の「ルール」の節の末尾に 1 行: 「Advanced: `const INIT = { assets: [...], transitions: [...] }` in the edit block adds `movie.init` options (the page merges it).」

Run: `npx vitest run tests/tools/chatTemplate.test.ts tests/docs`
Expected: PASS（`INIT` を宣言しないページは `typeof INIT` が `'undefined'` で、動きは同じ）。

- [ ] **Step 2: `doc.js` のテストを書く**（`tests/playground/doc.test.ts`、`// @vitest-environment node`、`examples/playground/doc.js` は `pathToFileURL` で動的 import）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const doc: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/doc.js')).href);
const template = readFileSync(join(root, 'ai/chat-template.html'), 'utf8');

describe('playground doc: the edit block of ai/chat-template.html', () => {
  it('the template has both marks, once (the Playground reads the template at run time)', () => {
    expect(template.split(doc.EDIT_FROM).length).toBe(2);
    expect(template.split(doc.EDIT_UNTIL).length).toBe(2);
  });
  it('editRegion gives the code of the block, without the page\'s 4-space indent; the default has the constants an AI writes', () => {
    const code = doc.editRegion(template);
    expect(code).toMatch(/^const W = 1280, H = 720, FPS = 30, DURATION = 6;/m);
    expect(code).toMatch(/const sequences = \[/);
    expect(code.startsWith('    ')).toBe(false);
  });
  it('withRegion and editRegion round-trip any code, and the rest of the page is untouched', () => {
    const code = 'const W = 640, H = 360, FPS = 24, DURATION = 2;\nconst BACKGROUND = "#000";\nconst sequences = [];\nconst POSTER = 1;';
    const html = doc.withRegion(template, code);
    expect(doc.editRegion(html)).toBe(code);
    expect(html.replace(code, '')).not.toContain('const W = 1280');
    const strip = (s: string) => s.slice(0, s.indexOf(doc.EDIT_FROM)) + s.slice(s.indexOf(doc.EDIT_UNTIL));
    expect(strip(html)).toBe(strip(template));
  });
  it('a block with code that contains $ patterns is inserted literally', () => {
    const code = "const x = '$&$1$`'; const sequences = [];";
    expect(doc.editRegion(doc.withRegion(template, code))).toBe(code);
  });
  it('standalone is just the replaced block, still pinned to the released library on the CDN', () => {
    const html = doc.standalone(template, 'const sequences = [];');
    expect(html).toContain('cdn.jsdelivr.net/npm/pixi-effects@');
    expect(html).not.toContain('bridge');
  });
  it('compose points the library at this site, makes assets resolve from the examples folder, adds the bridge and any extra imports', () => {
    const html = doc.compose(template, 'const sequences = [];', { distBase: 'https://site.example/pixi-effects/dist/', assetBase: 'https://site.example/pixi-effects/examples/', extraImports: { 'pixi-filters': 'https://cdn.example/pf.mjs' } });
    expect(html).toContain('"pixi-effects": "https://site.example/pixi-effects/dist/index.js"');
    expect(html).toContain('"pixi-effects/controller": "https://site.example/pixi-effects/dist/Controller.js"');
    expect(html).not.toContain('cdn.jsdelivr.net/npm/pixi-effects@');
    expect(html).toContain('<base href="https://site.example/pixi-effects/examples/">');
    expect(html).toContain('"pixi-filters": "https://cdn.example/pf.mjs"');
    expect(html).toContain('__pixiEffectsBridge');
  });
  it('a template without the marks is a clear error, not a silent no-op', () => {
    expect(() => doc.editRegion('<html></html>')).toThrow(/EDIT FROM HERE/);
    expect(() => doc.withRegion('<html></html>', 'x')).toThrow(/EDIT FROM HERE/);
  });
});
```

Run: `npx vitest run tests/playground/doc.test.ts`
Expected: FAIL（`doc.js` が無い）

- [ ] **Step 3: `doc.js` を書く**（`bridge.js` の `BRIDGE_SOURCE` を挿入するので、先に `bridge.js` の枠だけ作る: Step 5 で埋める。この段階では `export const BRIDGE_SOURCE = '/* __pixiEffectsBridge */';` でテストを通す）

```js
// examples/playground/doc.js — the Playground's document is the edit block of ai/chat-template.html (the page the AI-in-a-chat entry hands out).
import { BRIDGE_SOURCE } from './bridge.js';

export const EDIT_FROM = '// ===================== EDIT FROM HERE =====================';
export const EDIT_UNTIL = '// ===================== EDIT UNTIL HERE =====================';
const INDENT = '    ';

function bounds(html) {
  const a = html.indexOf(EDIT_FROM), b = html.indexOf(EDIT_UNTIL);
  if (a < 0 || b < 0 || b < a) throw new Error(`the template has no "${EDIT_FROM}" … "${EDIT_UNTIL}" block (ai/chat-template.html changed?)`);
  const start = html.indexOf('\n', a) + 1;
  return { start, end: html.lastIndexOf('\n', b) };             // the block is the lines between the two mark lines
}

/** The code of the edit block, without the 4-space indent the page gives it. */
export function editRegion(html) {
  const { start, end } = bounds(html);
  return html.slice(start, end).split('\n').map((l) => (l.startsWith(INDENT) ? l.slice(INDENT.length) : l)).join('\n');
}

/** The page with `code` as its edit block (indented back). */
export function withRegion(html, code) {
  const { start, end } = bounds(html);
  const body = String(code).split('\n').map((l) => (l ? INDENT + l : l)).join('\n');
  return html.slice(0, start) + body + html.slice(end);       // slices, not String.replace: `code` may contain $& and friends
}

/** For saving: the template with the block replaced, still on the released library from the CDN. */
export function standalone(html, code) { return withRegion(html, code); }

const PINS = /https:\/\/cdn\.jsdelivr\.net\/npm\/pixi-effects@[\d.]+\/dist\//g;

/** For the sandboxed iframe: this site's library, assets resolved from `assetBase`, the bridge, and extra import-map entries. */
export function compose(html, code, { distBase, assetBase, extraImports = {} }) {
  let out = withRegion(html, code).replace(PINS, distBase);
  out = out.replace('<head>', `<head>\n  <base href="${assetBase}">`);
  const extra = Object.entries(extraImports).map(([k, v]) => `      "${k}": "${v}",\n`).join('');
  if (extra) out = out.replace('"imports": {\n', `"imports": {\n${extra}`);
  return out.replace('</body>', `<script>${BRIDGE_SOURCE}</script>\n</body>`);
}
```

Run: `npx vitest run tests/playground/doc.test.ts`
Expected: PASS。（`'</body>'` の置換は、最後の `</body>` に対して 1 回。テンプレートに `</body>` が複数あれば、最後のものにする: `lastIndexOf` に直す。）

- [ ] **Step 4: ブリッジのテストを書く**（`tests/playground/bridge.test.ts`）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const bridge: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/bridge.js')).href);

describe('bridge: what the page may ask the sandboxed movie to do', () => {
  it('knows its commands: status, review, look, onion, render, seek, play, pause', () => {
    expect(Object.keys(bridge.COMMANDS).sort()).toEqual(['look', 'onion', 'pause', 'play', 'render', 'review', 'seek', 'status']);
  });
  it.each([
    [{ id: 1, cmd: 'status' }], [{ id: 2, cmd: 'review', args: { at: 'title@end', strict: false } }], [{ id: 3, cmd: 'look', args: { at: '3.5,50%' } }],
    [{ id: 4, cmd: 'look', args: { count: 6 } }], [{ id: 5, cmd: 'onion', args: { from: 1, to: 3, count: 8 } }],
    [{ id: 6, cmd: 'render', args: { range: [1, 2], draft: true } }], [{ id: 7, cmd: 'render', args: { range: 'title' } }], [{ id: 8, cmd: 'seek', args: { frame: 12 } }],
  ])('accepts %j', (msg) => { expect(bridge.validateCommand(msg)).toEqual({ ok: true }); });
  it.each([
    [{ cmd: 'status' }, /id/], [{ id: 1, cmd: 'eval', args: { code: 'x' } }, /unknown command "eval"/], [{ id: 1 }, /unknown command/],
    [{ id: 1, cmd: 'seek', args: { frame: 'a' } }, /frame must be a whole number/], [{ id: 1, cmd: 'review', args: { at: 5 } }, /at must be a string/],
    [{ id: 1, cmd: 'look', args: { count: 999 } }, /count must be 1 to 24/], [{ id: 1, cmd: 'render', args: { range: [3, 1] } }, /range/],
    [{ id: 1, cmd: 'onion', args: { from: -1 } }, /from/], [null, /message/], ['status', /message/],
  ])('rejects %j: %s', (msg, why) => {
    const r = bridge.validateCommand(msg);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(why);
  });
  it('the iframe side is one classic script that names its guard (only messages from the parent window are obeyed)', () => {
    expect(bridge.BRIDGE_SOURCE).toContain('__pixiEffectsBridge');
    expect(bridge.BRIDGE_SOURCE).toContain('event.source !== parent');
    expect(() => new Function(bridge.BRIDGE_SOURCE)).not.toThrow();        // it parses
  });
});
```

Run: `npx vitest run tests/playground/bridge.test.ts`
Expected: FAIL

- [ ] **Step 5: `bridge.js` を書く**

親側 `validateCommand`/`COMMANDS` と、iframe 側 `BRIDGE_SOURCE`（古典スクリプトの本文を、テンプレートリテラルで `export const`）。

```js
// examples/playground/bridge.js — the only way the Playground page talks to the sandboxed movie. Parent side: validate. Iframe side: BRIDGE_SOURCE.
const int = (v) => Number.isInteger(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const range = (v) => typeof v === 'string' || (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] >= 0 && v[0] < v[1]);

/** command name → a check of its arguments (returns an error text, or null when fine). */
export const COMMANDS = {
  status: () => null,
  play: () => null,
  pause: () => null,
  seek: (a) => (int(a.frame) && a.frame >= 0 ? null : 'seek: frame must be a whole number, 0 or more'),
  review: (a) => (a.at !== undefined && typeof a.at !== 'string' ? 'review: at must be a string' : null),
  look: (a) => {
    if (a.at !== undefined && typeof a.at !== 'string') return 'look: at must be a string';
    if (a.count !== undefined && !(int(a.count) && a.count >= 1 && a.count <= 24)) return 'look: count must be 1 to 24';
    return null;
  },
  onion: (a) => {
    for (const k of ['from', 'to']) if (a[k] !== undefined && !(num(a[k]) && a[k] >= 0)) return `onion: ${k} must be a number of seconds, 0 or more`;
    if (a.count !== undefined && !(int(a.count) && a.count >= 1 && a.count <= 64)) return 'onion: count must be 1 to 64';
    return null;
  },
  render: (a) => {
    if (a.range !== undefined && !range(a.range)) return 'render: range must be [from, to] seconds (from < to) or a layer name';
    if (a.draft !== undefined && typeof a.draft !== 'boolean') return 'render: draft must be true or false';
    return null;
  },
};

export function validateCommand(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { ok: false, error: 'a command message must be an object' };
  if (!int(msg.id)) return { ok: false, error: 'a command needs a whole-number id' };
  const check = Object.prototype.hasOwnProperty.call(COMMANDS, msg.cmd) ? COMMANDS[msg.cmd] : null;
  if (!check) return { ok: false, error: `unknown command "${msg.cmd}"` };
  const args = msg.args ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'args must be an object' };
  const error = check(args);
  return error ? { ok: false, error } : { ok: true };
}

/** The script that runs inside the sandboxed iframe, after the movie page. A plain script, no imports. */
export const BRIDGE_SOURCE = `
(function () {
  if (window.__pixiEffectsBridge) return;
  window.__pixiEffectsBridge = true;
  var post = function (m) { parent.postMessage(m, '*'); };
  var ready = function () { return window.__ready === true && window.movie; };
  var status = function () {
    var m = window.movie;
    return { ready: !!ready(), logs: (window.__logs || []).slice(), duration: m && m.duration, width: m && m.width, height: m && m.height, frameRate: m && m.frameRate, totalFrames: m && m.totalFrames };
  };
  var need = function () { if (!ready()) throw new Error('the movie is not ready yet' + ((window.__logs || []).length ? ': ' + window.__logs[0] : '')); return window.movie; };
  var handlers = {
    status: function () { return status(); },
    play: function () { need().play(); return status(); },
    pause: function () { need().pause(); return status(); },
    seek: function (a) { return need().gotoFrame(a.frame, true).then(status); },
    review: function (a) { return need().review({ at: a.at, strict: !!a.strict }).then(function (r) { r.logs = (window.__logs || []).slice(); return r; }); },
    look: function (a) {
      var m = need();
      if (a.at) { var at = m.resolveAt(a.at); return m.contactSheet({ frames: at.map(function (x) { return x.frame; }), as: 'dataURL' }).then(function (url) { return { image: url, at: at }; }); }
      return m.contactSheet({ count: a.count || 6, as: 'dataURL' }).then(function (url) { return { image: url }; });
    },
    onion: function (a) { return need().onionSkin({ from: a.from, to: a.to, count: a.count, as: 'dataURL' }).then(function (url) { return { image: url }; }); },
    render: function (a) {
      var m = need(), t0 = performance.now();
      var opts = { format: 'mp4' }; if (a.range !== undefined) opts.range = a.range; if (a.draft) opts.draft = true;
      return m.render(opts).then(function (blob) { return { bytes: blob.size, type: blob.type, seconds: Math.round((performance.now() - t0) / 100) / 10 }; });
    }
  };
  window.addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var msg = event.data;
    if (!msg || typeof msg.id !== 'number' || !Object.prototype.hasOwnProperty.call(handlers, msg.cmd)) return;
    Promise.resolve().then(function () { return handlers[msg.cmd](msg.args || {}); })
      .then(function (result) { post({ id: msg.id, ok: true, result: result }); }, function (e) { post({ id: msg.id, ok: false, error: String((e && e.message) || e) }); });
  });
  // tell the page when the movie is ready or has failed, so it does not poll
  var tries = 0;
  (function wait() {
    if (ready()) return post({ event: 'ready', status: status() });
    var failed = (window.__logs || []).find(function (l) { return /^(init failed|uncaught|unhandled)/.test(l); });
    if (failed || ++tries > 600) return post({ event: 'failed', status: status(), error: failed || 'the movie did not become ready in 60 s' });
    setTimeout(wait, 100);
  })();
})();
`;
```

Run: `npx vitest run tests/playground/bridge.test.ts tests/playground/doc.test.ts`
Expected: PASS。

- [ ] **Step 6: `host.js`（親側のランナー）を書く**

```js
// examples/playground/host.js — runs a movie page in a sandboxed iframe (no origin) and talks to it through the bridge.
import { compose } from './doc.js';
import { validateCommand } from './bridge.js';

export function createRunner({ container, templateUrl, distBase, assetBase, extraImportsFor = () => ({}), onEvent = () => {} }) {
  let frame = null, template = null, nextId = 1, listener = null;
  const pending = new Map();

  async function getTemplate() { return (template ??= await (await fetch(templateUrl)).text()); }

  function destroy() {
    if (listener) { removeEventListener('message', listener); listener = null; }
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }                 // the page and its GL context go with the frame
    for (const [, p] of pending) p.reject(new Error('the movie was replaced'));
    pending.clear();
  }

  function call(cmd, args = {}) {
    const msg = { id: nextId++, cmd, args };
    const v = validateCommand(msg);
    if (!v.ok) return Promise.reject(new Error(v.error));
    if (!frame) return Promise.reject(new Error('nothing is running: press Run'));
    return new Promise((resolve, reject) => { pending.set(msg.id, { resolve, reject }); frame.contentWindow.postMessage(msg, '*'); });
  }

  /** Replace the movie with one made from `code`. Resolves with the status when it is ready or has failed. */
  async function run(code) {
    destroy();
    const html = compose(await getTemplate(), code, { distBase, assetBase, extraImports: extraImportsFor(code) });
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads');           // no allow-same-origin: no access to this page or this site's data
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('title', 'The video');
    const mine = frame;
    const settled = new Promise((resolve) => {
      listener = (event) => {
        if (event.source !== mine.contentWindow) return;                      // only our own frame
        const d = event.data;
        if (!d || typeof d !== 'object') return;
        if (d.event === 'ready') { onEvent(d); resolve({ ...d.status, failed: undefined }); return; }
        if (d.event === 'failed') { onEvent(d); resolve({ ...d.status, ready: false, failed: d.error }); return; }
        const p = pending.get(d.id);
        if (p) { pending.delete(d.id); d.ok ? p.resolve(d.result) : p.reject(new Error(d.error)); }
      };
      addEventListener('message', listener);
    });
    mine.srcdoc = html;
    container.appendChild(mine);
    return settled;
  }

  return { run, call, destroy };
}
```

- [ ] **Step 7: 実機で証明する**（`examples/_checks/sandbox-runner.html` と `tests/tools/playgroundSandbox.test.ts`）

`examples/_checks/sandbox-runner.html`: `<div id="host"></div>` と、`createRunner`（`templateUrl: '../../ai/chat-template.html'`、`distBase: new URL('../../dist/', location.href).href`、`assetBase: new URL('../', location.href).href`）を作り `window.runner = runner` にする小さなモジュール（`__ready = true`）。import map は不要（`host.js` などは相対パスの ES モジュール）。

テスト（Chrome を `check.launchChrome` で起動し、`window.runner.run(code)` と `runner.call(...)` を `cdp.eval` で）:
1. 標準のコード（`editRegion` の既定）を走らせる → `ready: true`、`duration: 6`、`width: 1280`。
2. `review` → `frames` ≥ 10、`problems` は空、`audio` は null（音なし）。
3. `look` の `count: 3` → `image` が `data:image/png` で始まる。`onion` も同様。
4. `render({ draft: true })` → `bytes` > 1000（サンドボックスの中で書き出し（WebCodecs）が動く）。
5. **サンドボックスの確認**: 次のコードを走らせ、`status.logs` に `blocked:` が 3 つ（`parent.document`、`localStorage`、`top.location` の変更）入ること。
```js
const sequences = [];
for (const [name, fn] of [['parent.document', () => parent.document.title], ['localStorage', () => localStorage.getItem('x')], ['top.location', () => { top.location = 'about:blank'; }]]) {
  try { fn(); window.__add('LEAK ' + name); } catch (e) { window.__add('blocked: ' + name); }
}
const W = 640, H = 360, FPS = 30, DURATION = 1, BACKGROUND = '#000', POSTER = 0;
```
   `LEAK` が 1 つでもあれば失敗。親のページの `document.title` が変わっていないことも確かめる。
6. 壊れた入力: `runner.call('eval', { code: 'alert(1)' })` が例外（`unknown command`）。`runner.call('status')` を `run` の前に呼ぶと「press Run」。
7. 資産: `assets` を使うコード（`const INIT = { assets: [{ name: 'bg', src: '_assets/<examples/_assets の実在の画像>' }] }; … type: 'image', asset: 'bg'`）が `ready`（`assetBase` が効いている）。
8. 音: `{ type: 'audio', sfx: 'pop', at: 0.2 }` を含むコードで `review().audio` が非 null（音の経路がサンドボックスで動く）。

Run: `npm run build; npx vitest run tests/tools/playgroundSandbox.test.ts`
Expected: PASS。**1〜8 のどれかが実機で動かなければ、そこで止まる**: 原因を調べ、仕様の 6 章の退避案（同一オリジンの iframe に戻し、共有リンクは「コードを見てから Run」を強める）を**オーナーに報告して判断を仰ぐ**（勝手に切り替えない）。

- [ ] **Step 8: 全体とコミット**

Run: `npm run test:fast; echo "exit=$?"`（`exit=0` を確かめる）

```bash
git add -A
git commit -m "feat: the Playground's document is the edit block of the chat template, run in a sandboxed iframe with no origin and a bridge that only knows eight commands; proved on a real browser (module imports, assets, sound, render, and no way out to the parent or the site's data)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Playground の画面（エディタ、プレビュー、問題の欄、プリセット、テーマ）

**Files:**
- Rewrite: `examples/playground.html`
- Create: `examples/playground/{editor.js,problems.js,app.js,playground.css,presets/index.js,presets/NN-*.js (12)}`
- Delete: `examples/_presets/`（先に `grep -rn "_presets" . --exclude-dir=node_modules --exclude-dir=.git` で参照を洗い出し、あれば直す）
- Create: `tests/playground/presets.test.ts`, `tests/tools/playground.test.ts`
- Modify: `site/pages.json`（変更なし: `parts: head, header` のまま）、`site/guide` の「Playground」の参照があれば

**Interfaces:**
- Consumes: Task 2 の `createRunner`、`editRegion`、`withRegion`、`BRIDGE`。
- Produces（`presets/index.js`）: `export default [{ id, label, code }]`。`code` は EDIT 部分の本文（`const W…` から `const POSTER…`）。`extraImportsFor(code)`（`presets/index.js` から）: コードが `pixi-filters` / `three` を import していれば、その import map の追加を返す（旧 Playground の import map の値を引き継ぐ）。

- [ ] **Step 1: プリセットの検査を書く**（`tests/playground/presets.test.ts`、Node）

- 12 本すべてが `id`・`label`・`code` を持ち、`code` が `const W =` と `const sequences` と `const POSTER` を含む。
- `new Function(code.replace(/^import .*$/gm, '') + '; return 1')` が構文エラーにならない（`await` を含むものは `new (async function(){}).constructor`）。
- ID が重複しない。旧プリセットの 12 本（`01-hello` … `14-draw-on`）と同じ ID が残っている。

Run: `npx vitest run tests/playground/presets.test.ts`
Expected: FAIL

- [ ] **Step 2: 12 本を新しい形に書き直す**（`examples/playground/presets/NN-*.js`。旧 `examples/_presets/NN-*.js` を 1 本ずつ読んで）

書き直しの規則（各ファイルは `export default \`…\`;`）:
```js
const W = 1280, H = 720, FPS = 30, DURATION = <旧 duration>;
const BACKGROUND = '<旧 background>';
const sequences = [ <旧 composition.sequences の中身> ];
const POSTER = DURATION * 0.75;      // 旧が poster を持てばその値
```
旧に `assets`・`transitions`・`filters`・`motionBlur` などの追加オプションがあれば `const INIT = { assets: [...], composition: { transitions: [...] } };` に入れる（`assets` の `src` は `examples/` からの相対のまま。`assetBase` が効く）。`Controller` の行と `movie.init` の呼び出しは消す（ページが呼ぶ）。コメントの教育的な説明は残す。`import` が要るもの（`pixi-filters`、`three`、`kenBurns` などのヘルパー）は、ファイルの先頭の `import { … } from '…';` として本文に残す（EDIT 部分の内側に置くと、テンプレートのモジュールの中で有効）。ヘルパー（`kenBurns`、`withFade`、`wiggle` など）はテンプレートがすでに import しているので不要。

`presets/index.js`: 12 本を `{ id, label, code }` の配列にして export し、`extraImportsFor` も export。ラベルは旧のものをそのまま。

Run: `npx vitest run tests/playground/presets.test.ts`
Expected: PASS。

- [ ] **Step 3: 画面を作る**

`examples/playground.html`（共通の印 `<!--site:head-->` `<!--site:header-->` と、`<main id="main">` を持つ。フッターは置かない: `site/pages.json` の `parts: ["head", "header"]` のまま）、`examples/playground/playground.css`（トークンだけ。ヘッダーの下に、ツールバー、2 カラム（エディタ | プレビュー）、問題の欄。幅 720 未満は縦並び）、`examples/playground/editor.js`（CodeMirror の組み立て: `EditorView`、`javascript()`、`keymap` で `Mod-Enter` が Run、`Compartment` でテーマを切り替える。暗いとき `oneDark`、明るいとき標準。`document.documentElement` の `data-theme` の変化（`MutationObserver`）と `matchMedia('(prefers-color-scheme: dark)')` の変化で切り替える）、`examples/playground/problems.js`（`renderProblems(el, { logs, review, onSeek })`: 警告の一覧、`review.problems` と `review.review` のグループ（件数・フレーム範囲、クリックで `onSeek(firstFrame)`）、音の `notes` と `issues`、フォントの結果を、見出し付きで描く。空のときは「問題なし」）、`examples/playground/app.js`（全体の動き: プリセットの選択、Run、`createRunner` の結果から `review()` を呼んで問題の欄を更新、ツールバーのボタン（Run、共有リンク、HTML を保存、AI 用にコピー — 後の Task 4 で中身を入れる。ここでは Run だけ）、起動時は最初のプリセットを読み込んで走らせる）。import map は `codemirror` 関連だけ（旧ページのものを引き継ぐ。`sucrase` と `pixi.js` などは不要になる）。

ページの文言は英語（サイトの他のページと同じ）。ボタンは `Run (⌘↵)`、プリセットの選択は `aria-label="Preset"`。

- [ ] **Step 4: 実ブラウザの検査**（`tests/tools/playground.test.ts`）

- 起動して 1.5 秒以内にエディタ（`.cm-editor`）が出て、最初のプリセットが走り、`#problems` が描かれる（`ready` で警告なし → 「No problems」）。
- **12 本すべて**を `select` で順に切り替えて Run し、それぞれ `ready: true` で `logs` が空（資産を使うものは `_assets` が効く）。落ちるプリセットは、プリセット側（`INIT` や import の書き方）を直す。
- 幅 390 と 1440 で横にあふれず（`document.getElementById('main')` ではなく、ツールバー・エディタ・プレビュー・問題の欄の右端が画面幅以内）、ヘッダーの 4 つの入口が見える。
- 暗い/明るいの切り替え（ヘッダーの `#themeBtn`）でエディタの背景色が変わる。
- Run を **20 回**続けて押しても、ページのコンソール警告に `WebGL` / `context` の文字列が出ない（古い iframe が片付いている）。`document.querySelectorAll('iframe').length` は常に 1。
- コードを壊して Run（`const sequences = [ { type: 'nope' } ]`）→ 問題の欄に警告が出て、ページは落ちない。

Run: `npm run build; npx vitest run tests/tools/playground.test.ts tests/tools/siteShell.test.ts`
Expected: PASS（`siteShell` は Playground の幅 390 のあふれも見ている）。

- [ ] **Step 5: 見た目を目で確かめる**

`node scripts/preview-site.mjs`（または `npm run site`）で組み立てた Playground を、幅 1440 の暗い・明るい、幅 390 の暗いで撮り（`/tmp/scratchpad` ではなくセッションのスクラッチパッドの `shoot.mjs`、無ければ `ai/tools/check.mjs` の部品で書く）、Read で 1 枚ずつ見る。エディタとプレビューの比率、問題の欄の読みやすさ、ヘッダーとの揃いを確かめ、直す点があれば直す。

- [ ] **Step 6: 全体とコミット**

Run: `npm run test:fast; echo "exit=$?"`、続けて `npx vitest run tests/tools/playground.test.ts tests/tools/playgroundSandbox.test.ts tests/tools/siteShell.test.ts; echo "exit=$?"`（どちらも `exit=0`）。`node scripts/stage-site.mjs /tmp/site-t3 && node scripts/site-links.mjs /tmp/site-t3`（リンク切れなし。`import` の相対パスも検査される）。

```bash
git add -A
git commit -m "feat: the Playground is rebuilt: an editor on the chat template's edit block, the movie in a sandboxed iframe, a problems panel from movie.review(), twelve presets in the new form, light and dark

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 共有リンク、HTML を保存、AI 用にコピー

**Files:**
- Create: `examples/playground/share.js`, `tests/playground/share.test.ts`
- Modify: `examples/playground/app.js`, `examples/playground.html`, `tests/tools/playground.test.ts`

**Interfaces:**
- Produces（`share.js`）: `encode(code: string): Promise<string>`（deflate-raw + base64url）、`decode(text: string): Promise<string>`（不正・巨大なら例外。展開後の上限 200 KB）、`MAX_DECODED = 204800`、`shareUrl(code, base): Promise<string>`（`base + '#code=' + encode`）、`codeFromHash(hash): Promise<string | null>`。

- [ ] **Step 1: テストを書く**（`tests/playground/share.test.ts`、Node 22 の `CompressionStream` を使う）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const share: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/share.js')).href);

describe('share links: the code in the address, packed', () => {
  it('round-trips code, including non-Latin text, newlines and $ patterns', async () => {
    const code = "const W = 1280;\n// 日本語のコメント ✓\nconst s = '$&$1';\n" + 'x'.repeat(5000);
    expect(await share.decode(await share.encode(code))).toBe(code);
  });
  it('the packed text is address-safe (base64url: no + / = characters) and shorter than the code for real code', async () => {
    const code = 'const sequences = [' + '{ type: "text", text: "hello" },'.repeat(50) + '];';
    const s = await share.encode(code);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeLessThan(code.length / 2);
  });
  it('codeFromHash reads #code=…, and is null for any other hash', async () => {
    const url = await share.shareUrl('const a = 1;', 'https://x.example/playground.html');
    expect(url.startsWith('https://x.example/playground.html#code=')).toBe(true);
    expect(await share.codeFromHash(url.slice(url.indexOf('#')))).toBe('const a = 1;');
    expect(await share.codeFromHash('')).toBeNull();
    expect(await share.codeFromHash('#other=1')).toBeNull();
  });
  it('broken input is an error that says so, not a crash', async () => {
    await expect(share.decode('not-valid-@@@')).rejects.toThrow(/link/i);
    await expect(share.decode('AAAA')).rejects.toThrow(/link/i);
  });
  it('a link that unpacks to something huge is refused (a packed bomb)', async () => {
    const bomb = await share.encode('0'.repeat(share.MAX_DECODED * 3));
    await expect(share.decode(bomb)).rejects.toThrow(/too large/i);
  });
});
```

Run: `npx vitest run tests/playground/share.test.ts`
Expected: FAIL

- [ ] **Step 2: `share.js` を書く**

```js
// examples/playground/share.js — a share link carries the code in the address (#code=…), packed with deflate-raw and base64url. No server.
export const MAX_DECODED = 204800;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

export async function encode(code) {
  const packed = await pipe(new TextEncoder().encode(code), new CompressionStream('deflate-raw'));
  let s = '';
  for (let i = 0; i < packed.length; i += 0x8000) s += String.fromCharCode(...packed.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decode(text) {
  let bytes;
  try { bytes = unb64url(text); } catch { throw new Error('this link is not valid (it is not a packed pixi-effects code)'); }
  const ds = new DecompressionStream('deflate-raw');
  const reader = new Blob([bytes]).stream().pipeThrough(ds).getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DECODED) { await reader.cancel(); throw new Error('this link unpacks to something too large (over 200 KB): it was not opened'); }
      chunks.push(value);
    }
  } catch (e) {
    if (/too large/.test(e.message)) throw e;
    throw new Error('this link is not valid (it could not be unpacked)');
  }
  const all = new Uint8Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder().decode(all);
}

export async function shareUrl(code, base) { return `${base}#code=${await encode(code)}`; }

export async function codeFromHash(hash) {
  const m = /^#code=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? decode(m[1]) : null;
}
```
（`b64url` の使われない定義は消す。`btoa(String.fromCharCode(...bytes))` の大きな配列の展開は上のようにチャンクにする。）

Run: `npx vitest run tests/playground/share.test.ts`
Expected: PASS。

- [ ] **Step 3: ボタンを `app.js` に結ぶ**

- **共有リンク**: `shareUrl(code, location.origin + location.pathname)` をクリップボードへ（失敗したら `prompt` ではなく、入力欄に出して選択）。「コピーしました」を 1.4 秒表示。
- **起動時**: `location.hash` が `#code=` なら `codeFromHash` でエディタに入れ、**走らせない**。プレビューの場所に「A shared link was opened: read the code, then press Run.」と表示。展開に失敗したら、そのメッセージ（上の例外の文言）を問題の欄に出し、最初のプリセットを開く（自動実行はこの場合のみ）。
- **HTML を保存**: テンプレートを取得（`host.js` と同じ URL）→ `standalone(template, code)` を `Blob`（`text/html`）にして `<a download="video.html">` で保存。
- **AI 用にコピー**: `Use https://github.com/yjmtmtk/pixi-effects to make a video: …` ではなく、**今のコードを AI に渡す**文: 「Here is a pixi-effects video (the edit block of https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/chat-template.html). Change it as I ask, and keep the block's shape.\n\n```js\n<code>\n```」をクリップボードへ。

- [ ] **Step 4: 実ブラウザの検査を足す**（`tests/tools/playground.test.ts`）

- 共有リンクの往復: コードを書き換え → 共有リンクのボタン（クリップボードの読み出しが使えない環境のため、ボタンが設定した入力欄／`window.__lastShare` の値を読む）→ その URL を別のページで開く → エディタの本文が同じで、**`document.querySelectorAll('iframe').length` が 0**（走っていない）。Run を押すと走る。
- 壊れたリンク（`#code=AAAA`）→ 問題の欄にメッセージ、最初のプリセットが走る。
- 保存した HTML: ボタンが作った Blob の中身（`window.__lastSave` に文字列を残す）を、サーバーのルートに一時ファイルとして書き、`ai/tools/check.mjs` で走らせて終了コード 0（CDN の固定版が公開前なら、`onCdn` が偽のときはスキップ）。
- AI 用にコピーした文に、コードと `raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/chat-template.html` が入る。

Run: `npx vitest run tests/tools/playground.test.ts`
Expected: PASS。

- [ ] **Step 5: 全体とコミット**

Run: `npm run test:fast; echo "exit=$?"`

```bash
git add -A
git commit -m "feat: Playground share links (packed in the address, never run on open), save as a standalone HTML, and copy for an AI

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: WebMCP のツール

**Files:**
- Create: `examples/playground/mcp.js`, `tests/playground/mcp.test.ts`, `tests/tools/playgroundMcp.test.ts`
- Modify: `examples/playground/app.js`, `examples/playground.html`（小さな「AI agent tools」の表示）、`examples/playground/playground.css`

**Interfaces:**
- Consumes: Task 2 の `createRunner`、Task 3 の `app.js` の状態（エディタの本文、プリセット）、Task 1 の `review()`。
- Produces: `defineTools(api): Array<{ name, description, inputSchema, annotations?, execute(args): Promise<{ content: Array<{ type: 'text', text: string } | { type: 'image', data: string, mimeType: string }> }> }>`、`registerTools(api, modelContext): { count: number; abort(): void }`。`api` = `{ getCode(), setCode(code), run(), call(cmd, args), examples(), loadExample(id), docsUrl(part), fetchText(url) }`（`app.js` が渡す）。

- [ ] **Step 1: 実機で WebMCP の形を確かめる**（先に事実を取る）

`check.launchChrome` に追加引数（Task 1 で足した `extraArgs`）で `--enable-features=WebMCP` を付けた Chrome で、`examples/_checks/` の小さなページ（`webmcp-probe.html`: `document.modelContext.registerTool({ name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } } }, async execute(a) { return { content: [{ type: 'text', text: a.text }, { type: 'image', data: '<1x1 の PNG の base64>', mimeType: 'image/png' }] }; } })` を呼ぶ）を開き、`await document.modelContext.getTools()` の戻りの形（各要素の項目名）と、`executeTool` の引数の渡し方（ツールのオブジェクトか名前か）、**画像の内容を返せるか**（拒否されるか、そのまま返るか）を、`cdp.eval` で実測し、結果を `tests/tools/playgroundMcp.test.ts` の冒頭のコメントと、この計画の Step 3 の実装（画像の返し方）に反映する。画像が拒否される場合: `look` と `onion` は `{ type: 'text', text: JSON（'imageDataUrl' に縮小した JPEG の data URL） }` で返す。

- [ ] **Step 2: ツールの単体テストを書く**（`tests/playground/mcp.test.ts`、Node。`api` は偽物）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const mcp: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/mcp.js')).href);

function fakeApi() {
  const calls: string[] = []; let code = 'const sequences = [];';
  return { calls, api: {
    getCode: () => code, setCode: (c: string) => { calls.push('setCode'); code = c; },
    run: async () => { calls.push('run'); return { ready: true, logs: [], duration: 6, width: 1280, height: 720, frameRate: 30, totalFrames: 180 }; },
    call: async (cmd: string, args: any) => { calls.push(`call:${cmd}`); if (cmd === 'review') return { frames: 30, problems: [], review: [], fonts: { missing: [], failed: [], failedUnused: [] }, audio: null, at: [], logs: [] }; if (cmd === 'look') return { image: 'data:image/png;base64,AAAA' }; if (cmd === 'render') return { bytes: 5000, type: 'video/mp4', seconds: 1.2 }; return {}; },
    examples: () => [{ id: '01-hello', label: '01 · hello' }], loadExample: async (id: string) => { calls.push('load:' + id); return { id }; },
    docsUrl: (part: string) => `https://x.example/ai/reference/${part}.md`, fetchText: async (u: string) => `DOC ${u}`,
  } };
}

describe('WebMCP tools', () => {
  it('there are ten, each with a name, a description and an object schema', () => {
    const tools = mcp.defineTools(fakeApi().api);
    expect(tools.map((t: any) => t.name).sort()).toEqual(['check', 'get_code', 'get_docs', 'list_examples', 'load_example', 'look', 'onion', 'render_draft', 'run', 'set_code'].sort());
    for (const t of tools) { expect(t.description.length).toBeGreaterThan(20); expect(t.inputSchema.type).toBe('object'); }
  });
  it('read-only tools say so', () => {
    const tools = mcp.defineTools(fakeApi().api);
    for (const n of ['get_code', 'check', 'look', 'onion', 'get_docs', 'list_examples']) expect(tools.find((t: any) => t.name === n).annotations?.readOnlyHint, n).toBe(true);
    for (const n of ['set_code', 'run', 'load_example']) expect(tools.find((t: any) => t.name === n).annotations?.readOnlyHint, n).not.toBe(true);
  });
  it('set_code replaces the code and runs it (run: true by default), and returns a short summary', async () => {
    const { api, calls } = fakeApi();
    const t = mcp.defineTools(api).find((x: any) => x.name === 'set_code');
    const r = await t.execute({ code: 'const sequences = [1];' });
    expect(calls).toEqual(['setCode', 'run']);
    expect(JSON.parse(r.content[0].text)).toMatchObject({ ready: true, duration: 6 });
    calls.length = 0;
    await t.execute({ code: 'x', run: false });
    expect(calls).toEqual(['setCode']);
  });
  it('a failed run is reported in the result (not thrown): the agent reads what to fix', async () => {
    const { api } = fakeApi();
    api.run = async () => ({ ready: false, logs: ['warn: unknown option "styel"'], failed: 'init failed: x' });
    const r = await mcp.defineTools(api).find((x: any) => x.name === 'run').execute({});
    const body = JSON.parse(r.content[0].text);
    expect(body.ready).toBe(false);
    expect(body.failed).toMatch(/init failed/);
    expect(body.logs[0]).toMatch(/styel/);
  });
  it('bad arguments are an error result that says what is wrong, never an exception', async () => {
    const tools = mcp.defineTools(fakeApi().api);
    const r = await tools.find((x: any) => x.name === 'set_code').execute({ code: 42 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/code must be a string/);
    const r2 = await tools.find((x: any) => x.name === 'get_docs').execute({ part: 'secrets' });
    expect(r2.isError).toBe(true);
    expect(r2.content[0].text).toMatch(/part must be one of: cheatsheet, recipes, pitfalls/);
  });
  it('get_docs returns the reference text of the same site', async () => {
    const r = await mcp.defineTools(fakeApi().api).find((x: any) => x.name === 'get_docs').execute({ part: 'cheatsheet' });
    expect(r.content[0].text).toContain('DOC https://x.example/ai/reference/cheatsheet.md');
  });
  it('tools run one at a time: a second call waits for the first (a run in progress is not replaced under an agent)', async () => {
    const { api } = fakeApi();
    const order: string[] = [];
    api.run = async () => { order.push('run start'); await new Promise((r) => setTimeout(r, 30)); order.push('run end'); return { ready: true, logs: [] } as any; };
    api.call = async () => { order.push('call'); return { frames: 1, problems: [], review: [], fonts: {}, audio: null, at: [], logs: [] } as any; };
    const fake = { defs: [] as any[], registerTool: async (def: any) => { fake.defs.push(def); } };
    const r = await mcp.registerTools(api, fake);
    expect(r.count).toBe(10);
    const run = fake.defs.find((d: any) => d.name === 'run'), check = fake.defs.find((d: any) => d.name === 'check');
    await Promise.all([run.execute({}), check.execute({})]);
    expect(order).toEqual(['run start', 'run end', 'call']);
  });
});
```
（ツールは 10 本: `check`・`get_code`・`get_docs`・`list_examples`・`load_example`・`look`・`onion`・`render_draft`・`run`・`set_code`。仕様のメモの「9 本」は、`list_examples` と `load_example` を 1 本と数えていたため。）

Run: `npx vitest run tests/playground/mcp.test.ts`
Expected: FAIL

- [ ] **Step 3: `mcp.js` を書く**

要点（ファイル全体を、Step 1 の実測の結果に合わせて書く）:
- `defineTools(api)`: 10 本。説明（`description`）は、AI が使い方を読んで分かる 2〜3 文（何を返すか、いつ使うか）で書く。`inputSchema` は JSON Schema（`additionalProperties: false`）。
  - `get_code`（引数なし）、`set_code({ code: string, run?: boolean })`、`run()`、`check({ at?: string })`（`api.call('review', { at })` に、`api.getLogs`/`logs` を含める）、`look({ at?: string, count?: number })`、`onion({ from?, to?, count? })`、`render_draft({ range?: string | [number, number] })`（`api.call('render', { range, draft: true })`）、`list_examples()`、`load_example({ id })`（読み込んで走らせ、要約を返す）、`get_docs({ part: 'cheatsheet' | 'recipes' | 'pitfalls' })`（`api.fetchText(api.docsUrl(part))`）。
  - 引数の検査は各 `execute` の頭で行い、誤りは `{ isError: true, content: [{ type: 'text', text: '<tool>: <what is wrong>' }] }` を**返す**（例外にしない）。
  - 読み取り専用のツールに `annotations: { readOnlyHint: true }`。
  - 画像: Step 1 の実測で受け付けるなら `{ type: 'image', data: <base64 だけ>, mimeType: 'image/png' }`。拒否されるなら、縮小した JPEG の data URL を文章に含める。
- `registerTools(api, modelContext)`: 呼び出しを **1 本ずつ順に** 処理するキュー（Promise の連鎖）で各 `execute` を包み、`modelContext.registerTool(def, { signal })` で登録。戻りは `{ count, abort }`。`modelContext` が無い／`registerTool` が関数でないときは `{ count: 0, abort() {} }`。登録が例外を投げたら、握りつぶさず呼び出し側に伝わる（`app.js` が画面に出す）。

Run: `npx vitest run tests/playground/mcp.test.ts`
Expected: PASS。

- [ ] **Step 4: `app.js` に結ぶ**

`app.js` が `api` を作り（`getCode`: エディタの本文、`setCode`: エディタを置き換える、`run`: ボタンと同じ Run、`call`: ランナー、`examples`/`loadExample`: プリセット、`docsUrl`: `new URL('../ai/reference/${part}.md', location.href)`、`fetchText`: `fetch(...).then(r => r.text())`）、起動時に `registerTools(api, document.modelContext)` を呼ぶ。ツールバーの隣に小さな表示: 登録できたら「AI agent tools: 10」、`document.modelContext` が無ければ「AI agent tools: this browser has no WebMCP」、登録が失敗したらその理由。ページを離れるとき（`pagehide`）に `abort()`。

- [ ] **Step 5: 本物の Chrome でテストする**（`tests/tools/playgroundMcp.test.ts`）

`--enable-features=WebMCP` 付きの Chrome（`check.launchChrome(chrome, dir, ['--enable-features=WebMCP'])`）で Playground を開き、`document.modelContext` が無ければ `it.skipIf`。Step 1 で実測した形で:
1. `getTools()` に 10 本が載る。名前が仕様どおり。
2. `executeTool` で `set_code`（`editRegion` の既定の本文）→ `ready: true`、`duration: 6`。
3. 続けて `check` → `problems: []`、`frames` ≥ 10。`look`（`count: 3`）→ 画像（または data URL）が入る。`onion` → 同様。
4. `render_draft({ range: [0, 2] })` → `bytes` > 1000。
5. 壊れたコード（`const sequences = [ { type: 'nope' } ];`）を `set_code` → `logs` に警告。続けて `check` はエラーにならず返る。
6. 引数の誤り（`set_code({ code: 5 })`）→ `isError`。
7. 2 つのツールを同時に `executeTool` しても、順に処理される（`run` と `check` を `Promise.all` で呼び、結果がどちらも正しい）。
8. `get_docs({ part: 'cheatsheet' })` に `movie.render` の文字列が入る（同じサイトの `ai/reference/cheatsheet.md`）。

Run: `npm run build; npx vitest run tests/tools/playgroundMcp.test.ts`
Expected: PASS（この Chrome は WebMCP を持つ。持たない環境ではスキップ）。

- [ ] **Step 6: 全体とコミット**

Run: `npm run test:fast; echo "exit=$?"`

```bash
git add -A
git commit -m "feat: the Playground registers ten WebMCP tools (write, run, check, look, onion, draft render, examples, docs), one at a time, tested on a real Chrome

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 文書・CHANGELOG・最終確認

**Files:**
- Create: `site/guide/playground.md`
- Modify: `site/guide/with-ai.md`（ブラウザの AI の節）、`AGENTS.md`、`ai/CHAT.md`、`ai/SKILL.md`、`ai/reference/cheatsheet.md`（`movie.review`、`movie.resolveAt`）、`README.md`（Playground の説明があれば）、`CHANGELOG.md`、`llms*.txt`（`npm run build:ai`）、`docs/superpowers/specs/2026-10-08-playground-webmcp-0.18-design.md`（状態）

- [ ] **Step 1: 文書を書く**（各ファイルの既存の書き方・長さに合わせる。足すのは次の事実だけ）

- `site/guide/playground.md`（front matter: `title: Playground`、`section: Guides`、`order`、`summary`）: 何ができるか（書く・走らせる・問題の欄・共有リンク・HTML を保存・AI 用にコピー）、エディタの本文が `ai/chat-template.html` の EDIT 部分と同じ形であること（AI がチャットで書いたものをそのまま貼れる）、**共有リンクは開いても走らせない**、コードはオリジンのない iframe で走る（親のページやサイトのデータに触れない）、WebMCP の対応ブラウザと 10 本のツール（表）、Chrome で試すには（`chrome://flags` ではなく、origin trial の期間と、`--enable-features=WebMCP` で手元でも試せること。**バージョンの数字は、仕様が動くので「確かめた版: Chrome 154」と日付つきで書く**）。
- `ai/CHAT.md`: ブラウザの AI がエージェントとして Playground を直接操作できる場合は、`https://yjmtmtk.github.io/pixi-effects/examples/playground.html` を開いて WebMCP のツール（`set_code` → `run` → `check` → `look`）を使えること（赤い箱を人が貼り戻す必要がない）。1 段落。
- `AGENTS.md`: 「You can only write text」の節に、WebMCP が使える環境なら Playground のツールを使えることを 1 行。
- `ai/SKILL.md` と cheatsheet: `await movie.review({ at: 'title@end' })` が `pixi-effects-check` と同じ判断を返すこと（`frames`、`problems`、`review`、`fonts`、`audio`、`at`）、`movie.resolveAt('3.5,title@end')`。
- `site/guide/with-ai.md`: ブラウザの中の AI の節に、Playground の WebMCP への案内。
- `CHANGELOG.md`: `## Unreleased`（0.17.1 の修正の項は残す）に **Added**（Playground の作り直し、WebMCP の 10 本、`movie.review()` / `movie.resolveAt()`、テンプレートの任意の `INIT`）と **Changed**（`pixi-effects-check` はページのライブラリが 0.18 以上であること、旧 `examples/_presets/` の削除）。Run の再作成にかかる時間は、Task 3 の実機の値（測った秒数）を書く。

- [ ] **Step 2: 生成物と整合**

Run: `npm run build:ai && npm run site:sync -- --check && npx vitest run tests/docs; echo "exit=$?"`
Expected: `exit=0`（`llms*.txt` が作り直され、ガイドの新しいページを含むサイトのリンク検査が通る）。

- [ ] **Step 3: 仕様の状態を更新**

`docs/superpowers/specs/2026-10-08-playground-webmcp-0.18-design.md` の先頭を「承認済み・実装済み」にし、末尾に「実装での調整」として R1〜R3 と、Task 5 の Step 1 で分かった WebMCP の実際の形（画像の可否など）を書く。

- [ ] **Step 4: 最終確認**

Run: `npm run release:check; echo "exit=$?"`
Expected: `exit=0`（全テスト、実ブラウザ・WebMCP 含む）。

撮影の最終確認: Playground を、幅 1440 の暗い・明るい、幅 390 の暗いで撮り、Read で 1 枚ずつ見て、問題の欄・ヘッダー・エディタが読めること、どこも横にあふれないことを確かめる。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "docs: the Playground guide page, the WebMCP tools for an AI in a browser, changelog and generated AI docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**完了の報告に含めること:** Rulings R1〜R3、実機で分かった WebMCP の形（画像の可否、`executeTool` の引数）、サンドボックスの検査の結果、Run の再作成にかかる秒数、旧 check との比較の結果（差 0）、push していないこと。リリース（版番号を 0.18.0 に上げる、`release:check`、`npm publish`）は、オーナーの合図を待つ。0.17.1 の修正もこの版に入る。
