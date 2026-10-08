import config from "@src/core/config";
import { bind } from "@src/core/event";

// タブが裏に回った(visibilitychange で hidden になった)とき、溜まっている分を送信の間隔を待たずに、
// 通常の送信(XHR・gzip)で出す。設定 flushOnHide: false で切る(既定は有効)。
// ページを離れるときの最後の送信(sendBeacon)は約64KB を超えると送られず、clarity-js は再生データを丸ごと落とす。
// 裏に回った時点で出しておけば、最後の送信に残る量が減る。スマートフォンでアプリを切り替えたまま閉じられたときのように、
// pagehide が来ないまま終わるページでも、裏に回るまでの分は届く。
// Chrome 154 で測った順番は、ページの移動でもタブを閉じるときも beforeunload → pagehide → visibilitychange → unload。
// clarity-js は pagehide で止まり、そのときこのリスナーも外れるので、移動と閉じるときは上流どおり sendBeacon で終わる。
// 差し込み口: src/data/upload.ts の start()(このリスナーを付ける)と、同じファイルの flushNow()(溜まっている分を出す)。
// リスナーは document ではなく window に capture で付ける。src/layout/node.ts の observe() は、event.has(document) が
// true だと「もう監視している」とみなして DOM の変化と操作(クリック・スクロールなど)の監視を始めない。upload.ts の start() は
// layout より先に動くので、document に付けると録画から操作がすべて消える(2026-10-08 に一度これで壊した)。
// visibilitychange は document で発生して window まで届く(capture なら、bubbles の無い合成イベントでも届く)。
export function start(flush: () => void): void {
    if (config.flushOnHide !== false && typeof window !== "undefined" && typeof document !== "undefined") {
        bind(window, "visibilitychange", (): void => {
            if (document.visibilityState === "hidden") { flush(); }
        }, true);
    }
}
