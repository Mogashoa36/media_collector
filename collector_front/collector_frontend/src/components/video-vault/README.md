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