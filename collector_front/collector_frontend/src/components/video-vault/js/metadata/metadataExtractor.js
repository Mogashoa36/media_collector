import { extractJsonLd } from './jsonLdExtractor.js';
import { detectPlatform, platformVideoId } from './platformDetector.js';
import { extractThumbnail } from './thumbnailExtractor.js';

function meta(document, name) { return document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() || ''; }
function duration(value) {
  if (!value) return null;
  if (/^PT/i.test(value)) { const parts = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i); return parts ? Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0) : null; }
  const parts = String(value).split(':').map(Number);
  return parts.some(Number.isNaN) ? null : parts.reduce((total, part) => total * 60 + part, 0);
}
function cleanTitle(title = '') { return title.replace(/\s*[|\-]\s*(YouTube|Vimeo|TikTok|Instagram).*$/i, '').replace(/\s+/g, ' ').trim(); }
function canonicalUrl(document, pageUrl) { try { return new URL(document.querySelector('link[rel="canonical"]')?.href || meta(document, 'og:url') || pageUrl).href; } catch { return pageUrl; } }

// Modern platforms (YouTube, TikTok, Twitch, Instagram, X…) serve a JavaScript
// app shell to fresh requests: no meta tags, no images, no title. Detect that so
// the caller can fall back to reading the rendered page in the user's tab.
const SHELL_TITLES = /^(Instagram|TikTok|Twitch|Dailymotion|- YouTube|YouTube|X\s*\/?\s*Twitter|X|Post\s*\/\s*X|Facebook\s*[–—-]\s*(log in|sign up).*|Login\s*•?\s*Instagram)$/i;
function shellTitle(document) { return !document.title?.trim() || SHELL_TITLES.test(document.title.trim()); }

function mediaDuration(html) {
  for (const pattern of [/["']lengthSeconds["']\s*:\s*["']?(\d+(?:\.\d+)?)["']?/i, /["']durationSec["']\s*:\s*["']?(\d+(?:\.\d+)?)["']?/i]) {
    const match = html.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function directVideoUrl(document, contentUrl = '') {
  const candidates = [contentUrl];
  const video = document.querySelector('video');
  if (video) candidates.push(video.currentSrc || video.src);
  document.querySelectorAll('video source[src]').forEach(source => candidates.push(source.src));
  document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]').forEach(metaTag => candidates.push(metaTag.content));
  for (const candidate of candidates) {
    if (!candidate || !/^https?:/i.test(candidate)) continue;
    try { if (/\.(mp4|m4v|mov|mkv|webm|ogg|ogv|m3u8|mpd)(?:$|[?#])/i.test(new URL(candidate).pathname)) return candidate; } catch { }
  }
  return '';
}

export async function extractMetadata(url, pageUrl = url) {
  const response = await fetch(url, { credentials: 'omit', headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!response.ok) return { status: response.status, requiresLogin: response.status === 401 || response.status === 403, unavailable: true };
  const html = await response.text();
  const document = new DOMParser().parseFromString(html, 'text/html');
  const jsonLd = extractJsonLd(document);
  const platform = detectPlatform(url);
  const shell = shellTitle(document);
  const thumbnail = await extractThumbnail(document, url, platform, jsonLd.thumbnailUrls);
  const video = document.querySelector('video');
  const contentUrl = directVideoUrl(document, jsonLd.contentUrl);
  const title = jsonLd.title || meta(document, 'og:title') || meta(document, 'twitter:title') || (shell ? '' : document.title) || '';
  const description = jsonLd.description || meta(document, 'og:description') || meta(document, 'twitter:description');
  const durationValue = jsonLd.duration || meta(document, 'video:duration') || mediaDuration(html) || video?.duration || '';
  const width = jsonLd.width || Number(video?.getAttribute?.('width') || 0) || video?.videoWidth || null;
  const height = jsonLd.height || Number(video?.getAttribute?.('height') || 0) || video?.videoHeight || null;
  const canonical = canonicalUrl(document, pageUrl);
  return {
    status: response.status,
    title,
    cleanedTitle: cleanTitle(title),
    description,
    url: contentUrl || jsonLd.contentUrl || url,
    contentUrl: contentUrl || '',
    canonicalUrl: canonical,
    pageUrl,
    platform,
    domain: new URL(url).hostname.replace(/^www\./, ''),
    videoId: platformVideoId(canonical),
    creator: { name: jsonLd.creatorName || meta(document, 'author'), username: '', profileUrl: jsonLd.creatorUrl || '' },
    video: { duration: duration(durationValue), width, height, aspectRatio: width && height ? Number((width / height).toFixed(3)) : null, format: '', mimeType: '', quality: width && height ? `${width}x${height}` : '', frameRate: null, bitrate: null },
    thumbnail,
    engagement: { views: jsonLd.views || null, likes: jsonLd.likes || null, comments: jsonLd.comments || null, shares: null },
    publication: { publishedAt: jsonLd.publishedAt || meta(document, 'article:published_time') || null },
    tags: (meta(document, 'keywords') || '').split(',').map(item => item.trim()).filter(Boolean),
    hashtags: [...html.matchAll(/#[\w-]+/g)].map(match => match[0]).filter((tag, index, tags) => tags.indexOf(tag) === index),
    categories: [],
    extractionMethod: ['html', 'open-graph', 'twitter', 'json-ld', 'video-element'].filter(method => method === 'html' || (method === 'open-graph' && Boolean(meta(document, 'og:title'))) || (method === 'twitter' && Boolean(meta(document, 'twitter:title'))) || (method === 'json-ld' && Boolean(jsonLd.title)) || (method === 'video-element' && Boolean(video))),
    metadata: { extractionMethod: ['html', 'open-graph', 'twitter', 'json-ld', 'video-element'], extractionSuccess: true },
    requiresLogin: shell,
    unavailable: shell
  };
}
