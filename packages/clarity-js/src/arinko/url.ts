import { Constant } from "@clarity-types/layout";

// URL・参照元・クリック先の URL と、DOM のリンク先の属性から、utm_* と広告のクリック ID 以外のクエリ文字列と、
// フラグメント(# 以降)を落とす。上流の config.drop は名前を挙げた項目しか伏せないので、メールアドレスやトークンが
// URL に載ると録画に残る。
// 呼び出し元(差し込み口)は src/core/scrub.ts の url() の先頭、src/data/metadata.ts の参照元(Dimension.Referrer)、
// src/layout/encode.ts の attribute()(DOM のスナップショットと変化に入る属性)。
// scrub.url() は封筒の url・Dimension.Url・クリック先(interaction/encode.ts, encodeV2.ts)・スクリプトエラーの source が通る。
const KeepPrefix = "utm_";
const KeepNames = ["gclid", "twclid", "fbclid", "yclid"];

export function clean(input: string): string {
    if (!input || typeof input !== "string") { return input; }
    let hash = input.indexOf("#");
    let rest = hash >= 0 ? input.substring(0, hash) : input;
    let question = rest.indexOf("?");
    if (question < 0) { return rest; }
    let kept = rest.substring(question + 1).split("&").filter(keep);
    return kept.length > 0 ? rest.substring(0, question) + "?" + kept.join("&") : rest.substring(0, question);
}

function keep(pair: string): boolean {
    let name = pair.split("=")[0];
    try {
        name = decodeURIComponent(name.replace(/\+/g, " "));
    } catch {
        // 解読できない名前は、そのままの文字列で比べる
    }
    name = name.toLowerCase();
    return name.indexOf(KeepPrefix) === 0 || KeepNames.indexOf(name) >= 0;
}

// DOM の属性のうち、移動先の URL を持つもの(<link> 以外の href、form の action、button の formaction)を削る。
// - # で始まる値(ページ内リンク)はそのまま残す。デッドクリックの判定で、ページ内リンクを見分けるのに使う
// - <link> の href と、src・srcset は削らない。再生のときにその URL から CSS・フォント・画像を読み込むため
//   (例 Google Fonts の css2?family=…、app.js?v=…)。<link> の href は上流でも伏せずにそのまま送っている
export function attribute(key: string, value: string, tag: string): string {
    if (typeof value !== "string" || value.charAt(0) === "#") { return value; }
    let link = key === "href" && tag !== Constant.LinkTag;
    return link || key === "action" || key === "formaction" ? clean(value) : value;
}
