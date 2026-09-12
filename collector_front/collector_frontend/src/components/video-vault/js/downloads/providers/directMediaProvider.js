// Priority 1 — Direct media URLs already discovered by the extractors.
//
// Handles progressive files (MP4/WebM/…) plus stream manifests (HLS/M3U8,
// DASH/MPD). HLS/DASH manifests are exposed as "open/stream" options rather
// than direct file downloads.
import { ErrorCodes } from '../errors.js';
import { BaseDownloadProvider } from './baseProvider.js';

export const DIRECT_EXTENSION = /\.(mp4|m4v|mov|mkv|webm|ogg|ogv)(?:$|[?#])/i;
export const STREAM_EXTENSION = /\.(m3u8|mpd)(?:$|[?#])/i;
export const ANY_MEDIA_EXTENSION = /\.(mp4|m4v|mov|mkv|webm|ogg|ogv|m3u8|mpd)(?:$|[?#])/i;

export function directMediaUrl(video = {}) {
  const candidates = [
    video?.downloadUrl,
    video?.contentUrl,
    video?.video?.contentUrl
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!/^https?:/i.test(candidate)) continue;
    try {
      if (ANY_MEDIA_EXTENSION.test(new URL(candidate).pathname)) return candidate;
    } catch { /* ignore malformed */ }
  }
  return '';
}

function describeUrl(url, video) {
  try {
    const pathname = new URL(url).pathname;
    const ext = (pathname.split('.').pop() || '').toLowerCase().split(/[?#]/)[0];
    const isStream = STREAM_EXTENSION.test(pathname);
    return {
      title: video?.title || '',
      format: isStream ? (ext === 'm3u8' ? 'hls' : 'dash') : ext || 'video',
      quality: video?.video?.width && video?.video?.height
        ? `${video.video.width}x${video.video.height}`
        : (video?.video?.quality || ''),
      fileType: ext || '',
      url,
      action: isStream ? 'open' : 'download'
    };
  } catch {
    return { title: video?.title || '', format: '', quality: '', fileType: '', url, action: 'download' };
  }
}

export class DirectMediaProvider extends BaseDownloadProvider {
  constructor() {
    super('direct');
  }

  supports(video) {
    return Boolean(directMediaUrl(video));
  }

  async resolve(video) {
    if (!video || typeof video !== 'object') return this.miss(ErrorCodes.UNSUPPORTED, 'No video supplied');
    const url = directMediaUrl(video);
    if (!url) return this.miss(ErrorCodes.UNSUPPORTED, 'No direct media URL discovered');
    return this.ok(video, [describeUrl(url, video)]);
  }
}
