# Arinko-inc/clarity の自前パッチ

株式会社ありんこの AntReplay(自社版 Microsoft Clarity、設計は `~/ant-replay/DESIGN.md`)が使う録画スクリプト `ar.js` を、
上流 `microsoft/clarity` の clarity-js から作るためのフォーク。
方針4条(`~/arinko-principles.md`)に従い、パッチは新しいファイルに置き、上流のファイルへの差分は差し込み口の行だけにする。
自前パッチは上流に送らない。

- ブランチ `arinko/patches` = 上流の安定版タグ(`v数字.数字.数字`。`-beta` は使わない)+ このファイルに書いたパッチ
- 上流の `master` はフォーク元のまま触らない
- 上流のファイルで変えた行には、すべて行末に `// ARINKO` を付けてある。`git grep -n ARINKO -- packages/clarity-js` で全部が出る

## 何を変えたか

Microsoft のタグ(`www.clarity.ms/tag/<id>`)と同じページで動かしても、互いの状態を書き換えないようにする。

| 上流の名前 | 変えた名前 | 何に使われるか | 共有したときに起きること |
|---|---|---|---|
| `window.clarity` | `window.antreplay` | 公開の関数(`antreplay("start", {...})`、`antreplay("set", ...)`、`antreplay("event", ...)`) | 後から読んだ側が「Multiple Clarity tags detected」で起動しない |
| クッキー `_clck` | `_arck` | ユーザー ID | 同じユーザー ID を使い合う |
| クッキー `_clsk` | `_arsk` | セッション ID・ページ番号・**送信先の URL** | 読み込んだ側の送信先を上書きし、録画が相手の宛先へ送られる |
| sessionStorage `_cltk` | `_artk` | タブ ID | 同じタブ ID を使い合う |
| `window.__clr` | `window.__arr` | CSS(`insertRule` 等)・`attachShadow`・`customElements.define` のフックが元の関数を持つ | 後から起動した側がフックを掛けず、動的な CSS と Shadow DOM の変化が録画に残らない |
| `__clrSId` / `__clrAId` / `__clrOCnt` | `__arrSId` / `__arrAId` / `__arrOCnt` | CSSStyleSheet と Animation に付ける ID と操作回数 | 相手が付けた ID を自分の ID と取り違える |

加えて、次の2点を足した。

- **URL の削り取り**: ページの URL・参照元・クリック先の URL から、`utm_*` と広告のクリック ID(`gclid` `twclid` `fbclid` `yclid`)以外のクエリ項目と、フラグメント(`#` 以降)を送信前に落とす。上流の設定 `drop` は名前を挙げた項目しか伏せないので、メールアドレスやトークンが URL に載ると録画に残るため。残す項目は `src/arinko/url.ts` の `KeepPrefix` と `KeepNames` で決まる
- **送信間隔の上限 `maxDelay`**(ミリ秒。既定は `null` で上流どおり): 上流は送信のたびに間隔を延ばし(最長30秒)、離脱時の最後の送信(sendBeacon、64KB まで)が大きくなるほど再生データを丸ごと落とす。`antreplay("start", { maxDelay: 5000, ... })` のように渡すと、間隔をその値で頭打ちにする(100ms より短くはしない)

## ファイルの一覧

### 新しいファイル

| ファイル | 中身 |
|---|---|
| `packages/clarity-js/types/arinko.d.ts` | 変える名前の定数(`const enum ArinkoName`)と `Window.__arr` の型。**名前を変えるときはここだけを直す** |
| `packages/clarity-js/src/arinko/url.ts` | URL の削り取り(`clean()`) |
| `packages/clarity-js/src/arinko/delay.ts` | 送信間隔の上限(`cap()`) |
| `tools/arinko-update.sh` | 上流追従とビルド(下の「上流への追従」) |
| `dist/.gitignore` | ビルドした `dist/ar.js` をコミットしないため |
| `ARINKO-PATCHES.md` | このファイル |

### 上流のファイルの差し込み口(2026-10-08、v0.8.71 時点の行番号)

| ファイル | 変えた行 | 内容 |
|---|---|---|
| `packages/clarity-js/src/queue.ts` | 2行(1, 5) | 自分を登録するグローバル変数名 `Constant.Clarity` → `ArinkoName.Global`。使わなくなった `Constant` の import を置き換え |
| `packages/clarity-js/src/data/metadata.ts` | 10行(1, 45, 226, 230, 237, 239, 254, 289, 303, 326) | import 1行。参照元を `scrub.url()` に通す1行。クッキーとタブ ID の読み書き8か所を `Constant.CookieKey/SessionKey/TabKey` → `ArinkoName.*` |
| `packages/clarity-js/src/layout/mutation.ts` | 10行(1, 350, 364, 365, 369, 371, 375, 381, 382, 387) | import 1行。`win.__clr` → `win[ArinkoName.Hooks]`(insertRule・deleteRule・attachShadow のフック) |
| `packages/clarity-js/src/layout/style.ts` | 6行(1, 14, 25, 37, 38, 45) | import 1行。`__clrSId` と `win.__clr`(replace・replaceSync のフック) |
| `packages/clarity-js/src/layout/custom.ts` | 5行(1, 27, 28, 29, 34) | import 1行。`window.__clr`(customElements.define のフック) |
| `packages/clarity-js/src/layout/animation.ts` | 3行(1, 13, 14) | import 1行。`__clrAId` と `__clrOCnt` |
| `packages/clarity-js/src/core/scrub.ts` | 2行(5, 98) | import 1行。`url()` の先頭で `input = arinkoUrl.clean(input)` |
| `packages/clarity-js/src/data/upload.ts` | 2行(1, 92) | import 1行。`let gap = arinkoDelay.cap(delay())` |
| `packages/clarity-js/src/core/config.ts` | 1行(7) | 既定値 `maxDelay: null`(`core.config()` は既定値に無いキーを捨てるので要る) |
| `packages/clarity-js/types/core.d.ts` | 1行(122) | `Config` に `maxDelay?: number` |

合計 10 ファイル・42 行。上流のファイルの行を消したのは、置き換えた 32 行だけ。

## わざと変えなかったもの

- **`Constant.Clarity`(値 `"clarity"`)そのもの**: グローバル変数名のほかに、カスタムイベント名(`data.event("clarity", "pause")` など)にも使われている。ここを変えると録画データの中身が上流と変わり、clarity-decode / clarity-visualize と Microsoft 側の意味づけからずれるので、`queue.ts` の登録名だけを変えた
- **`types/data.d.ts` の `CookieKey` などの値**: 別の const enum を参照する形で書き換えると、宣言ファイル(`.d.ts`)の const enum は文字列として埋め込まれず `0` になる(2026-10-08 にビルドで確認。`sessionStorage.getItem(0)` が出力された)。そのため `metadata.ts` の使用箇所を直した
- **`data-clarity-mask` / `data-clarity-unmask` / `data-clarity-region` の属性名**: 各サイトに付けてあるマスクの印をそのまま使う(設計どおり)
- **`data-clarity-loaded`**: 伏せた画像の読み込み完了で DOM の変化を起こすために書く属性。両方のタグが書いても、互いの変化として記録されるだけで実害はない
- **`src/dynamic/agent/*` の `window.clarity`**: LiveChat・Tidio・Crisp 用の別のビルド(`clarity.livechat.js` など)で、サーバーの指示で読み込まれる。`ar.js`(`src/global.ts` 起点)には入らず、自社の受け口はその指示を返さない
- **`types/global.d.ts` の `__clr` の型**: 型だけで出力には出ない
- **版番号(`version`)**: clarity-decode が版を見るので、上流と同じにしている
- **上流のテスト**: `packages/clarity-js/test/consentv2.test.ts` などは `window.clarity` と `_clck` を直書きしているので、このフォークでは落ちる。上流のテストは直さない(追従の衝突を増やさないため)。動作の確認は AntReplay の PoC(`~/ant-replay/poc/01-fork/`)で行う

## ビルド

```bash
yarn install --frozen-lockfile
tools/arinko-update.sh --build-only   # 積み直さずにビルドと名前の検査だけ
```

- 出力は `dist/ar.js`(`packages/clarity-js/build/clarity.min.js` の先頭に、版・コミット・MIT ライセンスの1行を足したもの)と `dist/BUILD-INFO`
- 名前の検査: `ar.js` に `_clck` `_clsk` `_cltk` `__clr` が1つでも残っていたら、または `"antreplay"` `_arck` `_arsk` `_artk` `__arr` が無ければ、終了コード 4 で止まる。上流が新しくこれらの名前を使い始めたときに、黙って Microsoft のタグと状態を共有する版を配らないため

## 上流への追従

```bash
tools/arinko-update.sh           # 最新の安定版タグへ積み直す → ビルド → 名前の検査
tools/arinko-update.sh --push    # 上に加えて origin の arinko/patches を更新する
```

- `git fetch upstream --tags` → 最新の安定版タグ(`v0.8.72` の形。`-beta` は除く)を選ぶ → `git rebase --onto <新タグ> <今の基点のタグ> arinko/patches` → `yarn install` → ビルド → 名前の検査
- 積み直す前の状態は `backup/arinko-patches-<元のタグ>` のブランチに残る
- **衝突したら rebase を取り消して元に戻し、衝突したファイル名を表示して終了コード 2 で止まる**(macOS では通知センターにも出す)。手で直すときは表示されたコマンドで rebase をやり直す
- ブランチは積み直しで書き換わるので、push は `--force-with-lease`。`arinko/patches` へ PR をマージするときもマージコミットを作らず rebase で積む
- 定期実行(cron・LaunchAgent・GitHub Actions)はまだ入れていない
- 2026-10-08 に一時の worktree で v0.8.71 → v0.8.72 の積み直しを試し、衝突なしでビルドと名前の検査まで通った(約13秒)。衝突の経路は、`queue.ts` の差し込み口と同じ行を書き換えた偽のタグで試し、rebase を取り消して元のコミットに戻ること・終了コード 2 を確かめた

## ページへの組み込み

```html
<script>
(function (w, d, a, src) {
  w[a] = w[a] || function () { (w[a].q = w[a].q || []).push(arguments); };
  var t = d.createElement("script"); t.async = 1; t.src = src;
  var y = d.getElementsByTagName("script")[0]; y.parentNode.insertBefore(t, y);
})(window, document, "antreplay", "/_r/ar.js");
antreplay("start", { projectId: "<サイト名>", upload: "/_r/c.php", track: true, content: true, lean: false });
</script>
```

- `start` は `antreplay("start", {...})` の1回で足りる(Microsoft のタグはローダーが `start` を呼ぶが、`ar.js` は自分では呼ばない)
- **Microsoft 側のマスク設定「バランス」と同じにするなら `unmask: ["body"]` も渡す。**2026-10-08 に antlaunch.jp のローダー(`www.clarity.ms/tag/yshfdg84k7`)が渡していた設定は `"content":true,"unmask":["body"]` だった。`content: true` だけだと、本文の中の数字や `@` を含む語が伏せられる(`影の中の文字 1` が `影の中の文字 ▫` になった)。`unmask: ["body"]` を足しても、入力欄(`input` など)と `data-clarity-mask` を付けた要素は伏せたまま
- 独自イベントとカスタムタグは `antreplay("event", "<名前>")` と `antreplay("set", "<キー>", "<値>")`。Microsoft 側にも送るなら `clarity(...)` も呼ぶ
- `upload` に `http://` で始まる絶対 URL を渡さない。`_arsk` に書いた送信先は、次のページで `https://` を前に付けて読み戻されるので、`http://` だと壊れる(上流の仕様。`/` で始まる相対パスか `https://` の URL にする)
