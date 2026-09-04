const KEY = 'videovault-personalization-preferences';
const defaults = { enabled: true, trackSaved: true, trackFavorites: true, trackViewing: true, cloud: false };
export function getPreferences() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; } }
export function setPreferences(updates) { const next = { ...getPreferences(), ...updates }; localStorage.setItem(KEY, JSON.stringify(next)); return next; }
export function clearPersonalization() { localStorage.removeItem('videovault-personalization-events'); }
