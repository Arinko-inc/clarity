#!/usr/bin/env bash
# Arinko-inc/clarity の上流追従とビルド。
# 上流(microsoft/clarity)の最新の安定版タグに arinko/patches を積み直し(rebase)、clarity-js をビルドして dist/ar.js を作る。
# 積み直しで衝突したら、rebase を取り消して元の状態に戻し、衝突したファイルを表示して終了コード 2 で止まる。
#
# 使い方(リポジトリのどこからでも、このスクリプトの置き場所のリポジトリに対して動く):
#   tools/arinko-update.sh                 最新の安定版タグへ積み直す → ビルド → 名前の検査 → dist/ar.js
#   tools/arinko-update.sh --push          上に加えて origin の arinko/patches を更新する(--force-with-lease)
#   tools/arinko-update.sh --build-only    積み直さず、今のブランチでビルドと検査だけ行う
#   tools/arinko-update.sh --to v0.8.72    積み直す先のタグを指定する(既定は v数字.数字.数字 の最新。-beta は使わない)
#   tools/arinko-update.sh --branch NAME   arinko/patches 以外のブランチで試す(worktree での試験用)
#
# 終了コード: 0 成功(積み直し不要を含む) / 1 前提の不備 / 2 積み直しで衝突 / 3 ビルド失敗 / 4 名前の検査で不合格
# パッチの一覧と差し込み口は ARINKO-PATCHES.md。
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="arinko/patches"
TO=""
PUSH=0
BUILD_ONLY=0
UPSTREAM_URL="https://github.com/microsoft/clarity.git"

while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --to) TO="$2"; shift ;;
    --branch) BRANCH="$2"; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
  shift
done

cd "$REPO"
log() { printf '[arinko-update] %s\n' "$*"; }
fail() { local code="$1"; shift; printf '[arinko-update] 失敗: %s\n' "$*" >&2; notify "$*"; exit "$code"; }
notify() {
  # 手で叩いたときは画面の表示で足りる。macOS なら通知センターにも出す(cron 等で回したときの気づき用)
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$(printf '%s' "$1" | tr '"' "'" | cut -c1-200)\" with title \"Arinko-inc/clarity 追従\"" >/dev/null 2>&1 || true
  fi
}

# 前提: 作業ツリーがきれいで、対象ブランチにいる
[ -z "$(git status --porcelain)" ] || fail 1 "作業ツリーに未コミットの変更がある($REPO)。片付けてから実行する"
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT" = "$BRANCH" ] || fail 1 "今のブランチは ${CURRENT}。$BRANCH に切り替えてから実行する"

if [ "$BUILD_ONLY" -eq 0 ]; then
  git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
  log "上流のタグを取得"
  git fetch --quiet --tags --force upstream
  if [ -z "$TO" ]; then
    TO="$(git tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)"
  fi
  [ -n "$TO" ] || fail 1 "上流の安定版タグが見つからない"
  git rev-parse -q --verify "refs/tags/$TO" >/dev/null || fail 1 "タグ $TO が無い"
  BASE="$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' HEAD)" || fail 1 "今の基点のタグが分からない"
  log "基点: $BASE → 積み直す先: $TO"
  if [ "$BASE" = "$TO" ]; then
    log "すでに $TO に載っている。積み直しは不要"
  else
    BACKUP="backup/${BRANCH//\//-}-$BASE"
    git branch -f "$BACKUP" HEAD
    log "積み直し前の状態を $BACKUP に残した"
    if ! git rebase --onto "$TO" "$BASE" "$BRANCH" >/tmp/arinko-update-rebase.$$.log 2>&1; then
      CONFLICTS="$(git diff --name-only --diff-filter=U | tr '\n' ' ')"
      git rebase --abort || true
      cat /tmp/arinko-update-rebase.$$.log >&2
      rm -f /tmp/arinko-update-rebase.$$.log
      fail 2 "$TO への積み直しで衝突した: ${CONFLICTS:-(ファイル名を取れず)}。rebase は取り消して $BASE の状態に戻した。手で直すなら: git rebase --onto $TO $BASE $BRANCH"
    fi
    rm -f /tmp/arinko-update-rebase.$$.log
    log "$TO に積み直した"
  fi
fi

log "依存を入れる(yarn install --frozen-lockfile)"
yarn install --frozen-lockfile --silent >/tmp/arinko-update-yarn.$$.log 2>&1 || { tail -20 /tmp/arinko-update-yarn.$$.log >&2; fail 3 "yarn install に失敗した"; }
rm -f /tmp/arinko-update-yarn.$$.log

log "clarity-js をビルド"
BUILD_LOG="$(mktemp "${TMPDIR:-/tmp}/arinko-build.XXXXXX")"
yarn --silent build:js >"$BUILD_LOG" 2>&1 || { tail -30 "$BUILD_LOG" >&2; fail 3 "ビルドに失敗した(ログ $BUILD_LOG)"; }
if grep -q 'TS[0-9]\{4\}' "$BUILD_LOG"; then
  log "注意: 型の警告がある(ログ $BUILD_LOG)"
  perl -pe 's/\e\[[0-9;]*m//g' "$BUILD_LOG" | grep 'TS[0-9]\{4\}' | sort | uniq -c | head -10
fi

MIN="packages/clarity-js/build/clarity.min.js"
[ -s "$MIN" ] || fail 3 "$MIN ができていない"

# 名前の検査: Microsoft のタグと同じ名前が残っていたら配らない(上流が新しく足した参照を拾うため)
BAD=""
for s in _clck _clsk _cltk __clr; do
  n="$({ grep -o -- "$s" "$MIN" || true; } | wc -l | tr -d ' ')"
  [ "$n" = "0" ] || BAD="$BAD $s($n)"
done
for s in '"antreplay"' _arck _arsk _artk __arr; do
  grep -q -- "$s" "$MIN" || BAD="$BAD 無い:$s"
done
[ -z "$BAD" ] || fail 4 "名前の検査で不合格:${BAD}。上流が新しく使い始めた名前を types/arinko.d.ts 経由に直す"

UPSTREAM_TAG="$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' HEAD)"
SHA="$(git rev-parse --short=12 HEAD)"
VERSION="$(node -p "require('./packages/clarity-js/package.json').version")"
# ar.js の版: <上流の版>-arinko.<ビルドした日>.<フォークのコミットの短い SHA>。window.__arrVersion で読め、各サイトは ar.js?v=<版> で読む
BUILD="${VERSION}-arinko.$(date '+%Y%m%d').$(git rev-parse --short=7 HEAD)"
PLACEHOLDER='@@ARINKO_BUILD@@'
n="$({ grep -o -- "$PLACEHOLDER" "$MIN" || true; } | wc -l | tr -d ' ')"
[ "$n" = "1" ] || fail 4 "版の置き場所($PLACEHOLDER)が ${n} 個ある(1個のはず。src/arinko/version.ts を見る)"
mkdir -p dist
{
  printf '/*! AntReplay ar.js %s = clarity-js %s (Copyright (c) Microsoft Corporation, MIT License, https://github.com/microsoft/clarity) + Arinko-inc/clarity %s (%s) */\n' "$BUILD" "$VERSION" "$SHA" "$UPSTREAM_TAG"
  PH="$PLACEHOLDER" B="$BUILD" perl -pe 's/\Q$ENV{PH}\E/$ENV{B}/g' "$MIN"
} > dist/ar.js
grep -q -- "\"$BUILD\"" dist/ar.js || fail 4 "dist/ar.js に版の文字列 $BUILD が入っていない"
RAW="$(wc -c < dist/ar.js | tr -d ' ')"
GZ="$(gzip -9c dist/ar.js | wc -c | tr -d ' ')"
printf 'build=%s\nupstream_tag=%s\ncommit=%s\nversion=%s\nbuilt_at=%s\nbytes=%s\ngzip_bytes=%s\n' \
  "$BUILD" "$UPSTREAM_TAG" "$(git rev-parse HEAD)" "$VERSION" "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$RAW" "$GZ" > dist/BUILD-INFO
log "dist/ar.js を作った: 版 ${BUILD}、$RAW バイト(gzip -9 で $GZ バイト)、上流 ${UPSTREAM_TAG}、コミット $SHA"

if [ "$PUSH" -eq 1 ]; then
  log "origin の $BRANCH を更新(--force-with-lease)"
  git push --force-with-lease origin "$BRANCH"
fi
log "完了"
