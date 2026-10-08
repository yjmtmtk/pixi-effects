# サイト全体の統一（LP 基準）— 設計メモ

状態: 承認済み・実装済み（段階 1–4。Playground の作り直しと WebMCP は別メモ）。実装での調整は末尾の「実装での調整」。
対象: LP / Guide / Gallery / Examples / Playground（Playground の中身の作り直しと WebMCP は別メモ、ここでは入口だけ決める）。

## 1. 目的

いまのサイトは、LP・ギャラリー・Guide・Examples・Playground を別々の日に単独で作ったため、見た目も部品も作り方も揃っていない。今日の README の「Live demos」が LP に飛んだのも、LP をルートにしたときに旧ルートの一覧ページを黙って消してしまったのが原因で、全体を見る仕組みがないために起きた。

目標は 3 つ。

1. **同じ規格**: 全ページが同じ色・書体・ヘッダー・フッター・部品（ボタン、章見出し、カード、コードブロック、タグ、プレイヤー）を使う。基準は LP。
2. **迷わない構造**: 入口が 5 つで、どのページからも他の 4 つへ 1 クリックで行ける。
3. **壊れたら気づける**: 内部リンク切れ・共通部品のずれをテストで検出する。

やらないこと: Guide の本文（markdown）の書き直し、ギャラリー各作品ページの見た目の変更（作品は作品）、ライブラリ本体の変更、フレームワークの導入。

## 2. 現状（調べた事実）

| ページ | 場所 | 見た目の系統 | 作り方 |
|---|---|---|---|
| LP | `site/landing/index.html`（968 行） | 暗い #0b0d12 / 明るい #f4f1ea、朱 #ff5a3c、Helvetica | 1 ファイルに CSS・JS 内蔵、手書き |
| Guide | `site/guide/*.md` → `scripts/build-guide.mjs`（CSS 内蔵） | 明るい #fbfaf7、青 #3b5bdb、左サイドバー | markdown をビルド |
| Gallery | `examples/gallery/index.html`（672 行）+ `pieces.json` | 「映写室の黒」#070708、Archivo、AI モデル別の色 | 1 ファイル、`build-gallery.mjs` が pieces.json を生成 |
| Examples 一覧 | `examples/index.html`（今日復活させた旧ページ） | 紺 #0a0a0f | 手書き |
| music lab | `examples/music-lab.html` | 紺 #0e1220、琥珀 | 1 ファイル |
| Playground | `examples/playground.html`（230 行） | 紺 #0d1220 | 1 ファイル、CodeMirror + sucrase |
| 番号つき例 01–15 | `examples/NN-*.html` | 各々 | 1 ファイルずつ（コピー用のサンプル） |

デプロイは `.github/workflows/pages.yml` が `dist examples ai` と Guide のビルド結果、LP を `_site/` に集める。npm パッケージには `site/` も `examples/` も入らない（`files` に無い）ので、サイトの変更は npm のリリースと無関係。ただし LP に版番号があり、`Landing.test.ts` が強制している。

触るとテストが動くもの: `tests/docs/Landing.test.ts`、`tests/docs/Gallery.test.ts`（作品ごとのメタ）、`tests/docs/Guide.test.ts`、`tests/tools/landing.test.ts`（実ブラウザ）。

## 3. 設計

### 3.1 入口と URL

ヘッダーの項目は 5 つ: **Home / Guide / Gallery / Examples / Playground**（右に GitHub と npm）。「Live demos」という呼び名は廃止する。

URL は今のものを変えない。外部（README、npm、llms.txt、SNS）に出ているため。

| 入口 | URL |
|---|---|
| Home（LP） | `/` |
| Guide | `/guide/` |
| Gallery | `/examples/gallery/`（作品ページ `/examples/gallery/<id>.html` も不変） |
| Examples（番号つき例 + music lab） | `/examples/` |
| Playground | `/examples/playground.html`（中身を作り直しても場所は同じ） |

### 3.2 共通の規格（`site/shared/`）

- `site/shared/tokens.css`: LP の変数をそのまま正本にする（`--bg --bg-2 --bg-3 --line --ink --ink-2 --ink-3 --accent --amber --code-* --sans --mono --gutter --max`、暗い/明るいの 2 テーマと手動切替）。
- `site/shared/site.css`: ヘッダー、フッター、章見出し（`.ch` の番号つき見出し）、ボタン、カード、チップ（タグ）、コードブロック、表、プレイヤーのダイアログ。
- `site/shared/header.html` / `footer.html`: 共通の断片。ナビの現在地（`aria-current`）はビルドで付ける。
- ギャラリーの AI モデル別の色（fable / opus / sonnet）は、共通トークンに `--model-*` として追加する。ギャラリー固有の見た目（マソンリーの並べ方）は部品として残す。「映写室の黒」は LP の暗いテーマに吸収する（#070708 → #0b0d12）。

### 3.3 作り方: ビルドで断片を差し込む

フレームワークは使わない。`scripts/build-site.mjs`（依存なし）が、各ページのソースにある印 `<!--@site:header-->` `<!--@site:footer-->` `<!--@site:head-->` を共通の断片に置き換え、`_site/` に出力する。

- ページのソースは今の場所に置く（`site/landing/index.html` など）。ローカルで直接開いたときも、印が残ったまま最低限は読める（共通 CSS は相対リンク）。
- 確認用に `npm run site` で `site-preview/` を作る（今の `landing` / `guide` のプレビューを 1 本に統合）。
- Guide は `build-guide.mjs` の CSS を共通 CSS に置き換え、ヘッダー/フッターを共通の断片にする。サイドバー・ページャー・ライブデモは Guide 固有の部品として残す。
- ギャラリー作品ページ（`examples/gallery/<id>.html`）と番号つき例（`NN-*.html`）は作品・サンプルなので見た目は変えない。ただし「ギャラリーへ戻る」「Examples へ戻る」のリンクだけ揃える。

### 3.4 ページごとの変更

- **LP**: 内蔵 CSS を共通 CSS に出し、ヘッダー/フッターを断片にする。見た目は変えない。
- **Gallery**: LP の部品で作り直す。ヘッダー、章見出し、フィルタのチップ、カード、ポスターのグリッド、再生ダイアログ（LP のプレイヤーを共通部品にして共用する）。作品ごとにページへ行く導線は残す。
- **Examples**: 番号つき例 15 本 + music lab + checks を、カードの一覧にする（今の素朴なリストを置き換える）。
- **Guide**: 再スキン（トークンと共通部品）。本文は触らない。
- **Playground**: この設計では、ヘッダーとトークンを揃えるところまで。中身の作り直しは別メモ（3.6）。

### 3.5 テスト（今日のリンク切れを二度と起こさない）

1. **内部リンクの検査**: `build-site` の出力（`_site/`）を走査し、すべての内部 `href` / `src` が実在のファイルに解決することを確かめる。ブラウザ不要で速い。`test:fast` に入れる。
2. **共通部品の検査**: 全ページに同じヘッダーのリンク 5 つ、同じフッター、`tokens.css` の読み込みがあること。
3. **既存テストの引き継ぎ**: `Landing.test.ts` の版番号・事実の検査はそのまま。`Gallery.test.ts` のメタ検査もそのまま。
4. 実ブラウザの検査は、LP のヒーロー・ポスターのプレイヤー・ギャラリーの再生ダイアログ・Playground の起動、の 4 点に絞る。全ページのスクリーンショット比較はしない（重い割に壊れ方が見えにくい）。

### 3.6 Playground と WebMCP（別メモで設計、ここでは入口だけ）

- Playground は 5 つめの入口として LP の「Try it」の受け皿にする。
- WebMCP の層は、ツール本体を `movie` の上の普通の関数（構成の読み書き、警告、`inspect`、画像、シーク、書き出し）として作り、WebMCP への登録は「存在するときだけ」付ける薄い層にする。仕様が動いているため（`navigator.modelContext` → `document.modelContext` への改名など。Chrome の origin trial 段階）。
- どちらも、この共通の骨組みが先に立ってから設計する。

## 4. 進め方（各段階で公開できる状態を保つ）

| 段階 | 内容 | 確認 |
|---|---|---|
| 1 | `site/shared/`（トークン・共通部品・断片）と `build-site.mjs`、内部リンク検査。LP をこれに載せ替える（見た目は変えない） | 全テスト、LP の実ブラウザ検査、LP の見た目が前と同じ |
| 2 | Guide を載せ替える | Guide テスト、リンク検査 |
| 3 | Examples の一覧 + music lab + Playground のヘッダー | リンク検査 |
| 4 | Gallery の作り直し | Gallery テスト、再生ダイアログの実ブラウザ検査 |
| 5 | Playground の作り直し（別メモ） | |
| 6 | WebMCP の層（別メモ） | |

段階 1–4 が今回の範囲。段階ごとにコミットし、push と公開はあなたの合図を待つ。

## 5. リスクと対策

- **LP の見た目が崩れる**: 段階 1 で「見た目は変えない」を条件にし、載せ替え前後で 1440 と 390 の幅の画面を並べて比べる。
- **ギャラリーの作り直しで、作品ページへの導線やポスターの更新が壊れる**: `pieces.json` とポスターのマニフェストの仕組みは変えない。
- **共通 CSS が別ファイルになることで、CDN のキャッシュと食い違う**: Pages は `max-age=600`。ファイル名にハッシュは付けず、10 分遅れを許容する。
- **ローカルで直接開けなくなる**: 共通 CSS は相対パスで読むので、ローカルのサーバーで開く限り動く。`npm run site` で確認できるようにする。

## 6. 決めてほしいこと（私の推し付き）

1. Playground の URL は今のまま `/examples/playground.html`（推し）でよいか。それとも `/playground/` に移すか（移すなら旧 URL に転送ページを残す）。
2. Examples（番号つき例）を、Guide の中の「例で学ぶ」にまとめず、独立した入口にしておくこと（推し）でよいか。
3. ギャラリーの「映写室の黒」を LP の暗いテーマに吸収し、ギャラリーだけの黒をやめること（推し）でよいか。ギャラリー固有の雰囲気を残したいなら、背景だけ #070708 にする案もある。

## 7. 実装での調整（計画 `docs/superpowers/plans/2026-10-08-site-redesign.md` の R1–R6 と、実装中の判断）

- R1: LP のソースをリポジトリ直下の `index.html` に移した（リポジトリ直下 = サイトのルート。シンボリックリンクとプレビュー用スクリプトが不要になった）。
- R2: LP のヘッダーは共通の 5 項目になった（節アンカー、バージョンの札、タイムコード表示は消えた。進行バーは残した）。
- R3: LP は単一ファイルではなくなった（共通 CSS + `site/landing/landing.css`）。テストは「同じサイト内の相対パスだけ許す」に改めた。
- R4: ギャラリーの theatre は LP の簡易プレイヤーに統合しなかった（色と形だけ共通）。
- R5: ヘッダー/フッターの正本は JS の関数（`scripts/site-parts.mjs`）。
- R6: 共通ヘッダーは幅 600 未満で 2 段。
- ギャラリーのグリッドは共通の最大幅 1240px になった（旧 1560px、1800px 以上で 4 列）。ヘッダーと端をそろえるため。
- ギャラリーの Web フォント（Archivo）の読み込みをやめた（ページ読み込み時にサードパーティから何も読まない、という制約）。
- ギャラリーの theatre は、明るいテーマでも暗い部屋のままにした。
- Playground の CodeMirror は oneDark のまま（明るいテーマでは、ページは明るくエディタだけ暗い）。
