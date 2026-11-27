# Venshare

Serverless **WebRTC** screen sharing plugin for **Vencord** with **Cloudflare TURN** and **Custom TURN/STUN** support (zero external signaling servers).

## How It Works

1. **In-band auto-deleting signaling:** When you start a stream or click Watch, Venshare compresses the WebRTC SDP + ICE candidates (`deflate-raw` + base64url, automatically chunked if over Discord's 2000-character limit) into `[venshare:v1:...]` message(s) in the voice channel's text chat and **automatically deletes them** after a few seconds (or immediately once the handshake completes).
2. **Cloudflare TURN (Recommended):** Calls the Cloudflare Realtime TURN API (`POST /v1/turn/keys/:keyId/credentials/generate-ice-servers`) from the Electron main process (avoiding Discord CORS/CSP restrictions) using your **TURN Key ID** and **API Token** to generate short-lived ephemeral ICE credentials. Temporary credentials are cached locally and automatically shared with viewers in the SDP offer so viewers do not need their own Cloudflare API key.
3. **Custom TURN / STUN or STUN-Only:** Switch between **Cloudflare TURN**, a **Custom TURN/STUN** server (comma-separated `turn:` / `turns:` / `stun:` URLs with optional username & credential), or **STUN Only** in both Vencord Settings and the Go Live modal. Includes an optional **Force TURN Relay** toggle.

## Cloudflare TURN Setup

1. In the Cloudflare Dashboard, open **Realtime -> TURN** and create a TURN Key.
2. Copy the **TURN Token ID (Key ID)** and **API Token**.
3. Paste them into Venshare plugin settings (or directly inside the Go Live modal) and click **Test Config** to verify credential generation.

## Installation (Vencord `userplugins`)

1. Clone Vencord and install dependencies:
   ```bash
   git clone https://github.com/Vendicated/Vencord
   cd Vencord && pnpm i
   ```
2. Symlink this repository into `src/userplugins/venshare`:
   ```bash
   mkdir -p src/userplugins
   ln -s /Users/longhi/Documents/Github/venshare src/userplugins/venshare
   ```
3. Build and inject Vencord:
   ```bash
   pnpm build --dev --watch
   ```
4. Enable **Venshare** in Vencord Plugins settings.

## Usage

- Join any voice channel and click **Share Screen** in the Venshare voice panel (or run `/venshare`).
- Both streamer and viewers must have the **Venshare** plugin enabled.
