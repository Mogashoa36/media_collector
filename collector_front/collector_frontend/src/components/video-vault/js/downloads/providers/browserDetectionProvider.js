// Priority 2 — MediaGrabber-style browser detection.
//
// Reads media already visible to the browser: <video>/source elements,
// og:video meta tags, and live-tab extraction results (content script +
// saved record fields). Never fetches cross-origin pages itself; it only
// inspects values the extractors already discovered through permitted
// browser mechanisms.
import { ErrorCodes } from '../errors.js';
import { BaseDownloadProvider } from './baseProvider.js';
import { ANY_MEDIA_EXTENSION, STREAM_EXTENSION, directMediaUrl } from './directMediaProvider.js';

function collectDetected(video = {}) {
  const seen = new Set();
  const out = [];
  const push = (url, detectedVia) => {
    if (!url || !/^https?:/i.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ url, detectedVia });
  };
  const fields = [
    video?.detectedMediaUrl,
    ...(Array.isArray(video?.detectedMedia) ? video.detectedMedia.map((item) => item?.url || item) : []),
    video?.tabExtraction?.contentUrl,
    ...(Array.isArray(video?.tabExtraction?.media) ? video.tabExtraction.media : [])
  ];
  for (const candidate of fields) push(candidate, 'browser-detection');
  return out;
}

export function sniffDocument(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc?.querySelectorAll) return [];
  const urls = [];
  doc.querySelectorAll('video').forEach((video) => {
    if (video.currentSrc || video.src) urls.push(video.currentSrc || video.src);
  });
  doc.querySelectorAll('video source[src]').forEach((source) => urls.push(source.src));
  doc.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]').forEach((tag) => urls.push(tag.content));
  return urls.filter((url) => {
    try {
      return /^https?:/i.test(url) && ANY_MEDIA_EXTENSION.test(new URL(url).pathname);
    } catch {
      return false;
    }
  });
}

export class BrowserDetectionProvider extends BaseDownloadProvider {
  constructor() {
    super('browser-detection');
  }

  supports(video) {
    if (directMediaUrl(video)) return true;
    return collectDetected(video).length > 0;
  }

  async resolve(video) {
    const direct = directMediaUrl(video);
    const detected = collectDetected(video);
    const merged = [
      ...(direct ? [{ url: direct, detectedVia: 'video-element' }] : []),
      ...detected.filter((item) => item.url !== direct)
    ].filter((item) => {
      try {
        return ANY_MEDIA_EXTENSION.test(new URL(item.url).pathname);
      } catch {
        return false;
      }
    });
    if (!merged.length) return this.miss(ErrorCodes.UNSUPPORTED, 'No browser-detected media (MP4/WebM/HLS/DASH)');
    return this.ok(
      video,
      merged.map(({ url, detectedVia }) => {
        let format = '';
        try {
          const ext = new URL(url).pathname.split('.').pop().toLowerCase();
          format = STREAM_EXTENSION.test(url) ? (ext === 'm3u8' ? 'hls' : 'dash') : ext;
        } catch { /* keep blank */ }
        return {
          title: video?.title || '',
          format,
          quality: video?.video?.width && video?.video?.height ? `${video.video.width}x${video.video.height}` : '',
          fileType: format,
          url,
          action: STREAM_EXTENSION.test(url) ? 'open' : 'download',
          detectedVia
        };
      })
    );
  }
}
