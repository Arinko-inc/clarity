# Arinko-inc/clarity の自前パッチ

株式会社ありんこの AntReplay(自社版 Microsoft Clarity、設計は `~/ant-replay/DESIGN.md`、実装計画は `~/ant-replay/PLAN.md`)が使う
録画スクリプト `ar.js` を、上流 `microsoft/clarity` の clarity-js から作るためのフォーク。
方針4条(`~/arinko-principles.md`)に従い、パッチは新しいファイルに置き、上流のファイルへの差分は差し込み口の行だけにする。
自前パッチは上流に送らない。

- ブランチ `arinko/patches` = 上流の安定版タグ(`v数字.数字.数字`。`-beta` は使わない)+ このファイルに書いたパッチ
- 基点は **v0.8.71**(2026-10-08 に決定。AntReplay の解読と再生が clarity-decode / clarity-visualize 0.8.71 を使うため。0.8.72 への追従は並行運用が落ち着いてから)
- 上流の `master` はフォーク元のまま触らない。リポジトリは公開(公開リポジトリのフォークは private にできない。パッチに秘密は無い)
- 上流のファイルで変えた行には、すべて行末に `// ARINKO` を付けてある。`git grep -n ARINKO -- packages/clarity-js` で全部が出る

## 何を変えたか

### 1. Microsoft のタグと状態を共有しないための名前の付け替え

| 上流の名前 | 変えた名前 | 何に使われるか | 共有したときに起きること |
|---|---|---|---|
| `window.clarity` | `window.antreplay` | 公開の関数(`antreplay("start", {...})`、`antreplay("set", ...)`、`antreplay("event", ...)`) | 後から読んだ側が「Multiple Clarity tags detected」で起動しない |
| クッキー `_clck` | `_arck` | ユーザー ID | 同じユーザー ID を使い合う |
| クッキー `_clsk` | `_arsk` | セッション ID・ページ番号・**送信先の URL** | 読み込んだ側の送信先を上書きし、録画が相手の宛先へ送られる |
| sessionStorage `_cltk` | `_artk` | タブ ID | 同じタブ ID を使い合う |
| `window.__clr` | `window.__arr` | CSS(`insertRule` 等)・`attachShadow`・`customElements.define` のフックが元の関数を持つ | 後から起動した側がフックを掛けず、動的な CSS と Shadow DOM の変化が録画に残らない |
| `__clrSId` / `__clrAId` / `__clrOCnt` | `__arrSId` / `__arrAId` / `__arrOCnt` | CSSStyleSheet と Animation に付ける ID と操作回数 | 相手が付けた ID を自分の ID と取り違える |

### 2. URL の削り取り(`src/arinko/url.ts`)

`utm_*` と広告のクリック ID(`gclid` `twclid` `fbclid` `yclid`)以外のクエリ項目と、フラグメント(`#` 以降)を送信前に落とす。
上流の設定 `drop` は名前を挙げた項目しか伏せないので、メールアドレスやトークンが URL に載ると録画に残るため。残す項目は `KeepPrefix` と `KeepNames` で決まる。

| 対象 | 差し込み口 |
|---|---|
| 封筒の URL・`Dimension.Url`・クリック先(`link`)・スクリプトエラーの `source` | `scrub.url()` の先頭(`src/core/scrub.ts`) |
| 参照元(`Dimension.Referrer`) | `src/data/metadata.ts` の `start()`(上流は scrub を通していない) |
| DOM のスナップショットと変化に入る属性: `<link>` 以外の `href`、`action`、`formaction` | `src/layout/encode.ts` の `attribute()` |

- `#` で始まる属性の値(ページ内リンク `href="#sec3"`)は削らない。デッドクリックの判定でページ内リンクを見分けるため
- `<link>` の `href` と、`src`・`srcset` は削らない。再生のときにその URL から CSS・フォント・画像を読み込むため(例 Google Fonts の `css2?family=…`、`app.js?v=…`)。`<link>` の `href` は上流も伏せずに送っている

### 3. 封筒(envelope)に足した2つの値(`src/arinko/page.ts`)

| 位置 | 中身 |
|---|---|
| `e[12]` | ページの読み込みごとの乱数 ID(英小文字と数字の16文字)。`page_key` |
| `e[13]` | ページの開始時刻(epoch ミリ秒)。1通目の Metric の `ClientTimestamp` と同じ値 |

- 上流の封筒(`e[0]`〜`e[11]`)は、同じセッションで同時に開いた2つのタブで、セッション ID もページ番号も同じになり、`start` もページ内の相対時刻なので、2通目以降の送信がどちらのタブのものか分けられない
- clarity-decode の `envelope()` は `e[0]`〜`e[11]` を位置で読むだけなので、末尾に足しても解読と再生は変わらない。2026-10-08 に npm の clarity-decode 0.8.71 で、解読した封筒の12項目が生の `e[0]`〜`e[11]` と一致することを確かめた(`~/ant-replay/poc/01-fork/NOTES.md`)。`e[12]`・`e[13]` は解読結果に出ないので、取り込み側が生の `e` 配列から拾う
- SPA の画面遷移(URL が変わって clarity-js が start し直す)や、30分の無操作からの再開でも、新しいページとして値を作り直す

### 4. ページを離れるときの最後の送信の欠けを減らす

ページを離れるときの最後の送信(sendBeacon)は約64KB を超えると送られず、clarity-js はそのとき再生データを丸ごと落とす。

- **送信間隔の上限 `maxDelay`**(ミリ秒。`src/arinko/delay.ts`): 上流は送信のたびに間隔を延ばす(最長30秒)。値を渡すと、その値で頭打ちにする(100ms より短くはしない)。既定は `null` で上流どおり。**推奨は 2000**(下の雛形に入れてある)
- **裏に回ったときの前倒し送信 `flushOnHide`**(既定 `true`。`src/arinko/hide.ts`): `visibilitychange` で `hidden` になったとき、溜まっている分を送信の間隔を待たずに通常の送信(XHR・gzip)で出す。`flushOnHide: false` で切る
  - Chrome 154 で測った順番は、ページの移動でもタブを閉じるときも beforeunload → pagehide → visibilitychange → unload。clarity-js は pagehide で止まるので、移動と閉じるときは上流どおり sendBeacon で終わる。効くのは、タブの切り替え・最小化・スマートフォンのアプリの切り替え(その後 pagehide が来ないまま終わることがある)
  - **リスナーは `window` に capture で付ける。`document` に付けてはいけない。**`src/layout/node.ts` の `observe()` は `event.has(document)` が true だと DOM の変化と操作の監視を始めない。`upload.ts` の `start()` は layout より先に動くので、`document` に付けるとクリック・スクロール・入力の記録がすべて消える(2026-10-08 に一度これで壊した)

### 5. 設定の既定値(`src/arinko/defaults.ts`)

| 設定 | 上流の既定 | このフォークの既定 | 理由 |
|---|---|---|---|
| `upload` | `null`(送らない) | `"/_r/c.php"` | 各サイトの受け口。`/` で始まる相対パスにする |
| `unmask` | `[]` | `["body"]` | Microsoft のマスク設定「バランス」と同じにする。Microsoft のローダーは `"content":true,"unmask":["body"]` を渡している(2026-10-08 に antlaunch.jp のローダーで確認)。`content: true` だけだと本文の数字や `@` を含む語が `▫` に伏せられる。入力欄と `data-clarity-mask` を付けた要素は、これを指定しても伏せたまま |
| `maxDelay` | (無い) | `null`(上流どおり) | 上の 4. |
| `flushOnHide` | (無い) | `true` | 上の 4. |

ページから `antreplay("start", {...})` で渡した値が優先する。

### 6. 送信先のクッキーの不具合の回避(`src/arinko/cookie.ts`)

上流はセッションのクッキーに送信先から `https://` を外して書き、次のページで `/` で始まらなければ `https://` を前に付けて読み戻す。
そのため `http://` の絶対 URL は2ページ目以降で `https://http//…` に壊れる(2026-10-08 の PoC 2 で実測)。
`/` で始まる相対パスと `https://` の URL だけを `_arsk` に書き、それ以外は空にする(次のページはページ側の設定の送信先を使う)。

### 7. 版の文字列(`src/arinko/version.ts`)

- `ar.js` の版は `<上流の版>-arinko.<ビルドした日>.<このフォークのコミットの短い SHA>`(例 `0.8.71-arinko.20261008.4d8cd84`)。`tools/arinko-update.sh` がビルドの後に埋め込み、`dist/BUILD-INFO` の `build=` と `ar.js` 先頭のコメントにも書く
- ページからは **`window.__arrVersion`** で読む。`window.antreplay("version")` は使えない(上流の公開関数は `clarity.ts` が書き出した関数を名前で呼ぶ形で、`version` は関数ではなく文字列のため)
- 各サイトは `ar.js?v=<版>` の形で読む(arinko.jp の `.htaccess` は js に1週間の Expires を付ける)。版を上げたら `v` も上げる

## ファイルの一覧

### 新しいファイル

| ファイル | 中身 |
|---|---|
| `packages/clarity-js/types/arinko.d.ts` | 変える名前の定数(`const enum ArinkoName`)と、`Window.__arr`・`Window.__arrVersion` の型。**名前を変えるときはここだけを直す** |
| `packages/clarity-js/src/arinko/url.ts` | URL の削り取り(`clean()`、属性用の `attribute()`) |
| `packages/clarity-js/src/arinko/page.ts` | 封筒の `e[12]`・`e[13]` |
| `packages/clarity-js/src/arinko/delay.ts` | 送信間隔の上限(`cap()`) |
| `packages/clarity-js/src/arinko/hide.ts` | 裏に回ったときの前倒し送信 |
| `packages/clarity-js/src/arinko/defaults.ts` | 設定の既定値(`upload`・`unmask`) |
| `packages/clarity-js/src/arinko/cookie.ts` | `_arsk` に書く送信先 |
| `packages/clarity-js/src/arinko/version.ts` | 版の文字列(`window.__arrVersion`) |
| `tools/arinko-update.sh` | 上流追従とビルド(下の「上流への追従」) |
| `dist/.gitignore` | ビルドした `dist/ar.js` をコミットしないため |
| `ARINKO-PATCHES.md` | このファイル |

### 上流のファイルの差し込み口(2026-10-08、v0.8.71 時点の行番号)

| ファイル | 変えた行 | 内容 |
|---|---|---|
| `packages/clarity-js/src/global.ts` | 1行(1) | `import "@src/arinko/version"`(ar.js の入口で版を置く) |
| `packages/clarity-js/src/queue.ts` | 2行(1, 5) | 自分を登録するグローバル変数名 `Constant.Clarity` → `ArinkoName.Global`。使わなくなった `Constant` の import を置き換え |
| `packages/clarity-js/src/core/config.ts` | 5行(3, 8, 9, 16, 22) | import 1行。`maxDelay: null`・`flushOnHide: true` を足す。`unmask` と `upload` の既定を `defaults.ts` の値に(`core.config()` は既定値に無いキーを捨てるので、足した設定にも既定値が要る) |
| `packages/clarity-js/types/core.d.ts` | 2行(122, 123) | `Config` に `maxDelay?: number` と `flushOnHide?: boolean` |
| `packages/clarity-js/src/core/scrub.ts` | 2行(5, 98) | import 1行。`url()` の先頭で `input = arinkoUrl.clean(input)` |
| `packages/clarity-js/src/data/metadata.ts` | 14行(1, 2, 3, 35, 48, 229, 233, 240, 242, 255, 257, 292, 306, 329) | import 3行。`start()` で `arinkoPage.start(s.ts)`(35)。参照元を `scrub.url()` に通す(48)。`save()` の送信先を `arinkoCookie.upload()` に(255)。クッキーとタブ ID の読み書き8か所を `Constant.CookieKey/SessionKey/TabKey` → `ArinkoName.*` |
| `packages/clarity-js/src/data/envelope.ts` | 2行(1, 52) | import 1行。封筒の末尾に `arinkoPage.key, arinkoPage.time` |
| `packages/clarity-js/src/data/upload.ts` | 6行(1, 2, 49, 51〜52, 96) | import 2行。`start()` で `arinkoHide.start(flushNow)`。`flushNow()` を1行で足す(前に空行1行)。`let gap = arinkoDelay.cap(delay())` |
| `packages/clarity-js/src/layout/encode.ts` | 2行(5, 141) | import 1行。`attribute()` の先頭で `value = arinkoUrl.attribute(key, value, tag)` |
| `packages/clarity-js/src/layout/mutation.ts` | 10行(1, 350, 364, 365, 369, 371, 375, 381, 382, 387) | import 1行。`win.__clr` → `win[ArinkoName.Hooks]`(insertRule・deleteRule・attachShadow のフック) |
| `packages/clarity-js/src/layout/style.ts` | 6行(1, 14, 25, 37, 38, 45) | import 1行。`__clrSId` と `win.__clr`(replace・replaceSync のフック) |
| `packages/clarity-js/src/layout/custom.ts` | 5行(1, 27, 28, 29, 34) | import 1行。`window.__clr`(customElements.define のフック) |
| `packages/clarity-js/src/layout/animation.ts` | 3行(1, 13, 14) | import 1行。`__clrAId` と `__clrOCnt` |

合計 13 ファイル・60 行(うち空行1行)。上流のファイルから消した行は、置き換えた 36 行だけ。

## わざと変えなかったもの

- **`Constant.Clarity`(値 `"clarity"`)そのもの**: グローバル変数名のほかに、カスタムイベント名(`data.event("clarity", "pause")` など)にも使われている。ここを変えると録画データの中身が上流と変わり、clarity-decode / clarity-visualize と Microsoft 側の意味づけからずれるので、`queue.ts` の登録名だけを変えた
- **`types/data.d.ts` の `CookieKey` などの値**: 別の const enum を参照する形で書き換えると、宣言ファイル(`.d.ts`)の const enum は文字列として埋め込まれず `0` になる(2026-10-08 にビルドで確認。`sessionStorage.getItem(0)` が出力された)。そのため `metadata.ts` の使用箇所を直した
- **`data-clarity-mask` / `data-clarity-unmask` / `data-clarity-region` の属性名**: 各サイトに付けてあるマスクの印をそのまま使う(設計どおり)
- **`data-clarity-loaded`**: 伏せた画像の読み込み完了で DOM の変化を起こすために書く属性。両方のタグが書いても、互いの変化として記録されるだけで実害はない
- **`src/dynamic/agent/*` の `window.clarity`**: LiveChat・Tidio・Crisp 用の別のビルド(`clarity.livechat.js` など)で、サーバーの指示で読み込まれる。`ar.js`(`src/global.ts` 起点)には入らず、自社の受け口はその指示を返さない
- **`types/global.d.ts` の `__clr` の型**: 型だけで出力には出ない
- **版番号(`version`、封筒の `e[0]`)**: clarity-decode が版を見るので、上流と同じにしている。フォークの版は `window.__arrVersion`
- **上流のテスト**: `packages/clarity-js/test/consentv2.test.ts` などは `window.clarity` と `_clck` を直書きしているので、このフォークでは落ちる。上流のテストは直さない(追従の衝突を増やさないため)。動作の確認は AntReplay の PoC(`~/ant-replay/poc/01-fork/capture.mjs`)で行う

## ビルド

```bash
yarn install --frozen-lockfile
tools/arinko-update.sh --build-only   # 積み直さずにビルドと検査だけ
```

- 出力は `dist/ar.js`(`packages/clarity-js/build/clarity.min.js` の版の置き場所 `@@ARINKO_BUILD@@` を版の文字列に置き換え、先頭に版・コミット・MIT ライセンスの1行を足したもの)と `dist/BUILD-INFO`
- 名前の検査: `ar.js` に `_clck` `_clsk` `_cltk` `__clr` が1つでも残っていたら、または `"antreplay"` `_arck` `_arsk` `_artk` `__arr` と版の文字列が無ければ、終了コード 4 で止まる。上流が新しくこれらの名前を使い始めたときに、黙って Microsoft のタグと状態を共有する版を配らないため
- **ビルドが通っても、録画が正しいとは限らない。**上流を上げたときと、パッチを足したときは、`~/ant-replay/poc/01-fork/` で `node capture.mjs` を回し、「操作の記録(件数)」の click・pointer・scroll・input がどれも 0 でないこと、封筒の長さが 14 で解読した封筒が生の値と一致すること、を確かめる(2026-10-08 に、ビルドは通るのに操作が記録されない版を一度作った。4. の注意)

## 上流への追従

```bash
tools/arinko-update.sh           # 最新の安定版タグへ積み直す → ビルド → 名前の検査
tools/arinko-update.sh --push    # 上に加えて origin の arinko/patches を更新する
tools/arinko-update.sh --to v0.8.72   # 積み直す先のタグを指定する
```

- `git fetch upstream --tags` → 最新の安定版タグ(`v0.8.72` の形。`-beta` は除く)を選ぶ → `git rebase --onto <新タグ> <今の基点のタグ> arinko/patches` → `yarn install` → ビルド → 名前の検査
- 積み直す前の状態は `backup/arinko-patches-<元のタグ>` のブランチに残る
- **衝突したら rebase を取り消して元に戻し、衝突したファイル名を表示して終了コード 2 で止まる**(macOS では通知センターにも出す)。手で直すときは表示されたコマンドで rebase をやり直す
- ブランチは積み直しで書き換わるので、push は `--force-with-lease`。`arinko/patches` へ PR をマージするときもマージコミットを作らず rebase で積む
- 定期実行(cron・LaunchAgent・GitHub Actions)はまだ入れていない。基点は当面 v0.8.71 に留める(上の決定)ので、引数なしで叩かない
- 2026-10-08 に一時の worktree で v0.8.71 → v0.8.72 の積み直しを試し、衝突なしでビルドと名前の検査まで通った(約13秒。このときのパッチは 1. と 2. の一部だけ)。衝突の経路は、`queue.ts` の差し込み口と同じ行を書き換えた偽のタグで試し、rebase を取り消して元のコミットに戻ること・終了コード 2 を確かめた

## ページへの組み込み(各サイトの雛形)

```html
<script>
(function (w, d, a, src) {
  w[a] = w[a] || function () { (w[a].q = w[a].q || []).push(arguments); };
  var t = d.createElement("script"); t.async = 1; t.src = src;
  var y = d.getElementsByTagName("script")[0]; y.parentNode.insertBefore(t, y);
})(window, document, "antreplay", "/_r/ar.js?v=<版。dist/BUILD-INFO の build>");
antreplay("start", {
  projectId: "<サイト名>",
  upload: "/_r/c.php",      // 既定と同じ。/ で始まる相対パスにする(http:// の絶対 URL は使わない)
  track: true,
  content: true,
  unmask: ["body"],         // 既定と同じ。Microsoft の「バランス」と同じ伏せ方
  lean: false,
  maxDelay: 2000            // 送信間隔の上限(ミリ秒)
  // flushOnHide: true      // 既定で有効。裏に回ったときの前倒し送信を切るときだけ false を書く
});
</script>
```

- `start` は `antreplay("start", {...})` の1回で足りる(Microsoft のタグはローダーが `start` を呼ぶが、`ar.js` は自分では呼ばない)
- 独自イベントとカスタムタグは `antreplay("event", "<名前>")` と `antreplay("set", "<キー>", "<値>")`。Microsoft 側にも送るなら `clarity(...)` も呼ぶ
- 既定と同じ値も雛形に書いておく(既定を変えたときに、各サイトの動きが黙って変わらないようにするため)
- `maxDelay: 2000` の根拠: 2026-10-08 のテストページ(1ページ目に約25秒)で、操作が続いている間の送信の間隔が、上流どおりの最長 5.6 秒から 2.0〜2.8 秒に縮んだ。1ページ目の送信の回数は 8 回 → 11 回、バイト数は約 7% 増(`~/ant-replay/poc/01-fork/NOTES.md` の結果 7)。長く滞在したページの末尾の欠け方は PoC 10 で測る
