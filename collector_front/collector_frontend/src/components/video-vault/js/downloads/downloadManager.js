import { updateVideo } from '../storage.js';

const DIRECT_EXTENSION = /\.(mp4|m4v|mov|mkv|webm|ogg|ogv|m3u8|mpd)(?:$|[?#])/i;
// Hosts SaveFrom knows how to resolve. Downloads for anything on these are offered
// through SaveFrom when no direct media URL was discovered by the extractor.
const SAVEFROM_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|twitch\.tv|dailymotion\.com|reddit\.com|vk\.com|ok\.ru|pinterest\.[a-z]+|linkedin\.com|tumblr\.com)$/i;
const SAVEFROM_PLATFORMS = /youtube|vimeo|tiktok|instagram|facebook|twitter|twitch|dailymotion|reddit|vk|ok\.ru|pinterest|linkedin|tumblr/i;

export function isSaveFromCandidate(video = {}) {
  const url = video?.url || video?.canonicalUrl || '';
  try {
    const parsed = new URL(url);
    if (DIRECT_EXTENSION.test(parsed.pathname)) return true;
    if (SAVEFROM_HOSTS.test(parsed.hostname)) return true;
  } catch { }
  return Boolean(video?.videoId) || SAVEFROM_PLATFORMS.test(video?.platform || '');
}

export function getDownloadOptions(video = {}) {
  const url = video?.downloadUrl || video?.contentUrl || video?.video?.contentUrl || '';
  if (url && /^https?:/i.test(url)) return { supported: true, options: [{ url, label: 'Download' }] };
  if (isSaveFromCandidate(video)) return { supported: true, saveFrom: true, options: [] };
  return { supported: false, options: [] };
}

export function saveFromPageUrl(url) { return `https://en.savefrom.net/?url=${encodeURIComponent(url || '')}`; }

async function fetchWithTimeout(url, milliseconds = 3000) {
  const attempt = fetch(url, { credentials: 'omit' });
  const guard = new Promise(resolve => setTimeout(() => resolve(null), milliseconds));
  return await Promise.race([attempt, guard]);
}

function parseDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (/^PT/i.test(text)) {
    const parts = text.match(/PT(?:(?:(\d+)H))?(?:(?:(\d+)M))?(?:(?:(\d+(?:\.\d+)?)S))?/i);
    if (parts) return Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
    return null;
  }
  const parts = text.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

// Best-effort SaveFrom API lookup. Their public JSON endpoint (helper.php) has been
// deprecated and is often Cloudflare-gated, so callers must treat a miss as normal
// and fall back to the SaveFrom landing page (saveFromPageUrl).
export async function fetchSaveFromMetadata(url) {
  if (!url || !/^https?:/i.test(url)) return { ok: false };
  for (const endpoint of [
    `https://savefrom.net/helper.php?format=json&url=${encodeURIComponent(url)}`,
    `https://en.savefrom.net/helper.php?format=json&url=${encodeURIComponent(url)}`
  ]) {
    try {
      const response = await fetchWithTimeout(endpoint, 3000);
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

function startDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.rel = 'noopener';
  link.click();
  return true;
}

function openTab(url) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) { chrome.tabs.create({ url }); return true; }
  try { window.open(url, '_blank'); return true; } catch { return false; }
}

// Returns { status: 'downloaded' } when a file download started,
// { status: 'savefrom' } when the SaveFrom app was opened for the video,
// or { status: 'unavailable' } when neither could serve the video.
export async function download(video = {}) {
  const direct = video?.downloadUrl || video?.contentUrl || video?.video?.contentUrl || '';
  if (direct && /^https?:/i.test(direct)) {
    startDownload(direct);
    return { status: 'downloaded' };
  }
  const result = await fetchSaveFromMetadata(video?.url || video?.canonicalUrl || '');
  if (result.ok && /^https?:/i.test(result.url)) {
    if (video?.id) { try { await updateVideo(video.id, { downloadUrl: result.url, contentUrl: result.url }); } catch { } }
    startDownload(result.url);
    return { status: 'downloaded' };
  }
  const page = video?.url || video?.canonicalUrl || '';
  if (page && openTab(saveFromPageUrl(page))) return { status: 'savefrom', page: saveFromPageUrl(page) };
  return { status: 'unavailable' };
}
