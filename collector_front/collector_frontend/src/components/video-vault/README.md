# VideoVault

VideoVault is a Manifest V3 Chrome extension for saving and organizing videos. It is backend-free: videos and collections persist in `chrome.storage.local`. Opening `popup.html` outside Chrome falls back to `localStorage` and seeds four realistic examples for preview.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Select **Load unpacked**, then choose this `video-vault` folder.
4. Pin VideoVault from the extensions menu and click its icon.

## Test saving

Open a video page in the active tab, open the VideoVault popup, and click **Save Current Video**. The extension reads the active tab URL and title with `chrome.tabs.query()`, detects the platform, creates a thumbnail URL, and shows a confirmation toast. Favorites, search, sorting, details, opening, deletion, and collections work with the seeded examples immediately.

## Storage

Saved items use the `videovault_videos` key and collections use `videovault_collections` in `chrome.storage.local`. Inspect them in popup DevTools under **Application > Storage > Extension storage**.

## Connecting Spring Boot later

Keep `js/storage.js` as the UI-facing contract and replace its read/write implementations with `fetch()` calls to endpoints such as `GET /api/videos`, `POST /api/videos`, `PATCH /api/videos/{id}`, and `DELETE /api/videos/{id}`. Add the API origin to `host_permissions`, configure CORS in Spring Boot, and preserve the current video object shape so the gallery and modal modules remain unchanged. A sync/auth layer can reconcile local drafts with the server.

## Metadata extraction

Saving a link runs the pipeline in `js/metadata/`: platform detection, JSON-LD extraction, HTML/Open Graph/Twitter metadata, video-element inspection, and thumbnail candidate scoring. Metadata references and dimensions are stored instead of downloading image binaries into extension storage. Existing flat records are normalized when read.

Canonical URLs and platform IDs are checked before saving. Duplicates can be cancelled or used to update existing metadata. Missing fields remain empty or `null`, so inaccessible metadata does not prevent saving. CORS, content security policy, authentication, rate limits, and platform privacy settings may still limit extraction. The extension does not bypass login, DRM, paywalls, or protected delivery.

```text
js/metadata/
├── metadataExtractor.js
├── jsonLdExtractor.js
├── thumbnailExtractor.js
└── platformDetector.js
```

Load the unpacked extension, open a public video page, click **Save Current Video**, and review the extraction progress and result summary. The gallery displays the best discovered thumbnail, duration, and resolution when available.

## Live-tab metadata (content script)

Modern video platforms (YouTube, TikTok, Instagram, X, Twitch…) serve JavaScript app shells to plain HTTP requests, so the server-side `fetch` above often finds no meta tags, no JSON-LD, and no images. To fix that, the extension ships a content script (`js/metadata/tabExtractor.js`, registered under `content_scripts` in `manifest.json`) that reads the **live, fully-rendered DOM of the active tab** when you click **Save Current Video**: the real thumbnail, `<video>` poster/src/duration, and title. Live-tab results are merged with the server fetch (which still supplies canonical URLs and JSON-LD), with the live DOM winning for thumbnails, titles, and playback URLs.

After changing the extension, reload it at `chrome://extensions` so the updated code and the new content script are applied to already-open tabs.

### Why videos may not play inline

Platforms like Instagram, Facebook, X/Twitter, and Reddit send `X-Frame-Options`/CSP headers that forbid embedding, and no extension can bypass that. VideoVault now adds an **Open in new tab ↗** action to every player so those videos still play outside the popup, plus official embeds for TikTok and Dailymotion, and direct `<video>` playback of `.mp4/.webm/.mov/.m3u8…` when the page exposes a media `contentUrl`.

## SaveFrom fallback

When the native pipeline fails (JS-only page, login wall, missing thumbnail, no direct media URL), VideoVault falls back to SaveFrom (`js/downloads/downloadManager.js`):

- **At save time** — if extraction came up empty, the extension asks SaveFrom for the title, thumbnail, duration, and a direct download URL and merges them into the saved record.
- **At download time** — the Download button (on saved cards, browse cards, and the player) first uses any known direct URL; otherwise it tries SaveFrom's JSON endpoint and, if that is unavailable/Cloudflare-gated, opens **SaveFrom preloaded with the video** (`https://en.savefrom.net/?url=…`) in a new tab so you can still pick a format.
- **On save/login barriers** — the notice dialog gains a **Try SaveFrom ↗** link for the video URL.

Note: SaveFrom's historical public `helper.php?format=json` endpoint has been deprecated and may be Cloudflare-gated; the extension treats that as a normal miss and falls back to the SaveFrom app page, which always works from a real browser. The button inject snippet provided by SaveFrom (`sf-helper-agent.min.js`) is the one used on websites; the extension uses their app URL + best-effort API instead of injecting third-party scripts into pages.