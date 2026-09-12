// UI-facing download service: normalized options + auth-aware runner.
// Keeps old downloadManager.js names working via re-export shim.
import { updateVideo } from '../storage.js';
import { ErrorCodes, normalizeError } from './errors.js';
import { createDefaultRegistry } from './providerRegistry.js';
import { saveFromPageUrl, fetchSaveFromMetadata, isSaveFromCandidate } from './providers/saveFromProvider.js';
import { directMediaUrl } from './providers/directMediaProvider.js';

export { saveFromPageUrl, fetchSaveFromMetadata, isSaveFromCandidate };

let registry = createDefaultRegistry();

export function setYtDlpBridge(bridge) {
  registry = createDefaultRegistry({ ytDlpBridge: bridge });
}

// Test/advanced wiring: replace the whole registry (providers are still
// resolved through the same normalized contract).
export function setRegistry(next) {
  registry = next || createDefaultRegistry();
}

export function getRegistry() { return registry; }

export function getDownloadOptions(video = {}) {
  if (directMediaUrl(video)) return { supported: true, options: [{ url: directMediaUrl(video), label: 'Download' }] };
  if (isSaveFromCandidate(video)) return { supported: true, saveFrom: true, options: [] };
  return { supported: false, options: [] };
}

export async function resolveDownloadOptions(video = {}, context = {}) {
  try {
    return await registry.resolve(video, context);
  } catch (error) {
    return {
      provider: null, available: false, options: [], attempts: [],
      error: normalizeError(ErrorCodes.PROVIDER_ERROR, String(error?.message || error))
    };
  }
}

function startDownload(url) {
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.rel = 'noopener';
    link.click();
    return true;
  } catch {
    // Non-DOM environment (tests/previews): the URL is still returned to the
    // caller in options, so nothing is lost.
    return false;
  }
}

function openTab(url) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) { chrome.tabs.create({ url }); return true; }
  try { window.open(url, '_blank'); return true; } catch { return false; }
}

export function openOriginal(video = {}) {
  const url = video?.url || video?.canonicalUrl || video?.pageUrl || '';
  if (url && openTab(url)) return true;
  return false;
}

// Native messaging bridge for the optional local yt-dlp helper (MV3-safe:
// chrome.runtime.sendNativeMessage only; never eval/remote scripts).
// Manifest note: add "nativeMessaging" to permissions and register the host
// (see docs/YTDlpSetup.md). Without it, yt-dlp stays disabled and other
// providers keep working.
export function createNativeYtDlpBridge({ host = 'com.videovault.ytdlp', timeoutMs = 15000 } = {}) {
  const send = (message) => new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) {
        reject(new Error('yt-dlp helper unavailable (native messaging not connected)'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('yt-dlp helper timed out')), timeoutMs);
      chrome.runtime.sendNativeMessage(host, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(response);
      });
    } catch (error) { reject(error); }
  });
  return {
    available: async () => {
      try {
        const res = await send({ action: 'ping' });
        return Boolean(res?.ok && res?.ytdlp);
      } catch { return false; }
    },
    ffmpegAvailable: async () => {
      try {
        const res = await send({ action: 'ping' });
        return Boolean(res?.ffmpeg);
      } catch { return false; }
    },
    formats: (url) => send({ action: 'formats', url }),
    download: (payload) => send({ action: 'download', ...payload })
  };
}

// One download per video at a time. Rapid double-clicks (or Browse + Modal
// triggers on the same video) return { status: 'already-downloading' }
// instead of racing two identical downloads.
const inFlight = new Map();
const flightKey = (video = {}) => `${video?.id || ''}|${video?.url || video?.canonicalUrl || video?.pageUrl || ''}`;

export async function download(video = {}, context = {}) {
  const key = flightKey(video);
  if (inFlight.has(key)) return { status: 'already-downloading', key };
  inFlight.set(key, true);
  try {
    return await runDownload(video, context);
  } finally {
    inFlight.delete(key);
  }
}

async function runDownload(video = {}, context = {}) {
  const resolved = await resolveDownloadOptions(video, context);
  if (resolved.error?.code === ErrorCodes.AUTH_REQUIRED) {
    return { status: 'auth-required', provider: resolved.provider, error: resolved.error, pageUrl: video?.url || video?.canonicalUrl || '' };
  }
  if (resolved.error?.code === ErrorCodes.PRIVATE_CONTENT) {
    return { status: 'private', provider: resolved.provider, error: resolved.error, pageUrl: video?.url || video?.canonicalUrl || '' };
  }
  if (resolved.available && resolved.options.length) {
    const [first] = resolved.options;
    if (first.action === 'ytdlp-download') {
      return { status: 'ytdlp', provider: resolved.provider, options: resolved.options, pageUrl: video?.url || video?.canonicalUrl || '' };
    }
    if (first.action === 'open-savefrom') {
      const page = first.url;
      if (page && openTab(page)) return { status: 'savefrom', provider: resolved.provider, page };
      return { status: 'unavailable', provider: resolved.provider, error: normalizeError(ErrorCodes.UNSUPPORTED, 'No download available') };
    }
    if (first.url && /^https?:/i.test(first.url)) {
      if (video?.id && first.provider === 'savefrom') {
        try { await updateVideo(video.id, { downloadUrl: first.url, contentUrl: first.url }); } catch { /* noop */ }
      }
      startDownload(first.url);
      return { status: 'downloaded', provider: resolved.provider, options: resolved.options };
    }
  }
  const page = video?.url || video?.canonicalUrl || '';
  if (page && isSaveFromCandidate(video) && openTab(saveFromPageUrl(page))) {
    return { status: 'savefrom', provider: 'savefrom', page: saveFromPageUrl(page) };
  }
  return { status: 'unavailable', provider: resolved.provider, error: resolved?.error || normalizeError(ErrorCodes.UNSUPPORTED, 'No download available') };
}
