import { events } from './tracking.js';

export function score(video) {
  const history = events();
  const text = String(video.title || '').toLowerCase();
  const matching = history.filter(event => event.title && text.includes(event.title.toLowerCase())).length;
  const platform = history.filter(event => event.platform === video.platform).length;
  const saved = history.filter(event => event.type === 'saved' && event.platform === video.platform).length;
  return matching * 0.35 + platform * 0.1 + saved * 0.2 + (video.savedAt ? Math.max(0, 1 - (Date.now() - new Date(video.savedAt)) / 604800000) * 0.1 : 0);
}
export function recommend(videos, limit = 6) { return [...videos].sort((a, b) => score(b) - score(a)).slice(0, limit); }
