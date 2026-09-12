// Local recommendation service: merges platform-adapter recommendations
// (when available) with on-device sections. Platform AUTH_REQUIRED never
// blocks local picks — sections render independently and the platform slot
// shows the existing Login Required UI with Retry.
import { buildSections } from '../personalization/sections.js';
import { getFeedback } from '../personalization/feedback.js';
import { events, readCountsAsync } from '../personalization/tracking.js';
import { getPreferences } from '../personalization/preferences.js';

export async function getPlatformRecommendations(adapters = []) {
  const merged = [];
  let authRequired = null;
  let unavailable = 0;
  for (const adapter of adapters) {
    try {
      const res = await adapter.getRecommendations();
      if (res?.supported && res.videos?.length) merged.push(...res.videos);
      else if (res?.error?.code === 'AUTH_REQUIRED') authRequired = { adapter: adapter.platform, error: res.error };
      else unavailable++;
    } catch { unavailable++; }
  }
  return { videos: merged, authRequired, unavailable };
}

export async function getRecommendations({
  videos = [], candidates = [], seedVideo = null, adapters = [],
  preferences = null, weights = {}, scorer = null, limits = {}
} = {}) {
  const prefs = preferences || mapPrefs(getPreferences());
  const [feedback, counts] = await Promise.all([
    getFeedback().catch(() => ({ dismissed: {}, liked: {} })),
    readCountsAsync().catch(() => ({}))
  ]);
  const platformFeed = adapters.length
    ? await getPlatformRecommendations(adapters).then((r) => ({
      supported: r.videos.length > 0,
      videos: r.videos,
      error: r.authRequired ? r.authRequired.error : null,
      authAdapter: r.authRequired?.adapter || null
    }))
    : { supported: false, videos: [], error: null };
  const built = buildSections({
    videos, events: events(), selectionCounts: counts, feedback,
    preferences: prefs, candidates, seedVideo, platformFeed, weights,
    ...(scorer ? { scorer } : {}), limits
  });
  return { ...built, platformFeed };
}

function mapPrefs(p = {}) {
  return {
    recommendationsEnabled: p.recommendationsEnabled !== false,
    personalizationEnabled: p.enabled !== false,
    trendingEnabled: p.trendingEnabled !== false,
    platforms: p.platforms || {}
  };
}
