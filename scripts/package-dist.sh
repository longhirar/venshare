#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$HOME/Documents/Github/Vencord}"
OUT_DIR="$REPO_DIR/release"
OUT_FILE="$OUT_DIR/venshare-dist.tar.gz"

if [ ! -d "$VENCORD_DIR" ]; then
    echo "Error: Vencord directory not found at $VENCORD_DIR" >&2
    exit 1
fi

echo "==> Syncing venshare into $VENCORD_DIR/src/userplugins/venshare"
mkdir -p "$VENCORD_DIR/src/userplugins/venshare"
rsync -a --delete --exclude='.git' --exclude='release' --exclude='scripts' \
    "$REPO_DIR/" "$VENCORD_DIR/src/userplugins/venshare/"

echo "==> Building Vencord (cross-platform JS/CSS bundle)"
(cd "$VENCORD_DIR" && pnpm build)

echo "==> Packaging dist into $OUT_FILE"
mkdir -p "$OUT_DIR"
TMP_STAGE="$(mktemp -d)"
trap 'rm -rf "$TMP_STAGE"' EXIT

mkdir -p "$TMP_STAGE/dist"
for f in \
    patcher.js \
    preload.js \
    renderer.js \
    renderer.css \
    vencordDesktopMain.js \
    vencordDesktopPreload.js \
    vencordDesktopRenderer.js \
    vencordDesktopRenderer.css; do
    if [ -f "$VENCORD_DIR/dist/$f" ]; then
        cp "$VENCORD_DIR/dist/$f" "$TMP_STAGE/dist/$f"
    fi
done
echo '{}' > "$TMP_STAGE/dist/package.json"

tar -czf "$OUT_FILE" -C "$TMP_STAGE" dist
ls -lh "$OUT_FILE"
echo "Done! Upload $OUT_FILE to a GitHub Release to serve via install-linux.sh."
