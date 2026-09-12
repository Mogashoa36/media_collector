// Priority 4 - optional SaveFrom fallback. All SaveFrom logic lives here.
// Never throws for expected misses; returns normalized miss objects so the
// registry can silently move on. No credentials are ever sent or stored:
// requests use credentials:'omit' and only the public page URL is shared.
import { ErrorCodes } from '../errors.js';
import { BaseDownloadProvider } from './baseProvider.js';
import { ANY_MEDIA_EXTENSION } from './directMediaProvider.js';

const SAVEFROM_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|twitch\.tv|dailymotion\.com|reddit\.com|vk\.com|ok\.ru|pinterest\.[a-z]+|linkedin\.com|tumblr\.com)$/i;
const SAVEFROM_PLATFORMS =
  /youtube|vimeo|tiktok|instagram|facebook|twitter|twitch|dailymotion|reddit|vk|pinterest|linkedin|tumblr/i;

export function isSaveFromCandidate(video = {}) {
  const url = video?.url || video?.canonicalUrl || video?.pageUrl || '';
  try {
    const parsed = new URL(url);
    if (ANY_MEDIA_EXTENSION.test(parsed.pathname)) return true;
    if (SAVEFROM_HOSTS.test(parsed.hostname)) return true;
  } catch { /* ignore */ }
  return Boolean(video?.videoId) || SAVEFROM_PLATFORMS.test(video?.platform || '');
}

export function saveFromPageUrl(url) {
  return `https://en.savefrom.net/?url=${encodeURIComponent(url || '')}`;
}

async function fetchWithTimeout(url, ms = 3000, fetchFn = fetch) {
  const attempt = fetchFn(url, { credentials: 'omit' });
  const guard = new Promise((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([attempt, guard]);
}

function parseDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (/^PT/i.test(text)) {
    const parts = text.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
    if (parts) return Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
    return null;
  }
  const parts = text.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

export async function fetchSaveFromMetadata(url, fetchFn = fetch) {
  if (!url || !/^https?:/i.test(url)) return { ok: false };
  for (const endpoint of [
    `https://savefrom.net/helper.php?format=json&url=${encodeURIComponent(url)}`,
    `https://en.savefrom.net/helper.php?format=json&url=${encodeURIComponent(url)}`
  ]) {
    try {
      const response = await fetchWithTimeout(endpoint, 3000, fetchFn);
      if (!response || !response.ok) continue;
      const text = await response.text();
      if (!text || !/[{[]/i.test(text.slice(0, 240))) continue;
      let data;
      try { data = JSON.parse(text); } catch {
        const trimmed = text.trim();
        const start = trimmed.indexOf('(');
        const end = trimmed.lastIndexOf(')');
        if (start > -1 && end > start) data = JSON.parse(trimmed.slice(start + 1, end));
      }
      if (!data || typeof data !== 'object') continue;
      const payload = data.data && typeof data.data === 'object' ? data.data : data;
      const direct = payload?.url || data?.url || payload?.video || '';
      if (!/^https?:/i.test(direct)) continue;
      const meta = payload?.meta || {};
      return {
        ok: true,
        url: direct,
        thumbnail: payload?.thumb || data?.thumb || '',
        title: meta?.title || payload?.title || data?.title || '',
        duration: parseDuration(meta?.duration || payload?.duration || data?.duration || '')
      };
    } catch { continue; }
  }
  return { ok: false };
}

export class SaveFromProvider extends BaseDownloadProvider {
  constructor(options = {}) {
    super('savefrom');
    this.fetchFn = options.fetchFn || fetch;
    this.timeoutMs = options.timeoutMs || 3000;
    this.openTab = options.openTab || null;
  }

  supports(video) { return isSaveFromCandidate(video); }

  async resolve(video) {
    if (!isSaveFromCandidate(video)) {
      return this.miss(ErrorCodes.UNSUPPORTED, 'SaveFrom does not support this URL');
    }
    const pageUrl = video?.url || video?.canonicalUrl || video?.pageUrl || '';
    if (!pageUrl || !/^https?:/i.test(pageUrl)) {
      return this.miss(ErrorCodes.UNSUPPORTED, 'Invalid video URL');
    }
    let meta;
    try {
      meta = await fetchSaveFromMetadata(pageUrl, this.fetchFn);
    } catch (error) {
      return this.miss(ErrorCodes.NETWORK_ERROR, String(error?.message || error));
    }
    if (meta?.ok && /^https?:/i.test(meta.url)) {
      return this.ok(video, [{
        title: meta.title || video?.title || '',
        format: 'savefrom-direct',
        quality: '',
        fileType: '',
        url: meta.url,
        action: 'download'
      }]);
    }
    return {
      available: true,
      fallbackToPage: true,
      pageUrl: saveFromPageUrl(pageUrl),
      options: [{
        provider: this.name,
        title: video?.title || '',
        format: 'savefrom-page',
        quality: '',
        fileType: '',
        url: saveFromPageUrl(pageUrl),
        action: 'open-savefrom',
        status: 'available',
        error: null
      }],
      error: null
    };
  }
}
