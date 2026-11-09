#!/usr/bin/env bash
# Sandbox E2E: loads this folder as a magpie plugin in an isolated HOME,
# signs in with a fake key, and exercises the 401 path against the real
# gateway. Run from the repo root:  bash scripts/e2e-magpie.sh
set -uo pipefail
cd "$(dirname "$0")/.."

REPO_WIN=$(cygpath -w "$(pwd)" 2>/dev/null || pwd)
SB=$(mktemp -d)
trap 'rm -rf "$SB"' EXIT

m() {
  env HOME="$SB" XDG_CONFIG_HOME="$SB/.config" XDG_CACHE_HOME="$SB/.cache" MAGPIE_ADDR=127.0.0.1:3499 \
    ./tools/magpie.exe "$@"
}

echo "== plugin add (folder: $REPO_WIN)"
m plugin add "$REPO_WIN" </dev/null

echo "== plugin --json"
m plugin --json

for id in xfyun-maas xfyun-coding xfyun-token; do
  echo "== login $id (fake key)"
  printf 'ak-e2e-fake-key-%s\n' "$id" | m plugin login "$id" || echo "(login rc=$?)"
done

echo "== plugin"
m plugin

echo "== provider test xfyun-maas (fake key -> expect 401 handling, not a crash)"
m provider test xfyun-maas || echo "(provider test rc=$?)"

echo "== done"
