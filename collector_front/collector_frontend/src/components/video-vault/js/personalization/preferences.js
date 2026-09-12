const KEY = 'videovault-personalization-preferences';
const defaults = { enabled: true, trackSaved: true, trackFavorites: true, trackViewing: true, cloud: false, recommendationsEnabled: true, trendingEnabled: true, platforms: {} };
export function getPreferences() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } }
export function setPreferences(updates) { const next = { ...getPreferences(), ...updates }; localStorage.setItem(KEY, JSON.stringify(next)); return next; }
export function clearPersonalization() { localStorage.removeItem('videovault-personalization-events'); }
export async function resetPersonalization() {
  localStorage.removeItem('videovault-personalization-events');
  localStorage.removeItem('videovault-selection-counts');
  localStorage.removeItem('videovault-recommendation-feedback');
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(['videovault-personalization-events', 'videovault-selection-counts', 'videovault-recommendation-feedback']);
    }
  } catch { /* noop */ }
  localStorage.setItem(KEY, JSON.stringify({ ...defaults }));
  return { ...defaults };
}
