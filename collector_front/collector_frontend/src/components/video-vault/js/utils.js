export const MOCK_VIDEOS = [
  { id: 'mock-1', title: 'Spring Boot Microservices Tutorial', url: 'https://www.youtube.com/watch?v=demo-spring', thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&q=80', platform: 'YouTube', savedAt: '2026-09-04T01:00:00', favorite: true, collections: ['Java', 'Tutorials'] },
  { id: 'mock-2', title: 'Build a Calm, Focused Workspace', url: 'https://vimeo.com/76979871', thumbnail: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&q=80', platform: 'Vimeo', savedAt: '2026-09-02T12:30:00', favorite: false, collections: ['Entertainment'] },
  { id: 'mock-3', title: 'Angular Signals in 15 Minutes', url: 'https://www.youtube.com/watch?v=demo-angular', thumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900&q=80', platform: 'YouTube', savedAt: '2026-08-28T09:15:00', favorite: false, collections: ['Angular', 'Tutorials'] },
  { id: 'mock-4', title: 'A Walk Through Tokyo at Night', url: 'https://www.tiktok.com/@videovault/video/demo', thumbnail: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=900&q=80', platform: 'TikTok', savedAt: '2026-08-21T18:00:00', favorite: true, collections: ['Entertainment'] }
];
export { detectPlatform } from './metadata/platformDetector.js';
import { extractMetadata } from './metadata/metadataExtractor.js';
export function formatDate(date) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date)); }
export function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
export function makeId() { return `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
export function thumbnailFor(url) { return `https://image.thum.io/get/width/900/crop/600/${encodeURIComponent(url)}`; }
function durationFromText(value) {
  if (!value) return null;
  if (/^PT/i.test(value)) {
    const parts = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
    if (!parts) return null;
    return Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  }
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}
export async function fetchVideoMetadata(url) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) throw new Error('Browser preview cannot fetch cross-origin pages');
    return await extractMetadata(url);
    /* legacy fallback below is retained for older browser previews */
    /*
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return { status: response.status, requiresLogin: response.status === 401 || response.status === 403 };
    const html = await response.text();
    const document = new DOMParser().parseFromString(html, 'text/html');
    const meta = name => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim();
    let duration = durationFromText(meta('video:duration'));
    if (!duration) {
      const durationMatch = html.match(/"(?:lengthSeconds|duration)"\s*:\s*"?(\d+(?:\.\d+)?)"?/i);
      duration = durationMatch ? Number(durationMatch[1]) : null;
    }
    if (!duration) {
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(script.textContent);
          const entries = Array.isArray(data) ? data : [data];
          const video = entries.find(entry => entry.duration || entry['@type'] === 'VideoObject');
          if (video?.duration) { duration = durationFromText(video.duration); break; }
        } catch { }
      }
    }
    const image = meta('og:image') || meta('twitter:image');
    return { status: response.status, title: meta('og:title') || meta('twitter:title') || document.title?.trim(), thumbnail: image ? new URL(image, url).href : undefined, duration: duration || undefined, requiresLogin: /sign in|log in|login/i.test(document.title || '') && !meta('og:title') };
    */
  } catch {
    try {
      const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      if (!response.ok) return { status: response.status };
      const data = await response.json();
      return { status: response.status, title: data.title, thumbnail: data.thumbnail_url };
    } catch {
      return {};
    }
  }
}
export function sourceFor(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Other'; } }
export function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '';
  const total = Math.round(Number(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` : `${minutes}:${String(remaining).padStart(2, '0')}`;
}