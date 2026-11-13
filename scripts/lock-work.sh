#!/usr/bin/env bash
# Lock the work page with a password.
#
# The readable page is work/index.src.html in the main checkout. Git ignores it.
# This script encrypts it with StatiCrypt and writes the locked page to
# work/index.html, which is the only version that is committed and published.
#
# Settings come from .env in the main checkout (never committed):
#   WORK_PASSWORD=...            required
#
# Usage:
#   scripts/lock-work.sh           lock again only if the page or password changed
#   scripts/lock-work.sh --force   lock again anyway
#   scripts/lock-work.sh --share   print a link that opens the page without typing the password
set -euo pipefail

STATICRYPT="staticrypt@3.5.4"

top=$(git rev-parse --show-toplevel)
cd "$top"
common=$(cd "$(git rev-parse --git-common-dir)" && pwd)
main_root=$(dirname "$common")

# Load .env: the main checkout first, then this checkout (worktrees have their own folder).
for f in "$main_root/.env" "$top/.env"; do
  if [ -f "$f" ]; then set -a; . "$f"; set +a; fi
done

WORK_SRC="$main_root/work/index.src.html"
out="$top/work/index.html"
stamp="$common/work-lock.stamp"

if [ ! -f "$WORK_SRC" ]; then
  echo "lock-work: readable work page not found: $WORK_SRC" >&2
  exit 1
fi
if [ -z "${WORK_PASSWORD:-}" ]; then
  echo "lock-work: WORK_PASSWORD is not set. Add it to $main_root/.env" >&2
  exit 1
fi

if [ "${1:-}" = "--share" ]; then
  npx -y "$STATICRYPT" "$WORK_SRC" -p "$WORK_PASSWORD" -c scripts/staticrypt.json \
    --share "https://weiniverse.com/work/" --share-remember -d "$(mktemp -d)" 2>/dev/null \
    | grep -o 'https://[^ ]*'
  exit 0
fi

# Skip if nothing changed since the last lock (the locked file is different on every run,
# so locking again without a reason would make a noisy diff).
want=$( { shasum -a 256 "$WORK_SRC"; printf '%s' "$WORK_PASSWORD" | shasum -a 256; } | shasum -a 256 | cut -d' ' -f1)
if [ "${1:-}" != "--force" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ] \
   && grep -q "staticrypt" "$out" 2>/dev/null; then
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$WORK_SRC" "$tmp/index.html"

npx -y "$STATICRYPT" "$tmp/index.html" \
  -p "$WORK_PASSWORD" \
  -c scripts/staticrypt.json \
  -d "$tmp/out" \
  --remember 30 \
  --template-title "Wei Rui · Work" \
  --template-instructions "This page is private. Enter the password you were given." \
  --template-button "Open" \
  --template-placeholder "Password" \
  --template-remember "Remember me on this device" \
  --template-error "That password is not right." \
  --template-color-primary "#0f4c81" \
  --template-color-secondary "#f6f8fa" >/dev/null

# Keep search engines away from the password page too.
sed -i '' 's#<head>#<head>\n    <meta name="robots" content="noindex" />#' "$tmp/out/index.html"

mv "$tmp/out/index.html" "$out"
echo "$want" > "$stamp"
echo "lock-work: locked work/index.html"
