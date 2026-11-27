#!/usr/bin/env bash
set -euo pipefail

# Venshare Linux Installer & Updater (Fedora / Arch / Ubuntu / Flatpak)
# Usage:
#   Install or update (auto-detects existing install):
#     curl -fsSL https://raw.githubusercontent.com/longhirar/venshare/main/scripts/install-linux.sh | bash
#   Force update bundle only (skip Discord re-injection):
#     curl -fsSL https://raw.githubusercontent.com/longhirar/venshare/main/scripts/install-linux.sh | bash -s -- --update
#   Update bundle and re-inject into Discord (e.g. after a Discord client update):
#     curl -fsSL https://raw.githubusercontent.com/longhirar/venshare/main/scripts/install-linux.sh | bash -s -- --reinject
#   Uninstall:
#     curl -fsSL https://raw.githubusercontent.com/longhirar/venshare/main/scripts/install-linux.sh | bash -s -- --uninstall
#   Custom tarball URL:
#     VENSHARE_DIST_URL="https://..." curl -fsSL ... | bash

REPO="${VENSHARE_REPO:-longhirar/venshare}"
DIST_URL="${VENSHARE_DIST_URL:-https://github.com/${REPO}/releases/latest/download/venshare-dist.tar.gz}"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/venshare"
INSTALLER_BIN="$INSTALL_DIR/VencordInstallerCli-linux"
INSTALLER_URL="https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli-linux"

MODE="auto"
INSTALLER_ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        -u|--update)
            MODE="update"
            shift
            ;;
        -i|--install|--reinject|--repair)
            MODE="install"
            shift
            ;;
        --uninstall)
            MODE="uninstall"
            shift
            ;;
        -h|--help)
            sed -n '4,15p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        --)
            shift
            INSTALLER_ARGS+=("$@")
            break
            ;;
        *)
            INSTALLER_ARGS+=("$1")
            shift
            ;;
    esac
done

run_installer() {
    local action="$1"
    shift

    if [ ! -x "$INSTALLER_BIN" ]; then
        echo "==> Downloading VencordInstallerCli-linux..."
        mkdir -p "$INSTALL_DIR"
        curl -fL --progress-bar "$INSTALLER_URL" -o "$INSTALLER_BIN"
        chmod +x "$INSTALLER_BIN"
    fi

    # Reattach /dev/tty so interactive selection works even when piped via `curl | bash`
    if [ -r /dev/tty ]; then
        VENCORD_USER_DATA_DIR="$INSTALL_DIR" \
        VENCORD_DEV_INSTALL=1 \
        "$INSTALLER_BIN" "$action" "$@" </dev/tty
    else
        VENCORD_USER_DATA_DIR="$INSTALL_DIR" \
        VENCORD_DEV_INSTALL=1 \
        "$INSTALLER_BIN" "$action" "$@"
    fi
}

if [ "$MODE" = "uninstall" ]; then
    echo "==> Uninstalling Venshare from Discord..."
    run_installer --uninstall "${INSTALLER_ARGS[@]}"
    rm -rf "$INSTALL_DIR"
    echo "Done! Fully quit Discord and reopen it."
    exit 0
fi

ALREADY_INSTALLED=0
if [ -d "$INSTALL_DIR/dist" ]; then
    ALREADY_INSTALLED=1
fi

if [ "$MODE" = "auto" ]; then
    if [ "$ALREADY_INSTALLED" -eq 1 ]; then
        MODE="update"
    else
        MODE="install"
    fi
fi

if [ "$MODE" = "update" ]; then
    echo "==> Updating Venshare in $INSTALL_DIR"
else
    echo "==> Installing Venshare (Vencord + WebRTC Screen Share) to $INSTALL_DIR"
fi

mkdir -p "$INSTALL_DIR"

echo "==> Downloading prebuilt Venshare bundle..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_TAR="$TMP_DIR/venshare-dist.tar.gz"

if ! curl -fL --progress-bar "$DIST_URL" -o "$TMP_TAR"; then
    echo "Error: Failed to download bundle from $DIST_URL" >&2
    echo "Make sure a GitHub Release with venshare-dist.tar.gz exists, or pass VENSHARE_DIST_URL." >&2
    exit 1
fi

tar -xzf "$TMP_TAR" -C "$TMP_DIR"
if [ ! -d "$TMP_DIR/dist" ]; then
    echo "Error: Downloaded archive does not contain a dist/ directory." >&2
    exit 1
fi

rm -rf "$INSTALL_DIR/dist"
mv "$TMP_DIR/dist" "$INSTALL_DIR/dist"

if [ "$MODE" = "update" ]; then
    echo ""
    echo "Updated Venshare bundle in $INSTALL_DIR/dist!"
    echo "Fully quit Discord and reopen it to load the new version."
    echo "(If Discord itself updated and removed Vencord, re-run with: --reinject)"
    exit 0
fi

echo "==> Injecting into Discord..."
echo "    (On Fedora: if Discord was installed via RPM Fusion in /usr/lib64/discord, you may be prompted for sudo.)"
run_installer --install "${INSTALLER_ARGS[@]}"

echo ""
echo "Done! Fully quit Discord and reopen it, then enable 'Venshare' in Settings -> Vencord -> Plugins."
echo "To update later, simply re-run this script."
