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