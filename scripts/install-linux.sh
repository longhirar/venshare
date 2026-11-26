#!/usr/bin/env bash
set -euo pipefail

# Venshare Linux Installer (Fedora / Arch / Ubuntu / Flatpak)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<USER>/venshare/main/scripts/install-linux.sh | bash
# Or with a custom tarball URL:
#   VENSHARE_DIST_URL="https://..." curl -fsSL ... | bash

REPO="${VENSHARE_REPO:-longhi/venshare}"
DIST_URL="${VENSHARE_DIST_URL:-https://github.com/${REPO}/releases/latest/download/venshare-dist.tar.gz}"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/venshare"
INSTALLER_BIN="$INSTALL_DIR/VencordInstallerCli-linux"
INSTALLER_URL="https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli-linux"

echo "==> Installing Venshare (Vencord + P2P Screen Share) to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

echo "==> Downloading prebuilt Venshare bundle..."
TMP_TAR="$(mktemp)"
trap 'rm -f "$TMP_TAR"' EXIT

if ! curl -fL --progress-bar "$DIST_URL" -o "$TMP_TAR"; then
    echo "Error: Failed to download bundle from $DIST_URL" >&2
    echo "Make sure a GitHub Release with venshare-dist.tar.gz exists, or pass VENSHARE_DIST_URL." >&2
    exit 1
fi

rm -rf "$INSTALL_DIR/dist"
tar -xzf "$TMP_TAR" -C "$INSTALL_DIR"

echo "==> Downloading VencordInstallerCli-linux..."
curl -fL --progress-bar "$INSTALLER_URL" -o "$INSTALLER_BIN"
chmod +x "$INSTALLER_BIN"

echo "==> Injecting into Discord..."
echo "    (On Fedora: if Discord was installed via RPM Fusion in /usr/lib64/discord, you may be prompted for sudo.)"

# Reattach /dev/tty so interactive selection works even when piped via `curl | bash`
if [ -r /dev/tty ]; then
    VENCORD_USER_DATA_DIR="$INSTALL_DIR" \
    VENCORD_DEV_INSTALL=1 \
    "$INSTALLER_BIN" --install "$@" </dev/tty
else
    VENCORD_USER_DATA_DIR="$INSTALL_DIR" \
    VENCORD_DEV_INSTALL=1 \
    "$INSTALLER_BIN" --install "$@"
fi

echo ""
echo "Done! Fully quit Discord and reopen it, then enable 'Venshare' in Settings -> Vencord -> Plugins."
