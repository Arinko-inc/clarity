import { Constant } from "@clarity-types/data";

// セッションのクッキー(_arsk)に書く送信先。
// 上流は送信先から https:// を外して書き、次のページで読むときに / で始まらなければ https:// を前に付けて戻す。
// そのため http:// の絶対 URL は、次のページで https://http//… の形に壊れる(2026-10-08 の PoC 2 で実測)。
// / で始まる相対パスと https:// の URL だけを書き、それ以外は書かない(次のページはページ側の設定の送信先を使う)。
// 差し込み口: src/data/metadata.ts の save()。
export function upload(value: unknown): string {
    if (typeof value !== "string") { return Constant.Empty; }
    if (value.charAt(0) === "/") { return value; }
    return value.indexOf(Constant.HTTPS) === 0 ? value.substring(Constant.HTTPS.length) : Constant.Empty;
}
