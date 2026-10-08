# 0.18 Playground の作り直しと WebMCP — 設計メモ

状態: 承認済み・実装済み（2026-10-08。リリースはオーナーの合図待ち）。実装での調整は末尾の「実装での調整」。
読む人: オーナー。決めてほしいことは 7 章。
前提: サイト統一（共通のヘッダー・トークン）と 0.17（`check` の道具）が済んでいる。公開前の 0.17.1 の修正も、この版に含めて出す。

## 1. 目的

1. **試せる場所をちゃんと作る。** いまの Playground は、コードを書いて Run するだけの 230 行のページで、警告もエラー以外は見えず、共有も保存もできない。LP の「Try it」の受け皿になる、本物の入口にする。
2. **ブラウザの中の AI が、動画を作って確かめられるようにする。** WebMCP でページがツールを出し、AI が「書く → 走らせる → 警告と画像を読む → 直す」を、チャットに貼り戻す人手なしで回せるようにする。いまの `ai/CHAT.md` の流れ（赤い箱の文章を人が AI に貼り戻す）の置き換えになる。

やらないこと: サーバー、アカウント、保存、複数ファイル、新しい映像表現（0.19）。

## 2. 確かめた事実

- 手元の Chrome 154 は、`--enable-features=WebMCP` を付けると `document.modelContext` を出す（付けないと無い）。持っているのは `registerTool`、`getTools`、`executeTool`、`ontoolchange`。`navigator.modelContext` は無い（仕様が `document.modelContext` に改名済み）。つまり**ヘッドレス Chrome で、本物の WebMCP をテストできる**。
- 仕様（webmachinelearning/webmcp）: `await document.modelContext.registerTool({ name, description, inputSchema, execute }, { signal })`。`execute` は `{ content: [{ type: 'text', text }] }` を返す。登録は `signal` を abort すると外れる。エージェントは `getTools()` で見つけ、`executeTool(tool, args)` で呼ぶ。Chrome の origin trial は 149〜156。仕様はまだ動いている。
- 現在の Playground: CodeMirror + sucrase、`movie` と `Controller` と `canvas` を注入して `new AsyncFunction` で同じページの中で実行。プリセット 12 本。teardown の処理が長い（GL コンテキストを手で捨てる）。
- `ai/chat-template.html`（113 行）は、`EDIT FROM HERE` から `EDIT UNTIL HERE` の間だけを AI が書く形で、警告を `window.__logs` と赤い箱に集め、`window.movie` と `window.__ready` を出す。

## 3. 設計

### 3.1 作りの全体

```
┌ 共通ヘッダー ───────────────────────────────────────────────┐
│ [プリセット ▾] [▶ Run] [共有リンク] [HTML を保存] [AI 用にコピー]  │
├─────────────────────────┬───────────────────────────────────┤
│ エディタ（CodeMirror）     │ プレビュー（サンドボックスの iframe） │
│                         │ ＋ プレイヤーバー                   │
├─────────────────────────┴───────────────────────────────────┤
│ 問題の欄: 警告 / レイアウトの指摘 / 音の注意 / フォント（クリックで該当フレームへ）│
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ドキュメント = チャット用テンプレートの EDIT 部分

エディタに入るのは、`ai/chat-template.html` の `EDIT FROM HERE … EDIT UNTIL HERE` の間（`const W, H, FPS, DURATION`、`BACKGROUND`、`sequences`、`POSTER`）と同じ形にする。理由: **AI がチャットで書いたものをそのまま貼れ、Playground で作ったものを「HTML を保存」するとチャット用テンプレートそのものになる。** 入口が 3 つあっても、書き方は 1 つ。いまのプリセット（`movie.init({…})` を直接書く形）は、この形に書き直す。

### 3.3 実行は、サンドボックスの iframe（`sandbox="allow-scripts allow-downloads"`、同一オリジンにしない）

- `srcdoc` に、テンプレートの外側（import map、ローダー、赤い箱、`Controller`）+ エディタの本文 + **ブリッジ**（下記）を入れて、Run のたびに作り直す。作り直せば、GL コンテキストの後始末も、前回の状態も要らない（いまの teardown が丸ごと不要になる）。
- 同一オリジンにしない理由: `yjmtmtk.github.io` は、このユーザーの他の Pages サイトと同じオリジン。**共有リンクで他人のコードが走る**ので、同一オリジンだと `localStorage` などに触れる。オリジンを持たない iframe なら、親のページにも、他のサイトのデータにも触れない。読み込む `dist/*.js` と CDN は CORS ヘッダーがあるので、オリジンなしでも読める。
- ブリッジ: 親と iframe は `postMessage` だけで話す。iframe 側のスクリプトは、**許可した命令だけ**を実行して結果（JSON）を返す: `status`、`logs`、`review`、`snapshot`、`contactSheet`、`onion`、`render`、`play` / `pause` / `seek`。親は命令の名前と引数の型を検査してから送る。
- ライブラリは、サイトと同じ版（`dist/`）を読む（テンプレートが CDN の固定版を指している部分は、`srcdoc` を作るときに置き換える）。

### 3.4 `movie.review()` をライブラリに入れて、3 か所で共有する

`pixi-effects-check` の中にある「どのフレームを見るか」「問題をまとめる」「場面」「`--at` の読み取り」を、ライブラリの `movie.review({ at, onion })` にまとめる（戻り値は構造化した JSON）。`check` コマンド、Playground の問題の欄、WebMCP の `check` ツールが、同じ関数を呼ぶ。こうしないと、同じ判断のコードが 3 つになる。`check.mjs` は、ファイルへの書き出しと書き出しの検査（Node 側の仕事）だけを持つ。0.17 の純関数のテストは、ライブラリ側を指すように付け替える。

### 3.5 共有リンク・保存

- 共有リンク: コードを圧縮（`CompressionStream('deflate-raw')`）して `#code=` に入れる。サーバーなし。**リンクで開いたコードは、自動では走らせない**（「Run を押すと実行します」の表示）。
- HTML を保存: テンプレートの外側 + エディタの本文を 1 つの HTML ファイルにして、ダウンロード（オフラインでも、CDN の版固定で動く）。
- AI 用にコピー: 「`https://github.com/yjmtmtk/pixi-effects` を使って…」の 1 文 + 今のコードを、クリップボードへ。

### 3.6 WebMCP のツール

`document.modelContext.registerTool` がある（Chrome の WebMCP が有効な）ときだけ登録する。無いブラウザでは何も変わらない（画面に「AI エージェント用ツール: 有効 / 無効」の小さな表示）。ツール本体は普通の関数で、WebMCP の登録は薄い層にする（仕様が動くので、直すのはこの層だけ）。

| ツール | 中身 | 副作用 |
|---|---|---|
| `get_code` | エディタの本文 | なし |
| `set_code({ code, run })` | 本文を置き換える。`run: true`（既定）なら走らせて要約を返す | エディタを書き換える |
| `run` | 走らせる。`{ ready, warnings, duration, size, frames }` | iframe を作り直す |
| `check({ at })` | `movie.review()` の結果: 警告、レイアウトの指摘、フォント、音（LUFS、`notes`）、場面 | なし |
| `look({ at, count })` | 指定した瞬間（`3.5`、`title@end`、`50%`）の画像、または全体のコンタクトシート | なし |
| `onion({ from, to })` | 動きの軌跡の 1 枚 | なし |
| `render_draft({ range })` | 下書きを書き出し、`{ bytes, duration, width, height }` を返す。ファイルは人が「保存」で取る | なし |
| `list_examples` / `load_example({ id })` | プリセットの一覧と読み込み | エディタを書き換える |
| `get_docs({ part })` | `cheatsheet` / `recipes` / `pitfalls` の本文（同じサイトの `ai/reference/*.md`）。ブラウザの AI が資料を持っていなくても使える | なし |

結果は `{ content: [{ type: 'text', … }] }`。画像は、WebMCP が画像の内容を受けるかを確かめてから（受けなければ、小さい JPEG の data URL を文章で返す）決める。読み取りだけのツールには、その旨の注釈（`readOnlyHint`）を付ける。

### 3.7 見た目

共通のトークン・ヘッダーに載せる。エディタは、暗い/明るいテーマに合わせる（CodeMirror の `oneDark` と標準を切り替える）。幅 390 では、エディタ → プレビュー → 問題の欄の順に縦に並べる。

## 4. テスト

- 純関数（共有リンクの圧縮・復元、ブリッジの命令と引数の検査、`review()` の各部分）は、ブラウザなしの単体テスト。
- 実ブラウザ: Playground が全プリセットを走らせて警告なし、サンドボックスの iframe の中のコードが `parent.document` に触れないこと、共有リンクの往復（自動実行しない）、保存した HTML が単独で動くこと、幅 390 と 1440 で崩れないこと。
- **WebMCP は本物で**: `--enable-features=WebMCP` を付けた Chrome で `document.modelContext.getTools()` に全ツールが載り、`executeTool` で `set_code` → `run` → `check` → `look` が通ること（Chrome がこの機能を持たない環境ではスキップ）。
- `check` の既存のテストは、結果が同じであることを保ったまま通す。

## 5. 手順（各段階で動く状態を保つ）

1. `movie.review()` をライブラリに入れ、`check.mjs` を載せ替える（見た目と終了コードは同じ）。
2. サンドボックスの iframe とブリッジ（命令の許可リスト、検査、`srcdoc` の組み立て）。
3. Playground の画面（エディタ、プレビュー、問題の欄、プリセットの書き直し、テーマ）。
4. 共有リンク、HTML を保存、AI 用にコピー。
5. WebMCP の層とツール、本物のテスト。
6. 文書（ガイドに Playground の頁、`AGENTS.md`、`ai/CHAT.md`、`llms`）、CHANGELOG、リリース準備。

## 6. リスクと対策

- **オリジンなしの iframe で、ES モジュール・import map・WebGPU・音・書き出し（WebCodecs）が動くか。** 段階 2 の最初に、動くことを実機で証明する（証明できなければ、同一オリジンの iframe に戻し、共有リンクは「コードを見てから Run」を強める）。
- WebMCP の仕様の変更（改名、引数の変更）。登録の層だけにし、ツール本体は関数のまま。登録の失敗は握りつぶさず、画面に出す。
- `review()` への移し替えで `check` の結果が変わる。移す前後で、ギャラリーの数作品の `report.json` を比べる。
- Run のたびに iframe を作り直すと、重い作品で待たされる。作り直しは 1 秒前後（CDN のキャッシュ）の見込み。測って文書に書く。

## 7. 決めてほしいこと（私の推し付き）

1. 実行は、**オリジンなしのサンドボックス iframe + ブリッジ**（推し）か、同一ページの中（いまのまま）か。
2. ドキュメントは、**チャット用テンプレートの EDIT 部分と同じ形**（推し）か、いまのような自由な JS か。
3. `check` の判断を **`movie.review()` としてライブラリに入れる**（推し）か、Playground 側に写すか。
4. 共有リンクを入れる（**入れる、自動実行はしない**: 推し）か。
5. WebMCP のツールは、3.6 の 9 本でよいか（多すぎる／足りないものは）。
6. 版は 0.18.0。0.17.1 の修正も含めて出す（推し）か、先に 0.17.1 を出すか。
7. プリセットは、いまの 12 本を新しい形に書き直す（推し）。ギャラリーの作品を「Playground で開く」は、今回は入れない。

## 8. 実装での調整

実装計画の R1〜R3、実機で分かった WebMCP の形、実装中の判断を残す。

- **R1: `check.mjs` は旧ライブラリ向けの退避経路を持たない。** `movie.review` が無いページには「このページの pixi-effects は check より古い。0.18 以上にしてください」と言って終了コード 2。判断のコードを 2 つにしないため。
- **R2: `movie.resolveAt(list)` を公開した。** `--at` の誤りを遅い処理の前に報告する挙動（0.17.1）を `review()` に移しても保つため。
- **R3: テンプレートに任意の `const INIT = {…}`** （`movie.init` の追加オプション、`composition` の追加キー）。プリセットが `assets`・`transitions` を要るため。
- **WebMCP の実際の形（Chrome 154、`--enable-features=WebMCP`、実測）。** `registerTool` は何も返さない。`getTools()` の要素は `{ name, title, description, inputSchema（JSON 文字列）, annotations { readOnlyHint, consequentialHint, untrustedContentHint }, origin, window }`。`executeTool(tool, 引数の JSON 文字列)` は結果の JSON 文字列を返す（名前だけでは呼べない）。**画像（`{ type: 'image', data, mimeType }`）はそのまま通る**ので、`look` / `onion` は本物の画像で返す（data URL を文章に入れる退避は不要だった）。ツールが例外を投げるとエージェントには文言なしの失敗になる → ツールは `isError` の結果を返す。引数はスキーマで検査されない → `checkArgs` が検査する。呼び出しは並列に走る → 1 本ずつのキューで直列化した。名前の重複は拒否される。
- **ツールは 10 本**（`list_examples` と `load_example` は 2 本）。
- **`movie.review()` は終わったあと、プレイヘッドとポスターを元に戻す。** 戻さないと、プレビューは最後に調べたフレーム（多くは空）のまま残った。
- **ランナー:** 古い iframe は、テンプレートの取得を待ったあとに捨てる（素早い 2 回の Run で 2 枚残らない）。置き換えられた Run は「置き換えられた」で完了する。起動中のコマンドは、失われる代わりに「まだ起動中」と断る。
- **CodeMirror は、現行の版に固定し、`deps=` で state と view を 1 組にした。** 古い固定のままでは「Unrecognized extension value」になった。読み込みや構築に失敗したら、素のテキスト欄に落ちる。
- **保存した HTML の `<base href>`** は、コードが `_assets/` を名指すときだけ付ける（人が自分の相対ファイルを置いたときに壊さないため）。
- **測った値:** Run の作り直しは、題字で 0.2〜0.3 秒、動画ファイルのある作品で 0.4〜0.6 秒（ヘッドレス Chrome、ライブラリはキャッシュ済み。設計時の見込みは 1 秒前後）。20 回続けても iframe は 1 枚、WebGL コンテキストの警告なし。旧 `check` と `review()` の結果は、ギャラリー 6 作品で差 0。
