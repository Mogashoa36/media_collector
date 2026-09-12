# yt-dlp + FFmpeg setup (optional local helper)

yt-dlp is **optional** in VideoVault. Direct media, browser-detected media,
and the SaveFrom fallback keep working when it is missing. Install it only if
you want format listings (720p/1080p/audio-only…) for YouTube, TikTok,
Instagram, Facebook, X/Twitter, Reddit, Vimeo and other yt-dlp sites.

## 1. Install yt-dlp + FFmpeg

**Ubuntu/Debian**

```bash
sudo apt update
sudo apt install -y yt-dlp ffmpeg
```

**macOS (Homebrew)**

```bash
brew install yt-dlp ffmpeg
```

**Windows (winget)**

```powershell
winget install yt-dlp yt-dlp
winget install Gyan.FFmpeg
```

Verify:

```bash
yt-dlp --version
ffmpeg -version
```

> FFmpeg is only needed when merging separate video+audio streams (e.g.
> 1080p MP4 + M4A) or converting containers. Plain progressive files work
> without it; the provider surfaces `FFmpeg unavailable` instead of failing
> silently.

## 2. Register the native-messaging helper

The popup never runs shell commands from page content. It talks to a small
local helper over `chrome.runtime.sendNativeMessage`. Reference helper
(`native-host/videovault_ytdlp.py`):

- `ping` → `{ ok, ytdlp: true/false, ffmpeg: true/false }`
- `formats {url}` → `{ title, formats: [{ format, ext, quality, url?, formatId }] }`
  (yt-dlp `--dump-json --no-playlist`; maps login/private signals to
  `authRequired`/`private`)
- `download {url, formatId}` → streams `{progress}` then `{done}`

Install the manifest:

Linux: `~/.config/google-chrome/NativeMessagingHosts/com.videovault.ytdlp.json`
macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/…`
Windows registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.videovault.ytdlp`

Then allow the permission in `manifest.json`:

```json
"permissions": ["storage", "tabs", "activeTab", "nativeMessaging"]
```

## 3. Behavior in the popup

- **Detecting media → Preparing download → Downloading → Complete/Failed**
  states are shown in the format picker.
- **Login required** shows “You’re currently logged out of this site…” with
  **Open Site & Login** (opens the original URL) and **Retry** (re-runs the
  provider, no page refresh).
- No passwords, cookies, session tokens or auth headers are requested,
  extracted or stored. Login happens on the platform itself.
- DRM, paywalls, private content, CAPTCHAs and platform controls are never
  bypassed.
