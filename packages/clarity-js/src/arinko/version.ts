// ar.js の版。ビルドの後に tools/arinko-update.sh がこの文字列を置き換える(例 0.8.71-arinko.20261008.91420c8)。
// ページからは window.__arrVersion で読む。window.antreplay("version") は使えない(上流の公開関数は
// clarity.ts が書き出した関数を名前で呼ぶ形で、version は関数ではなく文字列のため)。
// 各サイトは ar.js?v=<この版> の形で読む(arinko.jp の .htaccess は js に1週間の Expires を付ける)。
// 差し込み口: src/global.ts(ar.js の入口)の import 1行。
const Build = "@@ARINKO_BUILD@@";

if (typeof window !== "undefined") {
    window.__arrVersion = Build;
}
