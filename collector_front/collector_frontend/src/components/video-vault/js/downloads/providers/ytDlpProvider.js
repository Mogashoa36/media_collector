// Priority 3 - yt-dlp for supported platforms (local helper, optional).
// The helper bridge is injected (native messaging in prod, mock in tests).
import { ErrorCodes } from '../errors.js';
import { BaseDownloadProvider } from './baseProvider.js';

export const YTDLP_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|reddit\.com|vimeo\.com)$/i;

export function isYtDlpCandidate(video = {}) {
  const url = video?.url || video?.canonicalUrl || video?.pageUrl || '';
  try {
    if (url && /^https?:/i.test(url) && YTDLP_HOSTS.test(new URL(url).hostname)) return true;
  } catch { /* ignore */ }
  return /youtube|tiktok|instagram|facebook|twitter|reddit|vimeo/i.test(video?.platform || '');
}

export const YtDlpStatus = Object.freeze({
  IDLE: 'idle', DETECTING: 'detecting', PREPARING: 'preparing',
  DOWNLOADING: 'downloading', COMPLETE: 'complete', FAILED: 'failed',
  LOGIN_REQUIRED: 'login-required', UNSUPPORTED: 'unsupported'
});

function normalizeFormat(entry = {}, fallbackTitle = '') {
  return {
    title: fallbackTitle,
    format: entry.format || entry.ext || 'video',
    quality: entry.quality || entry.resolution || (entry.height ? `${entry.height}p` : ''),
    fileType: entry.ext || entry.format || '',
    url: entry.url || '',
    formatId: entry.formatId || entry.format_id || '',
    action: entry.url ? 'download' : 'ytdlp-download'
  };
}
export class YtDlpProvider extends BaseDownloadProvider {
  constructor(bridge = null) {
    super('ytdlp');
    this.bridge = bridge;
    this.listeners = new Set();
  }

  setBridge(bridge) { this.bridge = bridge; }

  onStatus(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(status, detail = {}) {
    this.listeners.forEach((listener) => {
      try { listener({ provider: this.name, status, ...detail }); } catch { /* ignore */ }
    });
  }

  supports(video) { return isYtDlpCandidate(video); }

  async helperAvailable() {
    if (!this.bridge?.available) return false;
    try { return Boolean(await this.bridge.available()); } catch { return false; }
  }

  async resolve(video, context = {}) {
    if (!isYtDlpCandidate(video)) return this.miss(ErrorCodes.UNSUPPORTED, 'Platform not supported by yt-dlp');
    const pageUrl = video?.url || video?.canonicalUrl || video?.pageUrl || '';
    if (!pageUrl || !/^https?:/i.test(pageUrl)) return this.miss(ErrorCodes.UNSUPPORTED, 'Invalid video URL');
    if (!this.bridge) return this.miss(ErrorCodes.UNSUPPORTED, 'yt-dlp helper not configured');
    this.emit(YtDlpStatus.DETECTING, { url: pageUrl });
    let available = false;
    try { available = await this.bridge.available(); } catch { available = false; }
    if (!available) return this.miss(ErrorCodes.UNSUPPORTED, 'yt-dlp helper unavailable');
    if (typeof context.onStatus === 'function') context.onStatus(YtDlpStatus.PREPARING);
    let listing;
    try {
      listing = await this.bridge.formats(pageUrl);
    } catch (error) {
      return this.classifyBridgeError(error);
    }
    const listingError = String(listing?.error || '');
    if (listing?.authRequired || /login|sign in|not logged in/i.test(listingError)) {
      this.emit(YtDlpStatus.LOGIN_REQUIRED, { url: pageUrl });
      return this.miss(ErrorCodes.AUTH_REQUIRED, 'Login required on the original platform');
    }
    if (listing?.private || /private|restricted|paywall|drm/i.test(listingError)) {
      return this.miss(ErrorCodes.PRIVATE_CONTENT, listingError || 'Private or restricted content');
    }
    const formats = Array.isArray(listing?.formats) ? listing.formats : [];
    if (!formats.length) {
      if (listing?.error) return this.miss(ErrorCodes.EXTRACTION_ERROR, String(listing.error));
      return this.miss(ErrorCodes.UNSUPPORTED, 'yt-dlp found no downloadable formats');
    }
    this.emit(YtDlpStatus.PREPARING, { url: pageUrl, formatCount: formats.length });
    return this.ok(video, formats.map((entry) => normalizeFormat(entry, video?.title || listing?.title || '')));
  }

  classifyBridgeError(error) {
    const message = String(error?.message || error || '');
    if (error?.code === ErrorCodes.AUTH_REQUIRED || /login|sign in|not logged in|cookies/i.test(message)) {
      this.emit(YtDlpStatus.LOGIN_REQUIRED);
      return this.miss(ErrorCodes.AUTH_REQUIRED, message || 'Login required');
    }
    if (error?.code === ErrorCodes.PRIVATE_CONTENT || /private|restricted|paywall|drm/i.test(message)) {
      return this.miss(ErrorCodes.PRIVATE_CONTENT, message);
    }
    if (/network|timeout|econn|eai_again|socket/i.test(message)) return this.miss(ErrorCodes.NETWORK_ERROR, message);
    if (/cancelled|canceled|aborted/i.test(message)) return this.miss(ErrorCodes.PROVIDER_ERROR, 'Download cancelled');
    if (/ffmpeg/i.test(message)) return this.miss(ErrorCodes.PROVIDER_ERROR, `FFmpeg unavailable: ${message}`);
    if (/unsupported url|no video|no media/i.test(message)) return this.miss(ErrorCodes.UNSUPPORTED, message);
    return this.miss(ErrorCodes.PROVIDER_ERROR, message || 'yt-dlp failed');
  }

  async startDownload(pageUrl, option = {}, onProgress = null) {
    if (!this.bridge?.download) return { ok: false, error: 'yt-dlp helper cannot start downloads' };
    this.emit(YtDlpStatus.DOWNLOADING, { url: pageUrl, formatId: option.formatId });
    try {
      const result = await this.bridge.download(
        { url: pageUrl, formatId: option.formatId || option.format || 'best', title: option.title || '' },
        typeof onProgress === 'function' ? (progress) => {
          this.emit(YtDlpStatus.DOWNLOADING, { url: pageUrl, ...progress });
          onProgress(progress);
        } : undefined
      );
      if (result?.authRequired) {
        this.emit(YtDlpStatus.LOGIN_REQUIRED, { url: pageUrl });
        return { ok: false, code: ErrorCodes.AUTH_REQUIRED };
      }
      this.emit(YtDlpStatus.COMPLETE, { url: pageUrl });
      return { ok: true, ...result };
    } catch (error) {
      this.emit(YtDlpStatus.FAILED, { url: pageUrl, message: String(error?.message || error) });
      return { ok: false, code: this.classifyBridgeError(error).error.code };
    }
  }
}

export const ytDlpProvider = new YtDlpProvider(null);
