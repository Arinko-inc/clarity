import { Setting } from "@clarity-types/data";
import config from "@src/core/config";

// 送信間隔の上限(設定 maxDelay、ミリ秒)。未指定(null)か 0 以下なら上流どおり(最長 30 秒)。
// 上流の delay() は送信のたびに間隔を延ばすので、長く滞在したページほど離脱時の最後の送信(sendBeacon、64KB まで)が大きくなり、
// 超えると再生データを丸ごと落とす。上限を短くすると、最後の送信に残る量が減る。
// 呼び出し元(差し込み口)は src/data/upload.ts の queue() の `let gap = cap(delay());`。
export function cap(gap: number): number {
    let max = config.maxDelay;
    return typeof max === "number" && max > 0 ? Math.min(gap, Math.max(max, Setting.MinUploadDelay)) : gap;
}
