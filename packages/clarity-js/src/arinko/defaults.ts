// AntReplay での設定の既定値。ページから antreplay("start", {...}) で渡した値が優先する。
// 差し込み口は src/core/config.ts の既定値の2行。
// - Upload: 各サイトの受け口。/ で始まる相対パスにする(http:// の絶対 URL は2ページ目以降で壊れる。cookie.ts を参照)
// - Unmask: Microsoft Clarity のマスク設定「バランス」と同じにする。Microsoft のローダーは "content":true,"unmask":["body"] を渡している
//   (2026-10-08、antlaunch.jp のローダーで確認)。入力欄と data-clarity-mask を付けた要素は、これを指定しても伏せたまま
export const Upload = "/_r/c.php";
export const Unmask = ["body"];
