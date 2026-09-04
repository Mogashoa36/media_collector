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

export async function extractMetadata(url, pageUrl = url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) return { status: response.status, requiresLogin: response.status === 401 || response.status === 403 };
  const html = await response.text();
  const document = new DOMParser().parseFromString(html, 'text/html');
  const jsonLd = extractJsonLd(document);
  const platform = detectPlatform(url);
  const thumbnail = await extractThumbnail(document, url, platform);
  const video = document.querySelector('video');
  const title = jsonLd.title || meta(document, 'og:title') || meta(document, 'twitter:title') || document.title || '';
  const description = jsonLd.description || meta(document, 'og:description') || meta(document, 'twitter:description');
  const durationValue = jsonLd.duration || meta(document, 'video:duration') || video?.duration || '';
  const width = jsonLd.width || video?.videoWidth || null;
  const height = jsonLd.height || video?.videoHeight || null;
  const canonical = canonicalUrl(document, pageUrl);
  return {
    status: response.status,
    title,
    cleanedTitle: cleanTitle(title),
    description,
    url: jsonLd.contentUrl || url,
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
    extractionMethod: ['html', 'open-graph', 'twitter', 'json-ld', 'video-element'].filter(method => method === 'html' || (method === 'open-graph' && Boolean(meta(document, 'og:title'))) || (method === 'twitter' && Boolean(meta(document, 'twitter:title'))) || (method === 'json-ld' && Boolean(jsonLd.title)) || (method === 'video-element' && Boolean(video)))
  };
}
