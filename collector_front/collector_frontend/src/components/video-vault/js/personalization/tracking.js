import { getPreferences } from './preferences.js';
const KEY = 'videovault-personalization-events';
const COUNT_KEY = 'videovault-selection-counts';
export function track(type, video = {}) {
  const preferences = getPreferences();
  if (!preferences.enabled || (type === 'saved' && !preferences.trackSaved) || (type === 'favorite' && !preferences.trackFavorites) || (type === 'opened' && !preferences.trackViewing)) return;
  try {
    const events = JSON.parse(localStorage.getItem(KEY) || '[]');
    events.push({ type, videoId: video.id || '', platform: video.platform || '', title: video.title || '', url: video.url || '', creator: video.creator?.name || video.creator?.username || '', at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
  } catch { /* storage unavailable: degrade silently */ }
}
export function events() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function selectionCounts() { try { return JSON.parse(localStorage.getItem(COUNT_KEY) || '{}'); } catch { return {}; } }
export async function readCountsAsync() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return (await chrome.storage.local.get(COUNT_KEY))[COUNT_KEY] || selectionCounts();
  } catch { /* fall through */ }
  return selectionCounts();
}
export async function recordSelection(video = {}) {
  const id = video?.id;
  if (!id) return;
  const counts = (await readCountsAsync()) || {};
  counts[id] = Math.min(999, (Number(counts[id]) || 0) + 1);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [COUNT_KEY]: counts });
    else localStorage.setItem(COUNT_KEY, JSON.stringify(counts));
  } catch { /* must not break UI */ }
}
export async function clearSelectionCounts() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.remove(COUNT_KEY);
    else localStorage.removeItem(COUNT_KEY);
  } catch { /* noop */ }
}
export async function clearEvents() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.remove(KEY);
    localStorage.removeItem(KEY);
  } catch { /* noop */ }
}
