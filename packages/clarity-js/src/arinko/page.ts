// 封筒(envelope)の末尾に足す2つの値。
// - e[12] key: ページの読み込みごとの乱数 ID(英小文字と数字の16文字)
// - e[13] time: ページの開始時刻(epoch ミリ秒。Metric の ClientTimestamp と同じ値)
// 上流の封筒(e[0]〜e[11])の start はページ内の相対時刻で、同じセッションで同時に開いた2つのタブは、セッション ID も
// ページ番号も同じになる。これを足さないと、2通目以降の送信がどちらのタブのものかを分けられない。
// clarity-decode の envelope() は e[0]〜e[11] だけを位置で読むので、末尾に足しても解読と再生は変わらない。
// 差し込み口: src/data/metadata.ts の start()(ページの開始ごとに start() を1回呼ぶ)と、src/data/envelope.ts の envelope()。
const Chars = "0123456789abcdefghijklmnopqrstuvwxyz";
const KeyLength = 16;

export let key: string = "";
export let time: number = 0;

export function start(ts: number): void {
    key = id();
    time = ts;
}

function id(): string {
    let bytes: Uint8Array = null;
    try {
        bytes = window.crypto.getRandomValues(new Uint8Array(KeyLength));
    } catch {
        bytes = null;
    }
    let output = "";
    for (let i = 0; i < KeyLength; i++) {
        output += Chars.charAt((bytes ? bytes[i] : Math.floor(Math.random() * 256)) % Chars.length);
    }
    return output;
}
