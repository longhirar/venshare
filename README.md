# Venshare

Serverless **P2P WebRTC** screen sharing plugin for **Vencord** (built for STUN / IPv6 direct connections, with zero external signaling servers).

## How It Works

1. **In-band auto-deleting signaling:** When you start a stream or click Watch, Venshare compresses the WebRTC SDP + STUN/IPv6 ICE candidates (`deflate-raw` + base64url) into a `[venshare:v1:...]` message in the voice channel's text chat and **automatically deletes it** after a few seconds (or immediately once the handshake completes).
2. **Direct P2P Media:** Video and audio flow directly between peers via `RTCPeerConnection` using STUN-only discovery.
3. **STUN Selector:** Switch between **Cloudflare** (`stun.cloudflare.com:3478`), **Google** (`stun.l.google.com:19302`), or a **Custom** STUN server in both Vencord Settings and the Go Live modal.

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
