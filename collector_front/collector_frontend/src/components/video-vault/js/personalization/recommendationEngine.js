// Backwards-compatible recommendation API.
// recommend(videos, limit) keeps its signature; new code should use
// buildSections() from sections.js. score(video) keeps working via the
// default scorer against a profile built from stored events.
import { events, selectionCounts } from './tracking.js';
import { getPreferences } from './preferences.js';
import { buildProfile } from './profile.js';
import { defaultScorer } from './scoring.js';
import { buildSections, recommendLegacy, SECTION_DEFS } from './sections.js';

export { buildSections, recommendLegacy, SECTION_DEFS, buildProfile, defaultScorer };

function profileFromStorage() {
  return buildProfile({ videos: [], events: events(), selectionCounts: selectionCounts(), preferences: getPreferences() });
}

export function score(video) {
  const profile = profileFromStorage();
  return defaultScorer(video, { profile, weights: {} }).total;
}
export function recommend(videos, limit = 6) {
  try {
    const prefs = getPreferences();
    if (prefs.recommendationsEnabled === false) return [];
    return recommendLegacy(videos, limit, {
      events: events(),
      selectionCounts: selectionCounts(),
      preferences: { recommendationsEnabled: true, personalizationEnabled: prefs.enabled !== false, trendingEnabled: prefs.trendingEnabled !== false, platforms: prefs.platforms || {} },
      feedback: readFeedbackSync()
    });
  } catch {
    return [...videos].slice(0, limit);
  }
}

function readFeedbackSync() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return { dismissed: {}, liked: {} };
    return JSON.parse(localStorage.getItem('videovault-recommendation-feedback') || 'null') || { dismissed: {}, liked: {} };
  } catch { return { dismissed: {}, liked: {} }; }
}
