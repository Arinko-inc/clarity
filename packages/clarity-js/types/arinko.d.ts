// AntReplay(株式会社ありんこ)のフォークで変える名前を、このファイル1か所にまとめる。
// Microsoft Clarity のタグ(window.clarity・クッキー _clck/_clsk/_cltk・window.__clr)と同じページで動かしても、
// 互いのクッキー・グローバル変数・フックの状態を書き換えないようにするため。
// どのファイルのどの行から参照しているかは、リポジトリ直下の ARINKO-PATCHES.md に列挙してある。
export const enum ArinkoName {
    Global = "antreplay", // window.clarity の代わり。ページ側のスニペットの c[a] もこの名前にする
    CookieKey = "_arck", // _clck の代わり(ユーザー ID のクッキー)
    SessionKey = "_arsk", // _clsk の代わり(セッションのクッキー。送信先の URL も持つ)
    TabKey = "_artk", // _cltk の代わり(sessionStorage のタブ ID)
    Hooks = "__arr", // window.__clr の代わり(CSS・Shadow DOM・customElements のフックが元の関数を持つ)
    StyleSheetId = "__arrSId", // __clrSId の代わり(CSSStyleSheet に付ける ID)
    AnimationId = "__arrAId", // __clrAId の代わり(Animation に付ける ID)
    OperationCount = "__arrOCnt" // __clrOCnt の代わり(Animation の操作回数)
}

declare global {
    interface Window {
        __arr?: { [key: string]: ((...args: any[]) => any) | undefined };
        __arrVersion?: string; // ar.js の版(src/arinko/version.ts)
    }
}
