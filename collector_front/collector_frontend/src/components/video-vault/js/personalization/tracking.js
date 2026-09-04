import { getPreferences } from './preferences.js';
const KEY = 'videovault-personalization-events';
export function track(type, video = {}) {
  const preferences = getPreferences();
  if (!preferences.enabled || (type === 'saved' && !preferences.trackSaved) || (type === 'favorite' && !preferences.trackFavorites) || (type === 'opened' && !preferences.trackViewing)) return;
  const events = JSON.parse(localStorage.getItem(KEY) || '[]');
  events.push({ type, videoId: video.id || '', platform: video.platform || '', title: video.title || '', url: video.url || '', at: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
}
export function events() { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
