# サイト統一（LP 基準）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LP・Guide・Gallery・Examples・Playground を同じ色・書体・ヘッダー・フッター・部品に揃え、後から一か所を直せば全ページに効く作りにする。

**Architecture:** 共通の見た目は `site/shared/`（`tokens.css` / `site.css` / `site.js`）に置く。ヘッダー・フッター・`<head>` の共通部分は `scripts/site-parts.mjs` の関数が正本で、`scripts/sync-site.mjs` が各ページの印（`<!--site:header-->…<!--/site:header-->`）の間を書き換える（`--check` で古さを検出するテストつき。`pieces.json` や llms と同じ流儀）。デプロイ用の並びは `scripts/stage-site.mjs` が作り、ワークフローとテストの両方が呼ぶ。内部リンクの検査は `scripts/site-links.mjs`。

**Tech Stack:** 素の HTML/CSS/JS、Node 22 の ESM スクリプト（依存なし）、vitest、実ブラウザ検査は `ai/tools/check.mjs` の部品。

**Spec:** [docs/superpowers/specs/2026-10-08-site-redesign-design.md](../specs/2026-10-08-site-redesign-design.md)（オーナー承認済み: Playground の URL は据え置き、Examples は独立した入口、ギャラリーの黒は LP の暗いテーマに吸収）

## Global Constraints

- フレームワーク・新しい依存は入れない。ページ読み込み時にサードパーティから何も読まない（フォント・解析・ライブラリは、クリックされたときの CDN 読み込みを除き禁止）。
- 既存の URL は変えない: `/` `/guide/` `/examples/` `/examples/gallery/` `/examples/gallery/<id>.html` `/examples/playground.html` `/examples/music-lab.html` `/examples/NN-*.html`。
- 暗い/明るいの両テーマと手動切替（保存キー `pe-theme`）を保つ。幅 390 と 1440 で横スクロールが出ない。コントラストは本文 4.5 以上。
- Guide の本文（`site/guide/*.md`）、ギャラリー各作品ページ、番号つき例 `01`–`15`、ライブラリ本体（`src/`）は触らない。
- テストは `npm run test:fast`（約 10 秒）を各ステップで、実ブラウザを含む全テストは各タスクの終わりと最後に `npm run release:check` ではなく `npx vitest run` で。
- コミットはタスクごと。**push も公開もしない**（オーナーの合図を待つ）。コミットメッセージの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- 返信と報告は日本語。作ったページの数字・主張は実測できるものだけ。
- macOS は大文字小文字を区別しない: 新しいファイル名は `ls` で衝突を確かめてから作る。`sed -i` は `sed -i ''`。zsh の `echo ====` は使わない。

## Rulings（仕様からの調整。最後にオーナーへ報告する）

- **R1: LP のソースを `site/landing/index.html` からリポジトリ直下の `index.html` へ移す。** 理由: 共通ファイルへの相対パスを「リポジトリ」と「公開先」で同じにするため。直下に置けばリポジトリ直下 = サイトのルートになり、`site/landing/` にあった 2 本のシンボリックリンクと `scripts/preview-landing.mjs` が不要になる。`FACTS.md` / `NOTES.md` は `site/landing/` に残す。
- **R2: LP のヘッダーは共通の 5 項目に置き換わる。** 節へのアンカー（One sentence / What you get …）、バージョンの札、スクロール連動のタイムコード表示は消す。画面上端のスクロール進行バー（`#playhead`）は LP だけに残す。バージョン表記は LP 本文の中にいくつも残る（テストが強制）。
- **R3: LP は単一ファイルではなくなる**（共通 CSS 2 本 + `landing.css` を読む）。`Landing.test.ts` の「`<link rel="stylesheet">` も `<script src>` も無い」を「同じサイト内の相対パスだけ許す。サードパーティは禁止」に改め、サイズ上限は HTML + `landing.css` の合計で測る。
- **R4: ギャラリーの再生ダイアログ（theatre）は LP の簡易プレイヤーに統合しない。** theatre は前後移動・ハッシュの深いリンク・背景クリックの扱いなど積み上げた修正が多い。共通にするのは色・形（トークン）で、挙動は据え置く。
- **R5: ヘッダー/フッターの正本は HTML の断片ファイルではなく `scripts/site-parts.mjs`（JS の関数）。** ナビの項目を 1 か所で定義し、テストで直接検査できるため。
- **R6: 共通ヘッダーの小画面（幅 600 未満）は 2 段**（上段: ブランドとテーマ切替、下段: 4 つのリンク）。1 段に収めると幅 390 で溢れる。

## File Structure

| ファイル | 役割 | 作る/変える |
|---|---|---|
| `scripts/stage-site.mjs` | 公開と同じ並びを `outDir` に作る（ワークフロー・テスト共用） | 作る |
| `scripts/site-links.mjs` | 並べたサイトの内部リンク切れを調べる | 作る |
| `scripts/site-parts.mjs` | `NAV`、`renderHead/Header/Footer`、`rootPrefix`。正本 | 作る |
| `scripts/sync-site.mjs` | 各ページの印の間を正本で書き換える。`--check` | 作る |
| `site/pages.json` | 同期するページの一覧（ファイル、現在地、追加の領域） | 作る |
| `site/shared/tokens.css` `site.css` `site.js` | 共通の見た目と挙動 | 作る |
| `index.html`（直下） | LP（R1） | 移す・変える |
| `site/landing/landing.css` | LP だけの CSS | 作る |
| `site/guide/guide.css` | Guide だけの CSS | 作る |
| `scripts/build-guide.mjs` | 共通の断片を使う。CSS の定数を外す | 変える |
| `examples/gallery/index.html` + `gallery.css` | ギャラリーの一覧 | 変える・作る |
| `examples/index.html` + `examples.css` + `examples/examples.json` | Examples の入口 | 変える・作る |
| `examples/playground.html` `music-lab.html` | 共通のヘッダー/トークン | 変える |
| `.github/workflows/pages.yml` | `stage-site.mjs` を呼ぶ | 変える |
| `site/README.md` | サイトの直し方（保守者向け） | 作る |
| `tests/docs/SiteLinks.test.ts` `SiteShell.test.ts` `SiteTokens.test.ts` `ExamplesIndex.test.ts` | 検査 | 作る |
| `tests/tools/siteShell.test.ts` `gallery.test.ts` | 実ブラウザの検査 | 作る |

## Review Focus

- 小画面（390）でヘッダーが溢れる／リンクが画面外に出る → Task 2 の実ブラウザ検査、Task 3–6 で各ページに適用。
- 明るいテーマでギャラリーのモデル色（fable / opus / sonnet）が読めない → Task 2 の `SiteTokens.test.ts`（コントラスト 4.5 以上）。
- ギャラリーの挙動（フィルタ、theatre の開閉、`#id` の深いリンク、Esc）が再スキンで壊れる → Task 6 は先に特性テストを書き、旧版で通ることを確かめてから載せ替える。
- LP のヒーロー・ポスターのプレイヤー（既存の実ブラウザ検査）が、移動と CSS 分割で壊れる → Task 3 の最後に `tests/tools/landing.test.ts` を通す。
- 公開後にだけ起きるパスずれ（`/pixi-effects/` の下で動く相対パス、ルート絶対パス `/x`） → Task 1 の検査器がルート絶対パスを不正として報告する。

---

### Task 1: 公開の並びをコードにして、内部リンク切れを検査する

**Files:**
- Create: `scripts/stage-site.mjs`, `scripts/site-links.mjs`, `tests/docs/SiteLinks.test.ts`
- Modify: `.github/workflows/pages.yml`, `tests/docs/Landing.test.ts`（ワークフローの文字列の検査 1 件）

**Interfaces:**
- Produces: `stageSite(outDir, { root })` → `outDir`（`async`）。`brokenLinks(siteDir)` → `Array<{ page: string, ref: string, reason: string }>`（`page` は `siteDir` からの相対）。

- [ ] **Step 1: 検査器のテストを書く**（`tests/docs/SiteLinks.test.ts`）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { brokenLinks } from '../../scripts/site-links.mjs';
// @ts-expect-error plain ESM script without types
import { stageSite } from '../../scripts/stage-site.mjs';

const root = resolve(__dirname, '../..');

describe('site-links: the checker', () => {
  it('reports a missing file, a root-absolute path and a directory without index.html; accepts the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-'));
    try {
      mkdirSync(join(dir, 'a'), { recursive: true });
      mkdirSync(join(dir, 'empty'));
      writeFileSync(join(dir, 'ok.html'), '<p>ok</p>');
      writeFileSync(join(dir, 'a', 'index.html'), '<p>a</p>');
      writeFileSync(join(dir, 'index.html'), [
        '<a href="ok.html#x">ok</a>', '<a href="a/">dir</a>', '<img src="a/../ok.html">',
        '<a href="https://example.com/x">external</a>', '<a href="#top">anchor</a>', '<a href="mailto:a@b.c">mail</a>',
        '<a href="https://yjmtmtk.github.io/pixi-effects/ok.html">own origin</a>',
        '<a href="missing.html">missing</a>', '<a href="/ok.html">root absolute</a>', '<a href="empty/">no index</a>',
        '<script>const s = `<a href="${x}.html">`;</script>',
      ].join('\n'));
      const got = brokenLinks(dir).map((p: any) => `${p.ref}|${p.reason}`).sort();
      expect(got).toEqual([
        '/ok.html|root-absolute path (breaks under /pixi-effects/)',
        'empty/|directory has no index.html',
        'missing.html|file not found',
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the staged site (what GitHub Pages serves)', () => {
  it('has no broken local link in any page', async () => {
    const out = mkdtempSync(join(tmpdir(), 'site-'));
    try {
      await stageSite(out, { root });
      const problems = brokenLinks(out).map((p: any) => `${p.page}: ${p.ref} (${p.reason})`);
      expect(problems).toEqual([]);
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 120000);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/docs/SiteLinks.test.ts`
Expected: FAIL（`site-links.mjs` / `stage-site.mjs` が無い）

- [ ] **Step 3: 検査器を書く**（`scripts/site-links.mjs`）

```js
// Finds the local links of a staged site (see stage-site.mjs) that do not resolve. No browser, no network.
//   node scripts/site-links.mjs <siteDir>      exit 1 and a list when something is broken
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORIGIN = 'https://yjmtmtk.github.io/pixi-effects/';
const SKIP_DIRS = new Set(['node_modules', '.git', 'wedding-profilemovie', '_notes']);
const ATTR = /\b(?:href|src|poster|data-src|data-embed)\s*=\s*"([^"]*)"/gi;

export function htmlFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** The page without its inline script bodies and comments (templates inside scripts hold `href="${…}"`), keeping `<script src>` tags. */
function scannable(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

export function brokenLinks(siteDir) {
  const problems = [];
  const site = resolve(siteDir);
  for (const file of htmlFiles(site)) {
    const page = relative(site, file).split(sep).join('/');
    for (const m of scannable(readFileSync(file, 'utf8')).matchAll(ATTR)) {
      let ref = m[1].trim();
      if (!ref || ref.startsWith('#') || /^(data:|mailto:|tel:|javascript:)/i.test(ref) || ref.includes('${') || ref.includes('{{')) continue;
      let target;
      if (ref.startsWith(ORIGIN)) target = resolve(site, ref.slice(ORIGIN.length).split(/[?#]/)[0]);
      else if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue;           // another origin
      else if (ref.startsWith('/')) { problems.push({ page, ref, reason: 'root-absolute path (breaks under /pixi-effects/)' }); continue; }
      else target = resolve(dirname(file), ref.split(/[?#]/)[0]);
      if (!target.startsWith(site)) { problems.push({ page, ref, reason: 'points outside the site' }); continue; }
      if (!existsSync(target)) { problems.push({ page, ref, reason: 'file not found' }); continue; }
      if (statSync(target).isDirectory() && !existsSync(join(target, 'index.html'))) problems.push({ page, ref, reason: 'directory has no index.html' });
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(process.argv[2] ?? fileURLToPath(new URL('../_site', import.meta.url)));
  const problems = brokenLinks(dir);
  for (const p of problems) console.error(`${p.page}: ${p.ref} (${p.reason})`);
  console.log(problems.length ? `${problems.length} broken link(s)` : 'no broken local link');
  process.exit(problems.length ? 1 : 0);
}
```

- [ ] **Step 4: 並べるスクリプトを書く**（`scripts/stage-site.mjs`。いまのワークフローと同じ中身。LP はまだ `site/landing/index.html`）

```js
// The layout GitHub Pages serves, built into <outDir>. The Pages workflow and the tests both call this, so what is tested is what ships.
//   node scripts/stage-site.mjs [outDir]      default _site
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildGuide } from './build-guide.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function stageSite(outDir, { root = ROOT } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const copy = (from, to = from) => {
    if (!existsSync(join(root, from))) return;
    mkdirSync(dirname(join(outDir, to)), { recursive: true });
    cpSync(join(root, from), join(outDir, to), { recursive: true });
  };
  for (const dir of ['dist', 'examples', 'ai']) copy(dir);
  for (const f of ['docs/dsl.md', 'docs/api.md', 'llms.txt', 'llms-full.txt']) copy(f);
  copy('site/landing/index.html', 'index.html');
  await buildGuide({ srcDir: join(root, 'site/guide'), outDir: join(outDir, 'guide'), root });
  return outDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] ?? join(ROOT, '_site'));
  await stageSite(out);
  console.log(`site staged → ${out}`);
}
```

- [ ] **Step 5: ワークフローを置き換える**（`.github/workflows/pages.yml` の `Stage Pages artifact` の `run:` を 1 行に）

```yaml
      - name: Stage Pages artifact
        run: node scripts/stage-site.mjs _site
```

`tests/docs/Landing.test.ts` の最初のテストを次に直す:

```ts
  it('is staged as the Pages site root by the stage script, which the workflow runs', () => {
    expect(read('.github/workflows/pages.yml')).toContain('node scripts/stage-site.mjs _site');
    expect(read('scripts/stage-site.mjs')).toContain("copy('site/landing/index.html', 'index.html')");
  });
```

- [ ] **Step 6: 通るまで直す**

Run: `npx vitest run tests/docs/SiteLinks.test.ts tests/docs/Landing.test.ts`
Expected: 検査器のテストは PASS。`the staged site … has no broken local link` は **実際のリンク切れを出すかもしれない**。出たら、1 件ずつ原因を直す（リンク先を直す、または本当に不要な参照なら消す）。リンクを「許可リスト」で隠さない。直した内容はコミットメッセージに書く。

- [ ] **Step 7: コミット**

```bash
git add scripts/stage-site.mjs scripts/site-links.mjs tests/docs/SiteLinks.test.ts tests/docs/Landing.test.ts .github/workflows/pages.yml
git commit -m "test: the deployed layout is code (stage-site.mjs) and a checker finds broken local links in it; the Pages workflow uses it

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 共通の見た目・断片・同期（まだどのページにも適用しない）

**Files:**
- Create: `site/shared/tokens.css`, `site/shared/site.css`, `site/shared/site.js`, `scripts/site-parts.mjs`, `scripts/sync-site.mjs`, `site/pages.json`, `tests/docs/SiteShell.test.ts`, `tests/docs/SiteTokens.test.ts`
- Modify: `package.json`（scripts に `"site:sync": "node scripts/sync-site.mjs"`）, `scripts/stage-site.mjs`（`site/shared` を `site/shared` に写す）

**Interfaces:**
- Consumes: Task 1 の `stageSite`。
- Produces（以降のタスクが使う）:
  - `NAV: Array<{ id: 'guide'|'gallery'|'examples'|'playground', label: string, href: string }>`（`href` は公開ルートからの相対）
  - `rootPrefix(depth: number): string`（`0 → ''`, `1 → '../'`, `2 → '../../'`）
  - `renderHead({ root }): string`、`renderHeader({ root, current }): string`、`renderFooter({ root }): string`（`current` は `NAV` の `id`、`'home'`、または `''`）
  - `syncSite({ root, check }): { stale: string[], written: string[] }`
  - ページの印: `<!--site:head-->…<!--/site:head-->`、`<!--site:header-->…<!--/site:header-->`、`<!--site:footer-->…<!--/site:footer-->`
  - 共通 CSS の読み込み順: `tokens.css` → `site.css` → ページ固有の CSS。共通ファイルは公開先でも `site/shared/`（`{root}site/shared/…`）。

- [ ] **Step 1: 断片のテストを書く**（`tests/docs/SiteShell.test.ts`）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { NAV, rootPrefix, renderHead, renderHeader, renderFooter } from '../../scripts/site-parts.mjs';
// @ts-expect-error plain ESM script without types
import { syncSite } from '../../scripts/sync-site.mjs';

const root = resolve(__dirname, '../..');
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('site-parts: the header, footer and head every page shares', () => {
  it('rootPrefix climbs one level per directory', () => {
    expect([0, 1, 2].map(rootPrefix)).toEqual(['', '../', '../../']);
  });

  it('the header has the brand and the four entrances, relative to the page, and marks the current one', () => {
    const h = renderHeader({ root: '../../', current: 'gallery' });
    expect(hrefs(h)).toEqual(expect.arrayContaining(['../../', '../../guide/', '../../examples/gallery/', '../../examples/', '../../examples/playground.html']));
    expect(NAV.map((n: any) => n.id)).toEqual(['guide', 'gallery', 'examples', 'playground']);
    expect(h.match(/aria-current="page"/g)).toHaveLength(1);
    expect(h).toMatch(/<a href="\.\.\/\.\.\/examples\/gallery\/" aria-current="page">Gallery<\/a>/);
    expect(h).toContain('id="themeBtn"');
  });

  it('home marks the brand, an unknown current marks nothing', () => {
    expect(renderHeader({ root: '', current: 'home' })).toMatch(/class="brand"[^>]*aria-current="page"/);
    expect(renderHeader({ root: '', current: '' })).not.toContain('aria-current');
  });

  it('the footer links to every entrance, the repository, npm and the AI entry', () => {
    const f = renderFooter({ root: '../' });
    for (const need of ['../guide/', '../examples/gallery/', '../examples/', '../examples/playground.html', '../examples/music-lab.html', '../llms.txt', 'https://github.com/yjmtmtk/pixi-effects', 'https://www.npmjs.com/package/pixi-effects']) {
      expect(hrefs(f), need).toContain(need);
    }
  });

  it('the head loads the tokens, then the shared styles, then the script; the theme is applied before paint', () => {
    const h = renderHead({ root: '' });
    const order = ['site/shared/tokens.css', 'site/shared/site.css', 'site/shared/site.js'].map((s) => h.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).toContain("localStorage.getItem('pe-theme')");
  });
});

describe('sync-site: the pages carry the shared parts, up to date', () => {
  it('no page is stale (run `npm run site:sync` after editing site-parts.mjs)', () => {
    const { stale } = syncSite({ root, check: true });
    expect(stale).toEqual([]);
  });

  it('every page lists the three markers and a <main id="main">', () => {
    const pages = JSON.parse(readFileSync(resolve(root, 'site/pages.json'), 'utf8')).pages as Array<{ file: string }>;
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      const html = readFileSync(resolve(root, p.file), 'utf8');
      for (const name of ['head', 'header', 'footer']) expect(html, `${p.file} ${name}`).toMatch(new RegExp(`<!--site:${name}-->[\\s\\S]*<!--/site:${name}-->`));
      expect(html, p.file).toContain('<main id="main"');
    }
  });
});
```

- [ ] **Step 2: 色のテストを書く**（`tests/docs/SiteTokens.test.ts`。モデル色のコントラスト）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../../site/shared/tokens.css'), 'utf8');

/** The declarations of the first rule whose selector line contains `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} in tokens.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]));
}
const lum = (hex: string) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe('tokens.css', () => {
  const dark = block(':root{') ;
  const light = block(':root[data-theme="light"]');
  it.each([['dark', dark], ['light', light]] as const)('%s theme: ink, accent and the three model colours read on the background (>= 4.5:1)', (_n, t) => {
    const bg = (t['--bg'] ?? dark['--bg'])!;
    for (const name of ['--ink', '--ink-2', '--accent', '--model-fable', '--model-opus', '--model-sonnet']) {
      const value = t[name] ?? dark[name];
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(value!, bg), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('the prefers-color-scheme: light block and the data-theme="light" block carry the same values', () => {
    const auto = block(':root:not([data-theme="dark"])');
    for (const [k, v] of Object.entries(light)) expect(auto[k], k).toBe(v);
  });
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `npx vitest run tests/docs/SiteShell.test.ts tests/docs/SiteTokens.test.ts`
Expected: FAIL（ファイルが無い）

- [ ] **Step 4: トークンを書く**（`site/shared/tokens.css`。LP の変数が正本。モデル色を足す）

```css
/* pixi-effects site tokens. One definition for every page; the landing page's palette is the reference. */
:root{
  --bg:#0b0d12; --bg-2:#11141b; --bg-3:#171b24;
  --line:rgba(255,255,255,.11); --line-2:rgba(255,255,255,.2);
  --ink:#eceef2; --ink-2:#a3a9b5; --ink-3:#7f8694;
  --accent:#ff5a3c; --on-accent:#0b0d12; --amber:#f2c14e;
  --model-fable:#e7c07a; --model-opus:#b9a8f3; --model-sonnet:#86cdb9;
  --code-bg:#0e1118; --code-ink:#d7dbe3; --code-key:#7fb4ff; --code-str:#f2c14e; --code-num:#ff7a62; --code-com:#7f8694;
  --shadow:0 30px 80px -30px rgba(0,0,0,.8);
  --sans:"Helvetica Neue",Helvetica,"Inter","Segoe UI",Roboto,system-ui,-apple-system,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --gutter:16px; --max:1240px;
  color-scheme:dark;
}
@media (prefers-color-scheme:light){
  :root:not([data-theme="dark"]){
    --bg:#f4f1ea; --bg-2:#fbfaf6; --bg-3:#ebe7dd;
    --line:rgba(20,18,14,.13); --line-2:rgba(20,18,14,.26);
    --ink:#16150f; --ink-2:#5c5a52; --ink-3:#706d64;
    --accent:#c43316; --on-accent:#ffffff; --amber:#e0a526;
    --model-fable:#8a5f0a; --model-opus:#5b46c4; --model-sonnet:#1f7a62;
    --shadow:0 30px 80px -30px rgba(40,30,10,.35);
    color-scheme:light;
  }
}
:root[data-theme="light"]{
  --bg:#f4f1ea; --bg-2:#fbfaf6; --bg-3:#ebe7dd;
  --line:rgba(20,18,14,.13); --line-2:rgba(20,18,14,.26);
  --ink:#16150f; --ink-2:#5c5a52; --ink-3:#706d64;
  --accent:#c43316; --on-accent:#ffffff; --amber:#e0a526;
  --model-fable:#8a5f0a; --model-opus:#5b46c4; --model-sonnet:#1f7a62;
  --shadow:0 30px 80px -30px rgba(40,30,10,.35);
  color-scheme:light;
}
@media (min-width:600px){ :root{--gutter:28px} }
@media (min-width:900px){ :root{--gutter:48px} }
```

注意: `SiteTokens.test.ts` の `block(':root{')` は先頭の `:root{` を取る。`:root:not(...)` や `:root[data-theme=…]` と取り違えないよう、最初の規則を `:root{` で始める書式（空白なし）を守る。

- [ ] **Step 5: 共通の CSS を書く**（`site/shared/site.css`）。LP の現行 CSS から、次の規則を**そのまま**移し、ヘッダーとフッターは下のものに置き換える。

  移す規則（LP の `/* ---------- base ---------- */` の節）: `*,*::before,*::after`、`html`、`body`、`img`、`a`、`a:hover`、`:focus-visible`、`h1,h2,h3,h4`、`p`、`code,pre,kbd`、`code`、`pre code`、`.wrap`、`.mono`、`.sr`、`.skip`、`.skip:focus`、`.btn`（`.btn:hover`、`.btn.primary`、`.btn.primary:hover`、`.btn svg` を含む）、`.dia`、`[hidden]{display:none!important}`。`--gutter` / `--max` の媒体クエリは `tokens.css` に移したので重複させない。`body` は `overflow-x:hidden` を外さない。
  あわせて章見出しの規則（`.ch`、`.ch .n`、`.ch h2`、`.ch .rule`、`.deck` とその子）と、`@media (min-width:900px)` 内の `.ch{…}` `.ch h2{…}` も移す（Examples の節見出しが使う）。

  ヘッダーとフッター（新規）:

```css
/* ---------- site header ---------- */
.top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:8px 18px;min-height:56px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em;text-decoration:none;font-size:16px;white-space:nowrap;flex:none;order:1}
.top nav{display:flex;gap:6px 18px;align-items:center;font-size:14px;order:3;flex-basis:100%;padding-bottom:8px}
.top nav a{text-decoration:none;color:var(--ink-2);padding:6px 0}
.top nav a:hover,.top nav a[aria-current="page"]{color:var(--ink)}
.top nav a[aria-current="page"]{box-shadow:inset 0 -2px 0 var(--accent)}
.top nav .only-wide{display:none}
.theme{order:2;margin-left:auto;font:inherit;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;background:none;border:1px solid var(--line);color:var(--ink-3);border-radius:999px;padding:4px 9px;cursor:pointer}
.theme:hover{color:var(--ink);border-color:var(--line-2)}
@media (min-width:600px){
  .top .wrap{flex-wrap:nowrap}
  .top nav{order:2;flex-basis:auto;margin-left:auto;padding-bottom:0}
  .top nav .only-wide{display:inline}
  .theme{order:3;margin-left:0}
}
/* ---------- site footer ---------- */
.site-foot{margin-top:80px;border-top:1px solid var(--line);padding:36px 0 48px;font-size:14.5px;color:var(--ink-2)}
.site-foot .wrap{display:grid;gap:18px}
.site-foot .links{display:flex;flex-wrap:wrap;gap:8px 20px}
.site-foot .links a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line-2)}
.site-foot .links a:hover{border-color:var(--accent)}
.site-foot .end{font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:var(--ink-3);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
@media (prefers-reduced-motion:reduce){ html{scroll-behavior:auto} }
```

  GitHub のリンクは `.only-wide`（幅 600 以上だけ表示）。小画面ではフッターの GitHub で足りる。

- [ ] **Step 6: テーマ切替を書く**（`site/shared/site.js`。LP の切替をそのまま移す。保存キー `pe-theme`）

```js
// Theme toggle shared by every page: auto -> light -> dark -> auto, remembered in this browser.
(function () {
  var root = document.documentElement, btn = document.getElementById('themeBtn'), order = ['auto', 'light', 'dark'], cur = 'auto';
  if (!btn) return;
  try { cur = localStorage.getItem('pe-theme') || 'auto'; } catch (e) { /* storage blocked */ }
  function label(t) { btn.textContent = t; btn.setAttribute('aria-label', 'Colour theme: ' + t + '. Click to change'); }
  function apply(t) {
    cur = t;
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    label(t);
    try { localStorage.setItem('pe-theme', t); } catch (e) { /* storage blocked */ }
  }
  apply(cur);
  btn.addEventListener('click', function () { apply(order[(order.indexOf(cur) + 1) % order.length]); });
})();
```

- [ ] **Step 7: 断片の正本を書く**（`scripts/site-parts.mjs`）

```js
// The parts every page shares: the <head> links, the header and the footer. This file is the one place to change the navigation;
// `npm run site:sync` writes the result into the pages between their <!--site:…--> markers (a test fails when a page is stale).
export const REPO = 'https://github.com/yjmtmtk/pixi-effects';
export const NPM = 'https://www.npmjs.com/package/pixi-effects';

/** The entrances, with their address from the site root. */
export const NAV = [
  { id: 'guide', label: 'Guide', href: 'guide/' },
  { id: 'gallery', label: 'Gallery', href: 'examples/gallery/' },
  { id: 'examples', label: 'Examples', href: 'examples/' },
  { id: 'playground', label: 'Playground', href: 'examples/playground.html' },
];

export const rootPrefix = (depth) => '../'.repeat(depth);

export function renderHead({ root }) {
  const s = `${root}site/shared/`;
  return [
    `<link rel="stylesheet" href="${s}tokens.css">`,
    `<link rel="stylesheet" href="${s}site.css">`,
    `<script>try{var t=localStorage.getItem('pe-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`,
    `<script src="${s}site.js" defer></script>`,
  ].join('\n');
}

export function renderHeader({ root, current = '' }) {
  const cur = (id) => (id === current ? ' aria-current="page"' : '');
  const links = NAV.map((n) => `<a href="${root}${n.href}"${cur(n.id)}>${n.label}</a>`).join('\n      ');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${root}"${cur('home')}><span class="dia" aria-hidden="true"></span>pixi-effects</a>
    <nav aria-label="Site">
      ${links}
      <a class="only-wide" href="${REPO}">GitHub</a>
    </nav>
    <button class="theme" type="button" id="themeBtn" aria-label="Colour theme: auto. Click to change">auto</button>
  </div>
</header>`;
}

export function renderFooter({ root }) {
  const ex = (p) => `${root}examples/${p}`;
  return `<footer class="site-foot">
  <div class="wrap">
    <p class="links">
      <a href="${REPO}">GitHub</a>
      <a href="${NPM}">npm: pixi-effects</a>
      <a href="${root}guide/">Guide</a>
      <a href="${ex('gallery/')}">Gallery</a>
      <a href="${ex('')}">Examples</a>
      <a href="${ex('playground.html')}">Playground</a>
      <a href="${ex('music-lab.html')}">Music lab</a>
      <a href="${REPO}/blob/main/ai/SKILL.md">AI skill</a>
      <a href="${root}llms.txt">llms.txt</a>
    </p>
    <p class="end"><span class="dia" aria-hidden="true"></span><span>pixi-effects · MIT · built on PixiJS v8, GSAP and mediabunny</span></p>
  </div>
</footer>`;
}
```

- [ ] **Step 8: 同期ツールを書く**（`scripts/sync-site.mjs`）と、ページ一覧（`site/pages.json`）

```js
// Writes the shared parts into every page listed in site/pages.json, between its <!--site:NAME-->…<!--/site:NAME--> markers.
//   node scripts/sync-site.mjs            write
//   node scripts/sync-site.mjs --check    write nothing; exit 1 and list the pages that are out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderFooter, renderHead, renderHeader, rootPrefix } from './site-parts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Extra regions a page may ask for in site/pages.json (`regions: ["examples-list"]`): name → (ctx) => html. Filled by Task 5. */
export const REGIONS = {};

export function syncSite({ root = ROOT, check = false } = {}) {
  const { pages } = JSON.parse(readFileSync(join(root, 'site/pages.json'), 'utf8'));
  const stale = [], written = [];
  for (const page of pages) {
    const file = join(root, page.file);
    const depth = page.file.split('/').length - 1;
    const ctx = { root: rootPrefix(depth), current: page.current ?? '', root_dir: root, page };
    const parts = { head: renderHead(ctx), header: renderHeader(ctx), footer: renderFooter(ctx) };
    for (const name of page.regions ?? []) {
      if (!REGIONS[name]) throw new Error(`${page.file}: unknown region "${name}"`);
      parts[name] = REGIONS[name](ctx);
    }
    const before = readFileSync(file, 'utf8');
    let html = before;
    for (const [name, body] of Object.entries(parts)) {
      const re = new RegExp(`(<!--site:${name}-->)[\\s\\S]*?(<!--/site:${name}-->)`);
      if (!re.test(html)) throw new Error(`${page.file}: no <!--site:${name}-->…<!--/site:${name}--> markers (add them where the part belongs)`);
      html = html.replace(re, (_m, open, close) => `${open}\n${body}\n${close}`);
    }
    if (html !== before) { stale.push(page.file); if (!check) { writeFileSync(file, html); written.push(page.file); } }
  }
  return { stale, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const { stale, written } = syncSite({ check });
  if (check && stale.length) { console.error(`out of date (run \`npm run site:sync\`): ${stale.join(', ')}`); process.exit(1); }
  console.log(check ? 'site parts are up to date' : written.length ? `synced: ${written.join(', ')}` : 'nothing to sync');
}
```

`site/pages.json`（Task 2 時点では空。ページは Task 3 以降で足す）:

```json
{ "pages": [] }
```

`SiteShell.test.ts` の「every page lists the markers」は `pages.length > 0` を要求するので、**Task 3 でページを足した後に通す**。この時点では `expect(pages.length).toBeGreaterThan(0)` の 1 行をコメントアウトせず、下の Step 9 で期待を調整する。

- [ ] **Step 9: 実行**

`package.json` の `scripts` に `"site:sync": "node scripts/sync-site.mjs"` を足す。`scripts/stage-site.mjs` の `copy('site/landing/index.html', 'index.html')` の下に `copy('site/shared');` を足す。

Run: `npx vitest run tests/docs/SiteShell.test.ts tests/docs/SiteTokens.test.ts`
Expected: 断片のテストと色のテストは PASS。`every page lists the three markers` だけ FAIL（`pages.length` が 0）。これは Task 3 で `index.html` を登録すると PASS に変わる、**意図した赤**として、このコミットでは `it.skip` にせずに次のタスクへ進めるため、`SiteShell.test.ts` の該当テストの先頭を一時的に `it.todo` ではなく、次の 1 行で守る: `if (pages.length === 0) return; // Task 3 registers the first page`。Task 3 の最初のステップでこの行を削除する。

Run: `npm run test:fast`
Expected: PASS

- [ ] **Step 10: コミット**

```bash
git add site scripts package.json tests/docs/SiteShell.test.ts tests/docs/SiteTokens.test.ts
git commit -m "feat: shared site tokens, styles and parts (head, header, footer) with a sync tool and tests; applied to no page yet

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: LP を共通の規格に載せる（見た目は変えない）

**Files:**
- Move: `site/landing/index.html` → `index.html`（`git mv`）
- Create: `site/landing/landing.css`
- Delete: `site/landing/examples`, `site/landing/guide`（シンボリックリンク）, `scripts/preview-landing.mjs`
- Modify: `index.html`, `site/pages.json`, `scripts/stage-site.mjs`, `package.json`（`landing` スクリプトを削除）, `tests/docs/Landing.test.ts`, `tests/tools/landing.test.ts`, `tests/docs/SiteShell.test.ts`（Task 2 の 1 行を削除）, `site/landing/FACTS.md` / `NOTES.md`（パスの記述）, `.gitignore`（`landing-preview/` を削除）
- 他に `site/landing` を参照する所は `grep -rn "site/landing\|landing-preview\|preview-landing" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs` で洗い出して直す（CHANGELOG の過去の記述は直さない）。

**Interfaces:**
- Consumes: Task 2 の印と `syncSite`、`tokens.css` / `site.css` / `site.js`。
- Produces: LP の固有 CSS は `site/landing/landing.css`（`<link rel="stylesheet" href="site/landing/landing.css">` を `<!--/site:head-->` の直後に置く）。LP のスクロール進行バー `#playhead` は LP に残る。

- [ ] **Step 1: 移す前の見た目を撮る**（比較の基準。スクラッチパッドに保存）

`/private/tmp/claude-501/-Users-tomotakayajima-Desktop-yjm-git-pixi-effects/9992fddd-ecd8-482b-ae14-d182fd9ecfc2/scratchpad/shoot.mjs` を書く:

```js
// node shoot.mjs <url> <out.png> <width> [height]   full-page screenshot with the repo's own Chrome helpers
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = '/Users/tomotakayajima/Desktop/yjm/git/pixi-effects';
const check = await import(join(root, 'ai/tools/check.mjs'));
const [url, out, w = '1440', h = '900'] = process.argv.slice(2);
const { server, port } = await check.serve(root);
const { proc, cdp } = await check.launchChrome(check.findChrome(), mkdtempSync(join(tmpdir(), 'shoot-')));
try {
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 });
  await cdp.send('Page.navigate', { url: url.replace('PORT', port) });
  await check.sleep(2500);
  const m = await cdp.send('Page.getLayoutMetrics');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: +w, height: Math.min(m.cssContentSize.height, 12000), scale: 1 } });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('overflow-x:', await cdp.eval('document.documentElement.scrollWidth - innerWidth'));
} finally { proc.kill(); server.close(); }
```

Run（旧 LP は `site/landing/index.html`。シンボリックリンクがあるので画像も出る）:
`node <scratchpad>/shoot.mjs http://127.0.0.1:PORT/site/landing/index.html <scratchpad>/lp-before-1440.png 1440` と `… lp-before-390.png 390 844`
Expected: 2 枚の PNG と `overflow-x: 0`。

- [ ] **Step 2: 印と固有 CSS へ分ける**

1. `git mv site/landing/index.html index.html`。`git rm site/landing/examples site/landing/guide scripts/preview-landing.mjs`。
2. `index.html` の `<style>…</style>` を次のように分ける。**規則の中身は変えない**（移すだけ）:
   - `/* ---------- tokens ---------- */` の節 → すでに `tokens.css` にある。削除。
   - `/* ---------- base ---------- */` の節 → すでに `site.css` にある。削除。
   - `/* ---------- top bar + playhead ---------- */` のうち `#playhead` の 1 規則だけ `landing.css` に残す。`.top …` `.brand …` `.tc …` `.theme …` `.only-wide` の規則は削除（新しいヘッダーが `site.css` にある）。
   - `/* ---------- footer ---------- */` の節 → 削除（`.site-foot` に置き換わる）。LP の長い紹介文とバージョン行は、共通のフッターの**直前**の `<div class="colophon wrap">…</div>` に移し、`landing.css` に `.colophon{border-top:1px solid var(--line);padding:36px 0 0;color:var(--ink-2);font-size:14.5px;display:grid;gap:12px}` と `.colophon .end{…}`（旧 `footer .end` の規則）を足す。
   - 残り（hero、comp、tl、prompt、steps、cards、loop、shots、chat、feature、masonry、cmp、choose、ways、status、レスポンシブ、`#player`、`prefers-reduced-motion`）→ そのまま `site/landing/landing.css` へ。`@media (min-width:600px)` / `(min-width:900px)` の中の `:root{--gutter:…}` `.brand .ver` `.top nav` `.only-wide` の行は削除。
3. `<head>` の `<style>` ブロックを丸ごと消し、`<title>` のあと（`<link rel="icon">` の前後どちらでもよい）に次を置く:

```html
<!--site:head-->
<!--/site:head-->
<link rel="stylesheet" href="site/landing/landing.css">
```

4. `<body>` の先頭の `<a class="skip" …>` と `<header class="top">…</header>` を消し、次に置き換える。`<div id="playhead">` はそのまま残す:

```html
<div id="playhead" aria-hidden="true"></div>
<!--site:header-->
<!--/site:header-->
```

5. `<main id="top">` を `<main id="main">` に変える。ページ内の `href="#top"` は `href="#main"` に直す。
6. 旧 `<footer>…</footer>` を削除し、直前に `.colophon`、直後に次を置く:

```html
<!--site:footer-->
<!--/site:footer-->
```

7. 末尾の `<script>` から、テーマ切替のブロック（`// theme toggle` から `btn.addEventListener('click' …)` まで）と、タイムコード（`tc`）の更新を消す。`#playhead` の更新（`ph.style.transform`）は残す。`window.addEventListener('scroll', …)` の呼び出しは残す。
8. LP の中の自サイトへの**絶対 URL**（`https://yjmtmtk.github.io/pixi-effects/examples/…`、`…/guide/`）の `href` / `src` は、相対パス（`examples/…`、`guide/`）に直す。`<link rel="canonical">`、`og:*`、`twitter:*`、コード例として表示する文字列、`window.__GALLERY_BASE` の既定値（JS の中）は絶対のまま。
9. `site/pages.json` を次にして、`npm run site:sync` を実行する:

```json
{ "pages": [ { "file": "index.html", "current": "home" } ] }
```

   `scripts/stage-site.mjs` の LP の行を `copy('index.html'); copy('site/landing/landing.css');` に変える。`package.json` から `"landing": …` を、`.gitignore` から `landing-preview/` を削除する。
10. `tests/docs/SiteShell.test.ts` の `if (pages.length === 0) return;` の行を削除する。

- [ ] **Step 3: LP のテストを新しい配置に合わせる**

`tests/docs/Landing.test.ts`:
- `read('site/landing/index.html')` → `read('index.html')`（ファイル先頭の `html` の読み込みも）。
- 「every picture it links to exists …」のテストを次にする:

```ts
  it('every picture it links to exists, from the repository root (which is the site root)', () => {
    const srcs = [...html.matchAll(/(?:src|data-src|srcset)="((?:examples|guide)\/[^"]+\.(?:jpg|png|webp))"/g)].map(m => m[1]!);
    expect(srcs.length).toBeGreaterThan(15);
    const missing = [...new Set(srcs)].filter(s => !existsSync(resolve(root, s.startsWith('guide/') ? `site/${s}` : s)));
    expect(missing).toEqual([]);
  });
```

  （`guide/assets/…` はリポジトリでは `site/guide/assets/…` にある。ビルド後の並びは Task 1 のリンク検査が見る。）
- 「stays small …」のテストを R3 の通りに直す:

```ts
  it('stays small and loads nothing from third parties at page load (fonts, trackers, libraries): only on a click', () => {
    const css = readFileSync(resolve(root, 'site/landing/landing.css'), 'utf8');
    expect(statSync(resolve(root, 'index.html')).size + css.length).toBeLessThan(130 * 1024);
    for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)) expect(m[0], 'same-site stylesheets only').toMatch(/href="(?!https?:|\/\/)[^"]+"/);
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/gi)) expect(m[1], 'same-site scripts only').not.toMatch(/^(https?:)?\/\//);
    expect(html).not.toMatch(/fonts\.googleapis|google-analytics|googletagmanager/i);
  });
```

- `FACTS.md` と一緒に読むテストが `site/landing/FACTS.md` を指す箇所はそのまま（`FACTS.md` は動かさない）。

`tests/tools/landing.test.ts`: LP を開く URL を `/site/landing/index.html` から `/index.html` に直す（`grep -n "landing/index" tests/tools/landing.test.ts`）。`window.__GALLERY_BASE` の指定は変えない。

- [ ] **Step 4: 見た目と動きを確かめる**

Run: `npx vitest run tests/docs tests/tools/landing.test.ts`
Expected: PASS（LP の実ブラウザ検査 2 本を含む）。`the staged site … has no broken local link` も PASS。

Run: `node <scratchpad>/shoot.mjs http://127.0.0.1:PORT/index.html <scratchpad>/lp-after-1440.png 1440` と 390 版。
Expected: `overflow-x: 0`。Read ツールで before/after の PNG を見比べ、**ヘッダー以外**が同じであることを確かめる（ヒーロー、各章、ギャラリーの帯、比較表、フッター）。違いがあれば、移した CSS の取りこぼしなので `landing.css` を直す。幅 390 ではヘッダーが 2 段（上段: ブランドとテーマ、下段: リンク 4 つ）になっていて、リンクが画面内に収まっていること。ヒーローの代わりにテーマを `light` に切り替えた 1440 の 1 枚も撮って見る。

- [ ] **Step 5: 実ブラウザでヘッダーを測る**（`tests/tools/siteShell.test.ts`。以降のタスクがページを足していく）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** Pages that carry the shared header, and the nav entry each one marks as current. */
const PAGES: Array<[string, string]> = [['index.html', '']];   // each later task adds its pages

async function withPage<T>(path: string, width: number, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'shell-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${path}` });
    await check.sleep(1200);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the shared header, in a real browser', () => {
  for (const width of [390, 1440]) {
    it.each(PAGES)(`%s at ${width}px: the four entrances are all on screen, nothing scrolls sideways`, async (path) => {
      await withPage(path, width, async (cdp) => {
        const r = await cdp.eval(`(() => {
          const links = [...document.querySelectorAll('header.top nav a')].filter(a => a.offsetParent);
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            names: links.map(a => a.textContent.trim()),
            inside: links.every(a => { const b = a.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.height > 0; }),
            main: !!document.getElementById('main'),
          };
        })()`);
        expect(r.overflow).toBeLessThanOrEqual(0);
        expect(r.names).toEqual(expect.arrayContaining(['Guide', 'Gallery', 'Examples', 'Playground']));
        expect(r.inside).toBe(true);
        expect(r.main).toBe(true);
      });
    });
  }

  it.each(PAGES)('%s: the theme button switches the page to light and the colour really changes', async (path) => {
    await withPage(path, 1440, async (cdp) => {
      const before = await cdp.eval(`getComputedStyle(document.body).backgroundColor`);
      await cdp.eval(`(() => { const b = document.getElementById('themeBtn'); b.click(); })()`);   // auto -> light
      const after = await cdp.eval(`({ bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.getAttribute('data-theme') })`);
      expect(after.theme).toBe('light');
      expect(after.bg).not.toBe(before);
    });
  });
});
```

Run: `npx vitest run tests/tools/siteShell.test.ts`
Expected: PASS（`prefers-color-scheme` が暗いヘッドレス Chrome で、1 回目のクリックは auto → light）。

- [ ] **Step 6: 全テストとコミット**

Run: `npx vitest run`
Expected: すべて PASS。

```bash
git add -A
git commit -m "feat: the landing page moves to the repository root and uses the shared tokens, styles and header; no symlinks, no preview script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Guide を共通の規格に載せる

**Files:**
- Create: `site/guide/guide.css`
- Modify: `scripts/build-guide.mjs`, `package.json`（`guide` スクリプトは変えない）, `tests/docs/Guide.test.ts`, `tests/tools/siteShell.test.ts`（`PAGES` に Guide を足す）

**Interfaces:**
- Consumes: `renderHead/Header/Footer`、`rootPrefix`（Task 2）。
- Produces: `buildGuide` が `guide.css` を出力先に書く。各ページに共通の head/header/footer が入る。

- [ ] **Step 1: テストを足す**（`tests/docs/Guide.test.ts` の `describe('build-guide: assets', …)` の直後に）

```ts
describe('build-guide: the shared shell', () => {
  it('every page carries the shared head, header and footer, the guide styles, and the guide entrance is current', async () => {
    const out = mkdtempSync(join(tmpdir(), 'guide-'));
    const { pages } = await buildGuide({ srcDir: guideDir, outDir: out });
    expect(existsSync(join(out, 'guide.css'))).toBe(true);
    for (const p of pages as Array<{ file: string }>) {
      const html = readFileSync(join(out, `${p.file}.html`), 'utf8');
      expect(html, p.file).toContain('href="../site/shared/tokens.css"');
      expect(html, p.file).toContain('href="guide.css"');
      expect(html, p.file).toContain('<main id="main"');
      expect(html, p.file).toMatch(/<a href="\.\.\/guide\/" aria-current="page">Guide<\/a>/);
      expect(html, p.file).toContain('class="site-foot"');
      expect(html, p.file).not.toContain('<style>');
    }
  });
});
```

Run: `npx vitest run tests/docs/Guide.test.ts`
Expected: 新しいテストが FAIL。

- [ ] **Step 2: Guide 固有の CSS を作る**（`site/guide/guide.css`）

`build-guide.mjs` の `const CSS = \`…\`` の中身から、次の規則**だけ**を移す: `html{scroll-padding-top}`、`.layout`、`aside.side …`、`details.mobile-nav`、`article …`（見出し・コード・表・引用・図・`facade`・`demo`）、`nav.pager …`、`.toc …`、レスポンシブの `@media (max-width: 860px)`。`:root{…}` の変数、`* {box-sizing}`、`body`、`a`、`header.top …`、`footer.foot` の規則は削除（共通側にある）。色の変数は共通のトークンに置き換える:

| 旧 | 新 |
|---|---|
| `var(--panel)` | `var(--bg-2)` |
| `var(--dim)` | `var(--ink-2)` |
| `var(--code)` | `var(--bg-3)` |
| `var(--code-ink)` | `var(--code-ink)`（同名、トークンにある） |
| `var(--accent-ink)` | `var(--on-accent)` |
| `var(--demo)` | `#000` |
| `var(--accent)` | `var(--accent)` |
| `var(--line)`, `var(--ink)`, `var(--bg)` | 同名 |

  `article pre` の背景は、ライトでも暗いコード面にそろえる: `background:var(--code-bg);color:var(--code-ink)`。`font:` の指定は `var(--sans)` / `var(--mono)` に置き換える。サイドバーの幅 240px、本文の最大幅 780px は変えない。`@media (max-width:860px)` の中の `header.top nav.links{display:none}` は削除（共通ヘッダーが小画面で 2 段になるため）。

- [ ] **Step 3: ビルドスクリプトを変える**（`scripts/build-guide.mjs`）

- 先頭の import に `import { renderFooter, renderHead, renderHeader } from './site-parts.mjs';` を足す。
- `const CSS = …` と、`pageHtml` の中の `<style>${CSS}</style>`、旧 `<header class="top">…</header>`、旧 `<footer class="foot">…</footer>` を消す。`FACADE_JS` / `COPY_JS` はそのまま。
- `pageHtml` の戻り値の骨組みを次にする（出力先は `<site>/guide/` なので、サイトのルートへは `../`）:

```js
  const ctx = { root: '../', current: 'guide' };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.meta.title)} — pixi-effects guide</title>
<meta name="description" content="${esc(page.meta.summary || 'pixi-effects guide')}">
${renderHead(ctx)}
<link rel="stylesheet" href="guide.css">
</head>
<body>
${renderHeader(ctx)}
<details class="mobile-nav"><summary>Menu</summary>${navHtml(pages, page.file)}</details>
<div class="layout"><aside class="side">${navHtml(pages, page.file)}</aside>
<main id="main"><article>
<h1>${esc(page.meta.title)}</h1>
${summary}${tocHtml}
${rendered.html}
<nav class="pager">…（いまのまま）…</nav>
</article></main></div>
${renderFooter(ctx)}
<script>${COPY_JS}
${FACADE_JS}</script>
</body></html>
`;
```

- `buildGuide` の最後（ページを書き終えたあと）に、`copyFileSync(join(srcDir, 'guide.css'), join(outDir, 'guide.css'));` を足す（`copyFileSync` を `node:fs` の import に足す）。
- `site/guide/*.md` を読む処理が `guide.css` を拾わないこと（`.md` だけ読んでいるので問題なし）。

- [ ] **Step 4: 確かめる**

`tests/tools/siteShell.test.ts` の `PAGES` にはビルド済みの Guide が要る。リポジトリ直下のサーバーで見るため、`npm run guide`（`guide-preview/` に出力）を使う。`PAGES` に `['guide-preview/getting-started.html', '']` を足す前に、テストの先頭で `await import(…build-guide.mjs)` で `guide-preview/` を作る（`beforeAll`）。

```ts
import { buildGuide } from '../../scripts/build-guide.mjs';   // @ts-expect-error を付ける
// describe の中:
beforeAll(async () => { await buildGuide({ srcDir: join(root, 'site/guide'), outDir: join(root, 'guide-preview'), root }); });
```

Run: `npx vitest run tests/docs tests/tools/siteShell.test.ts`
Expected: PASS。Guide の既存テスト（リンク・ナビ・ページャー・デモ）もすべて PASS。

撮影: `node <scratchpad>/shoot.mjs http://127.0.0.1:PORT/guide-preview/getting-started.html <scratchpad>/guide-after-1440.png 1440` と 390、`cookbook.html`（ライブデモあり）の 1440。Read で見て、サイドバー・ページャー・コードブロック・デモ枠が崩れていないこと、暗いテーマでも明るいテーマでも本文が読めることを確かめる。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: the guide uses the shared tokens, header and footer; its own styles live in guide.css

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Examples の入口・music lab・Playground を共通の規格に載せる

**Files:**
- Create: `examples/examples.json`, `examples/examples.css`, `tests/docs/ExamplesIndex.test.ts`
- Modify: `examples/index.html`, `examples/music-lab.html`, `examples/playground.html`, `site/pages.json`, `scripts/sync-site.mjs`（`REGIONS` に `examples-list`）, `tests/tools/siteShell.test.ts`

**Interfaces:**
- Consumes: Task 2 の `REGIONS`、印。
- Produces: `examples/examples.json` = `{ "examples": [{ "id": "01", "file": "01-hello.html", "title": "hello", "blurb": "…" }, …] }`。`REGIONS['examples-list']` がカードの一覧 HTML を書く。

- [ ] **Step 1: 入口のテストを書く**（`tests/docs/ExamplesIndex.test.ts`）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const { examples } = JSON.parse(readFileSync(resolve(root, 'examples/examples.json'), 'utf8')) as { examples: Array<{ id: string; file: string; title: string; blurb: string }> };

describe('examples/examples.json (the Examples entrance)', () => {
  it('lists every numbered example file, in order, and nothing that is missing', () => {
    const files = readdirSync(resolve(root, 'examples')).filter((f) => /^\d\d-.*\.html$/.test(f)).sort();
    expect(examples.filter((e) => /^\d\d$/.test(e.id)).map((e) => e.file)).toEqual(files);
    for (const e of examples) expect(existsSync(resolve(root, 'examples', e.file)), e.file).toBe(true);
  });
  it('every entry has a title and a one-line blurb', () => {
    for (const e of examples) { expect(e.title.length, e.file).toBeGreaterThan(0); expect(e.blurb.length, e.file).toBeGreaterThan(10); }
  });
  it('the index page shows every entry (run `npm run site:sync` after editing the list)', () => {
    const html = readFileSync(resolve(root, 'examples/index.html'), 'utf8');
    for (const e of examples) expect(html, e.file).toContain(`href="${e.file}"`);
  });
});
```

- [ ] **Step 2: 一覧データを書く**（`examples/examples.json`。題と一行は旧ページの文言から。`music-lab` と `playground` は番号なしの ID）

```json
{ "examples": [
  { "id": "01", "file": "01-hello.html", "title": "hello", "blurb": "The smallest composition that plays: one text layer and a fade." },
  { "id": "02", "file": "02-keyframes.html", "title": "keyframes & expressions", "blurb": "Animate any property, and write values as expressions such as GW/2." },
  { "id": "03", "file": "03-shapes.html", "title": "shapes", "blurb": "Rectangles, circles, lines, polygons and SVG paths." },
  { "id": "04", "file": "04-media.html", "title": "media", "blurb": "Images, video and audio files as layers." },
  { "id": "05", "file": "05-composition-mask.html", "title": "composition & mask", "blurb": "Nest a composition in a layer and cut it with a mask." },
  { "id": "06", "file": "06-filters.html", "title": "filters", "blurb": "Blur, glow and colour effects by name." },
  { "id": "07", "file": "07-transitions.html", "title": "transitions", "blurb": "Wipes, fades and slides between scenes." },
  { "id": "08", "file": "08-presets-export.html", "title": "presets & export", "blurb": "Ready-made motion, then an MP4 from the browser." },
  { "id": "09", "file": "09-audio.html", "title": "audio", "blurb": "Multi-track sound with ducking." },
  { "id": "10", "file": "10-three.html", "title": "three.js layer", "blurb": "A three.js scene as one layer." },
  { "id": "11", "file": "11-depth.html", "title": "depth & camera", "blurb": "2.5D: layers in depth and a camera that moves through them." },
  { "id": "12", "file": "12-title-motion.html", "title": "title motion", "blurb": "A 2.5D title sequence." },
  { "id": "13", "file": "13-sfx.html", "title": "sound effects", "blurb": "Sound effects synthesised in the browser, no files." },
  { "id": "14", "file": "14-draw-on.html", "title": "draw-on strokes, changing text", "blurb": "Strokes that draw themselves and text that changes over time." },
  { "id": "15", "file": "15-custom-player.html", "title": "your own player", "blurb": "Build a player with the movie's events and theme." },
  { "id": "music-lab", "file": "music-lab.html", "title": "music lab", "blurb": "Eight tunes written as text and played by the built-in synthesiser." },
  { "id": "playground", "file": "playground.html", "title": "playground", "blurb": "Edit a composition and run it in the page." }
] }
```

  各ブラーブは、対応する `examples/NN-*.html` の `<title>` と本文を実際に読んで、事実に合っているか確かめてから確定する（上の文は旧ページの題からの推定。違っていれば直す）。

- [ ] **Step 3: 一覧の描画を足す**（`scripts/sync-site.mjs` の `REGIONS` を埋める）

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// …
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

REGIONS['examples-list'] = ({ root_dir }) => {
  const { examples } = JSON.parse(readFileSync(join(root_dir, 'examples/examples.json'), 'utf8'));
  const card = (e) => `<li><a class="ex" href="${esc(e.file)}"><span class="n">${/^\d\d$/.test(e.id) ? e.id : '♪'}</span><b>${esc(e.title)}</b><span>${esc(e.blurb)}</span></a></li>`;
  const numbered = examples.filter((e) => /^\d\d$/.test(e.id)), more = examples.filter((e) => !/^\d\d$/.test(e.id));
  return `<ol class="ex-grid">\n${numbered.map(card).join('\n')}\n</ol>\n<h2 class="ex-more">More</h2>\n<ol class="ex-grid">\n${more.map(card).join('\n')}\n</ol>`;
};
```

  （`REGIONS` の定義より後ろに置く。`esc` は同じファイル内で 1 回だけ宣言する。）

- [ ] **Step 4: 入口のページを作り直す**（`examples/index.html`）

内容: `<head>` に `<meta charset>`、viewport、`<title>pixi-effects · examples</title>`、description（今のまま）、`<!--site:head--><!--/site:head-->`、`<link rel="stylesheet" href="examples.css">`。`<body>` は `<!--site:header-->…`、`<main id="main" class="wrap">`（`<h1>Examples</h1>`、一行の説明、`<!--site:examples-list--><!--/site:examples-list-->`）、`<!--site:footer-->…`。`examples/examples.css` に、カードの規則を書く（トークンだけ使う）:

```css
.ex-intro{color:var(--ink-2);max-width:62ch;margin:12px 0 0;font-size:17px}
main.wrap{padding-top:48px}
.ex-grid{list-style:none;margin:32px 0 0;padding:0;display:grid;grid-template-columns:1fr;gap:12px}
.ex{display:grid;gap:4px;padding:16px 18px;border:1px solid var(--line);border-radius:10px;background:var(--bg-2);text-decoration:none;color:var(--ink);height:100%}
.ex:hover{border-color:var(--accent)}
.ex .n{font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--accent)}
.ex b{font-size:18px;letter-spacing:-.01em}
.ex span:last-child{color:var(--ink-2);font-size:14.5px}
.ex-more{font-size:22px;margin-top:40px}
@media (min-width:600px){.ex-grid{grid-template-columns:1fr 1fr}}
@media (min-width:900px){.ex-grid{grid-template-columns:1fr 1fr 1fr}}
```

  `h1` は `font-size:clamp(36px,6vw,64px)`（`examples.css` に 1 行）。

  `site/pages.json` に足す:

```json
{ "file": "examples/index.html", "current": "examples", "regions": ["examples-list"] }
```

- [ ] **Step 5: music lab と Playground にヘッダーを載せる**

`examples/music-lab.html`: `<style>` の `:root{…}` と `@media (prefers-color-scheme: light)` の変数、`body` の色・フォントをトークンに置き換える（`--bg` `--panel`→`--bg-2` `--line` `--ink` `--dim`→`--ink-2` `--accent` `--accent-ink`→`--on-accent`）。`<head>` に印と共通の head を、`<body>` の先頭と末尾に header/footer の印を足し、`<main>` を `<main id="main">` にする。ページの幅 `max-width:860px` はそのまま。`site/pages.json` に `{ "file": "examples/music-lab.html", "current": "examples" }`。

`examples/playground.html`: 全面アプリなので、`body` のグリッド行を `auto auto 1fr auto`（ヘッダー、ツールバー、エディタ+舞台、エラー欄）にし、`html,body{height:100%}` は維持する。ヘッダーは共通。`<main id="main">` は `#editor` と `#stageWrap` を包む要素にせず、**ツールバーの下の 2 カラムの領域**に付ける（`display:contents` の `<main id="main" style="display:contents">`）。フッターは置かない（アプリ画面）。`footer` の印は不要だが `SiteShell.test.ts` が 3 つの印を要求するので、Playground だけ `pages.json` に `"parts": ["head","header"]` を持たせて `syncSite` と `SiteShell.test.ts` を「`parts` があればそれだけ」にする（`const names = page.parts ?? ['head','header','footer']`）。色は `#0d1220` 等をトークンへ（`background:var(--bg)`、ツールバーは `var(--bg-2)`、枠は `var(--line)`）。CodeMirror は `oneDark` のまま（明るいテーマでもエディタは暗い。仕様の範囲外）。`site/pages.json` に `{ "file": "examples/playground.html", "current": "playground", "parts": ["head", "header"] }`。

- [ ] **Step 6: 同期して確かめる**

Run: `npm run site:sync`、続けて `npx vitest run tests/docs tests/tools/siteShell.test.ts`
Expected: PASS。`tests/tools/siteShell.test.ts` の `PAGES` に `examples/index.html`、`examples/music-lab.html`、`examples/playground.html` を足す。Playground は 390 でエディタ欄が縦に積まれる既存の動きを壊さないこと（撮影して Read で確認）。

撮影: `examples/index.html`（1440/390、暗い/明るい）、`examples/music-lab.html`（1440）、`examples/playground.html`（1440/390）。music lab の再生ボタンと Playground の実行（Run）は、ヘッドレス Chrome で `document.querySelector('#run').click()` 後にエラー欄 `#err` が空であることを `cdp.eval` で確かめる。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: the Examples entrance (a list kept in examples.json), the music lab and the playground use the shared header and tokens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ギャラリーを LP の部品で作り直す

**Files:**
- Create: `examples/gallery/gallery.css`, `tests/tools/gallery.test.ts`
- Modify: `examples/gallery/index.html`, `site/pages.json`, `tests/tools/siteShell.test.ts`

**Interfaces:**
- Consumes: 共通のトークン（`--model-*` を含む）・`.btn`・`.dia`・`.ch`、印。`examples/gallery/pieces.json` の形（変えない）。
- Produces: 挙動は据え置き（R4）。DOM の id とクラスのうち JS が使うものは変えない: `#filters` `#model-seg` `#tag-chips` `#count` `#grid` `#empty` `#error` `#hero-sub` `#theatre` `#th-stage` `#th-box` `#th-cap` `#th-title` `#th-sub` `#th-meta` `#th-count` `#th-open` `#th-notes`、`[data-close]` `[data-prev]` `[data-next]`、`.th-play` `.th-close` `.th-btn`、`.piece`（`<li>` の `data-id`）。

- [ ] **Step 1: 特性テストを先に書く**（`tests/tools/gallery.test.ts`。旧版で通ることを確かめる）

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const pieces = JSON.parse(readFileSync(join(root, 'examples/gallery/pieces.json'), 'utf8')).pieces as Array<{ id: string; model: string }>;

async function withGallery<T>(hash: string, width: number, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'gallery-'));
  const { proc, cdp } = await check.launchChrome(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/gallery/${hash}` });
    for (let i = 0; i < 60; i++) { if (await cdp.eval(`document.querySelectorAll('#grid .piece').length`).catch(() => 0)) break; await check.sleep(150); }
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the gallery, in a real browser (behaviour that must survive any restyle)', () => {
  it('shows one tile per piece, and nothing scrolls sideways at 390 and 1440', async () => {
    for (const w of [390, 1440]) {
      await withGallery('', w, async (cdp) => {
        const r = await cdp.eval(`({ tiles: document.querySelectorAll('#grid .piece').length, overflow: document.documentElement.scrollWidth - innerWidth })`);
        expect(r.tiles).toBe(pieces.length);
        expect(r.overflow).toBeLessThanOrEqual(0);
      });
    }
  });

  it('a model filter keeps only that model\'s pieces, and "all" brings every piece back', async () => {
    await withGallery('', 1440, async (cdp) => {
      const model = pieces.find((p) => p.model === 'opus') ? 'opus' : pieces[0]!.model;
      const want = pieces.filter((p) => p.model === model).length;
      await cdp.eval(`document.querySelector('#model-seg button[data-model="${model}"]').click()`);
      await check.sleep(300);
      expect(await cdp.eval(`[...document.querySelectorAll('#grid .piece')].filter(li => !li.hidden && li.offsetParent).length`)).toBe(want);
      await cdp.eval(`document.querySelector('#model-seg button[data-model="all"]').click()`);
      await check.sleep(300);
      expect(await cdp.eval(`[...document.querySelectorAll('#grid .piece')].filter(li => !li.hidden && li.offsetParent).length`)).toBe(pieces.length);
    });
  });

  it('a click on a tile opens the theatre with that piece (and #id in the address); Escape closes it', async () => {
    await withGallery('', 1440, async (cdp) => {
      const id = await cdp.eval(`document.querySelector('#grid .piece').dataset.id`);
      await cdp.eval(`document.querySelector('#grid .piece a, #grid .piece button').click()`);
      await check.sleep(600);
      expect(await cdp.eval(`document.getElementById('theatre').open`)).toBe(true);
      expect(await cdp.eval(`location.hash`)).toBe(`#${id}`);
      expect(await cdp.eval(`document.getElementById('th-title').textContent.length > 0`)).toBe(true);
      await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      await check.sleep(400);
      expect(await cdp.eval(`document.getElementById('theatre').open`)).toBe(false);
    });
  });

  it('a #id in the address opens that piece at once; next / previous move between pieces', async () => {
    const id = pieces[1]!.id;
    await withGallery(`#${id}`, 1440, async (cdp) => {
      await check.sleep(600);
      expect(await cdp.eval(`document.getElementById('theatre').open`)).toBe(true);
      const t1 = await cdp.eval(`document.getElementById('th-title').textContent`);
      await cdp.eval(`document.querySelector('.th-nav.next, [data-next]').click()`);
      await check.sleep(500);
      expect(await cdp.eval(`document.getElementById('th-title').textContent`)).not.toBe(t1);
    });
  });
});

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the gallery uses the shared shell', () => {
  it('has the shared header (four entrances, Gallery current), the shared footer and the model colours from the tokens', async () => {
    await withGallery('', 1440, async (cdp) => {
      const r = await cdp.eval(`({
        current: document.querySelector('header.top nav a[aria-current="page"]')?.textContent,
        footer: !!document.querySelector('footer.site-foot'),
        main: !!document.getElementById('main'),
        tokens: getComputedStyle(document.documentElement).getPropertyValue('--model-opus').trim(),
        sheets: [...document.styleSheets].map(s => s.href || '').filter(Boolean).map(h => h.split('/').slice(-2).join('/')),
      })`);
      expect(r.current).toBe('Gallery');
      expect(r.footer).toBe(true);
      expect(r.main).toBe(true);
      expect(r.tokens).not.toBe('');
      expect(r.sheets).toEqual(expect.arrayContaining(['shared/tokens.css', 'shared/site.css', 'gallery/gallery.css']));
    });
  });
});
```

  タイル内の要素（`a` か `button`）、`[data-model="all"]` の実在、`.th-nav.next` などは、実際の `index.html` の描画関数を読んで合わせる（`sed -n 372,470p examples/gallery/index.html`）。旧版で `the gallery uses the shared shell` 以外がすべて PASS するまで、セレクタをテスト側で直す。

Run: `npx vitest run tests/tools/gallery.test.ts`
Expected: 旧版で、挙動のテスト 4 本は PASS、`uses the shared shell` は FAIL。

- [ ] **Step 2: 見た目の基準を撮る**

`shoot.mjs` で `examples/gallery/` の 1440/390、`examples/gallery/#<2 番目の id>`（theatre 開）の 1440 を `gallery-before-*.png` に保存。

- [ ] **Step 3: CSS を分ける**

1. `examples/gallery/index.html` の `<style>…</style>` の中身を `examples/gallery/gallery.css` に移す。`:root{…}` の変数（`--bg` `--well` `--ink` `--mute` `--dim` `--line` `--line-strong` `--fable` `--opus` `--sonnet` `--sans` `--mono` `--gutter` `--gap` `--ease` `--cols`）は次の対応で置き換える。`--gap` `--ease` `--cols`（グリッド専用）だけ `gallery.css` の `:root` に残す:

| 旧 | 新 |
|---|---|
| `--bg` | `var(--bg)` |
| `--well` | `var(--bg-2)` |
| `--ink` | `var(--ink)` |
| `--mute` | `var(--ink-2)` |
| `--dim` | `var(--ink-3)` |
| `--line` | `var(--line)` |
| `--line-strong` | `var(--line-2)` |
| `--fable` / `--opus` / `--sonnet` | `var(--model-fable)` / `var(--model-opus)` / `var(--model-sonnet)` |
| `--sans` / `--mono` / `--gutter` | 共通トークンと同名 |

   `"Archivo"` の指定は削除（共通の `--sans`）。`body{…}`、`a{…}`、`.wrap{…}`、`.sr{…}` など共通 CSS と重なる規則は削除。旧ヘッダー（`.bar` `.wordmark`）と旧フッターの規則も削除。
2. `<head>` に印と `<link rel="stylesheet" href="gallery.css">` を置く。`<body>` の旧 `<header class="wrap">` のうち `.bar`（ワードマーク + ナビ）を消して共通ヘッダーの印に替え、`.hero`（「Reel」の見出しと紹介文）は `<main id="main">` の先頭に移す（`<div class="wrap hero">`）。旧 `<footer class="wrap">` は共通フッターの印に替える（旧フッターの 3 リンクは共通フッターに含まれている）。`<main>` を `<main id="main">` にする。
3. Reel の見出しを LP の章見出し（`.ch`）の形にそろえる: `<p class="mono">… <span class="dia"></span> Gallery</p>` を見出しの上に置く。フィルタのチップ（`.seg button` / `.tags button`）は `border:1px solid var(--line-2); background:transparent; color:var(--ink-2)`、選択時 `background:var(--accent); color:var(--on-accent); border-color:var(--accent)` にする（LP の `.btn.primary` と同じ配色）。モデル色の点（`.model-dot` 等）は `--model-*` を使う。theatre（`dialog.theatre`）は背景 `var(--bg)`、枠 `var(--line-2)`、閉じるボタンは `.th-btn` のまま色だけトークンに。
4. `site/pages.json` に `{ "file": "examples/gallery/index.html", "current": "gallery" }` を足し、`npm run site:sync`。
5. `tests/tools/siteShell.test.ts` の `PAGES` に `['examples/gallery/index.html', 'Gallery']` を足す。

- [ ] **Step 4: 確かめる**

Run: `npx vitest run tests/tools/gallery.test.ts tests/tools/siteShell.test.ts tests/docs`
Expected: すべて PASS（挙動のテストは旧版と同じ結果、シェルのテストも PASS）。

撮影して Read で比べる: `gallery-after-1440/390`、theatre 開（暗い/明るい）。確認点: タイルの並び（マソンリー）が旧と同じ列数、モデル色がどちらのテーマでも読める、theatre の閉じる/前後ボタンが見える、`#hero-sub` の文が読める。LP の「Watch the gallery」リンクから開いて、ヘッダーの Gallery が強調されること。

- [ ] **Step 5: 全テストとコミット**

Run: `npx vitest run`
Expected: すべて PASS。

```bash
git add -A
git commit -m "feat: the gallery is rebuilt on the shared tokens, header and footer; behaviour is pinned by a real-browser test

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 保守の手引き・記録・最終確認

**Files:**
- Create: `site/README.md`
- Modify: `CHANGELOG.md`（`## Unreleased` の **Site**）, `docs/superpowers/specs/2026-10-08-site-redesign-design.md`（状態を「実装済み」、Rulings R1–R6 を反映）, メモリ `project_state-2026-10-07.md` と `MEMORY.md`

- [ ] **Step 1: 保守の手引きを書く**（`site/README.md`。英語。短く）

内容（見出しと要点）:
- **Layout**: ページの一覧表（URL、ソースのファイル、固有 CSS）。`index.html`（LP、直下）、`site/guide/*.md`（Guide のソース）、`examples/…`。
- **Change the header, footer or navigation**: `scripts/site-parts.mjs` を直し、`npm run site:sync`（`--check` は `test:fast` に入っている）。
- **Add a page**: ページに 3 つの印（`head` / `header` / `footer`）と `<main id="main">` を置き、`site/pages.json` に足し、`npm run site:sync`、`tests/tools/siteShell.test.ts` の `PAGES` に足す。
- **Change colours or fonts**: `site/shared/tokens.css` だけ。`SiteTokens.test.ts` がコントラストを見る。
- **Where a style goes**: 2 つ以上のページが使うなら `site/shared/site.css`、1 ページだけならそのページの CSS（`landing.css` `guide.css` `gallery.css` `examples.css`）。
- **Preview**: リポジトリ直下を静的サーバーで開く（`npx serve .`）。Guide は `npm run guide` で `guide-preview/`。公開と同じ並びは `node scripts/stage-site.mjs _site`。
- **Checks**: `node scripts/site-links.mjs _site`（リンク切れ）。
- **Release**: LP の版番号は本文の数か所にある（`tests/docs/Landing.test.ts` が強制）。

- [ ] **Step 2: CHANGELOG と仕様の更新**

`CHANGELOG.md` の `## Unreleased` に **Site** の項を足す（既存の項は残す）: 5 つの入口、共通の見た目、LP がリポジトリ直下に移ったこと、`stage-site` / リンク検査 / `site:sync`。`docs/superpowers/specs/2026-10-08-site-redesign-design.md` の先頭の「状態」を「承認済み・実装済み（段階 1–4）」にし、末尾に「実装での調整」として R1–R6 を書き写す。

- [ ] **Step 3: 最終確認**

Run: `npm run site:sync -- --check` と `node scripts/stage-site.mjs /tmp/site-final && node scripts/site-links.mjs /tmp/site-final`
Expected: `site parts are up to date`、`no broken local link`。

Run: `npm run release:check`
Expected: 全テスト PASS（実ブラウザ含む）、`release check passed`。

撮影の最終確認: 5 つの入口（LP、Guide、Gallery、Examples、Playground）を 1440 の暗い/明るい、390 の暗いで撮り、Read で 1 枚ずつ見て、ヘッダーとフッターが同じ形であること、どれにも横スクロールが無いことを確かめる。

- [ ] **Step 4: 記録**

メモリ `project_state-2026-10-07.md` に、サイト統一の完了（構成、正本の場所、`site:sync` / `stage-site` / `site-links`、R1 の LP が直下にあること、`release:check`、残りの作業: Playground の作り直し → WebMCP）を追記し、`MEMORY.md` の一行を更新する。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "docs: how to maintain the site (site/README.md), changelog and design memo brought up to date

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**完了の報告に含めること:** Rulings R1–R6（LP が直下へ移った、ヘッダーの見た目が変わった点、LP が単一ファイルでなくなった点を、オーナーに明示する）、push していないこと、公開前に Pages で実機確認する項目（`/`、`/guide/`、`/examples/`、`/examples/gallery/`、`/examples/playground.html` の表示と、`site/shared/` の読み込み）。
