// Section builder: (library + signals) -> deduped sections.
// Sections: forYou, recommended, similar, becauseYouSaved, fromFavorites,
// fromCollections, trending, recentlyVisited (+ platformFeed passthrough).
// Dedupe: each video appears once, in its highest-rank section.
// ML seam: pass a custom scorer (candidate, context) => {total, reasons[] }.
import { buildProfile, tokenize } from './profile.js';
import { defaultScorer } from './scoring.js';
import { feedbackSets } from './feedback.js';

export const SECTION_DEFS = [
  { key: 'forYou', title: 'For You', limit: 6 },
  { key: 'recommended', title: 'Recommended', limit: 6 },
  { key: 'recentlyVisited', title: 'Recently Visited', limit: 4 },
  { key: 'trending', title: 'Trending', limit: 6 },
  { key: 'becauseYouSaved', title: 'Because You Saved', limit: 4 },
  { key: 'fromFavorites', title: 'From Your Favorites', limit: 4 },
  { key: 'fromCollections', title: 'Similar to Your Collections', limit: 4 },
  { key: 'similar', title: 'Similar Videos', limit: 4 }
];

function keyOf(video = {}) {
  return video.canonicalUrl || video.url || (video.videoId && video.platform + ':' + video.videoId) || video.id || '';
}

function seedContext(seedVideos = []) {
  const seedTokens = new Set();
  const seedTags = new Set();
  const seedCategories = new Set();
  const seedCollections = new Set();
  for (const v of seedVideos) {
    for (const t of tokenize((v.title || '') + ' ' + (v.description || ''))) seedTokens.add(t);
    for (const t of [...(v.tags || []), ...(v.hashtags || [])]) seedTags.add(String(t).toLowerCase().replace(/^#+/, ''));
    for (const c of v.categories || []) seedCategories.add(String(c).toLowerCase());
    for (const c of v.collections || []) seedCollections.add(String(c).toLowerCase());
  }
  return { seedTokens, seedTags, seedCategories, seedCollections };
}

export function buildSections(input = {}) {
  const { videos = [], events = [], selectionCounts = {}, feedback = { dismissed: {}, liked: {} } } = input;
  const preferences = input.preferences || {};
  const candidates = input.candidates || [];
  const seedVideo = input.seedVideo || null;
  const platformFeed = input.platformFeed || { supported: false, videos: [], error: null };
  const weights = input.weights || {};
  const scorer = input.scorer || defaultScorer;
  const limits = input.limits || {};
  const prefs = { recommendationsEnabled: true, personalizationEnabled: true, trendingEnabled: true, platforms: {}, ...preferences };
  const profile = buildProfile({ videos, events, selectionCounts, preferences: prefs });
  const fb = feedbackSets(feedback);
  const positiveSet = fb.positiveSet;
  // A positive signal (liked) wins over a stale dismissal: keeps the engine
  // self-healing even if the local store ever holds both entries for one id.
  const dismissedSet = new Set([...fb.dismissedSet].filter((id) => !positiveSet.has(id)));
  const favoriteSet = new Set(videos.filter((v) => v.favorite).map((v) => v.id));
  const seenSet = new Set(videos.map((v) => v.id));
  const pool = (candidates.length ? candidates : videos).filter((v) => v && !dismissedSet.has(v.id));
  const ctx = { profile, weights, favoriteSet, seenSet, positiveSet, dismissedSet, ...seedContext(seedVideo ? [seedVideo] : videos.slice(0, 8)) };
  const rank = (list, exclude) => list
    .filter((v) => !dismissedSet.has(v.id) && !(exclude && exclude.has(keyOf(v))))
    .map((v) => ({ video: v, ...scorer(v, ctx) }))
    .sort((a, b) => b.total - a.total);
  const used = new Set();
  const lim = (key, fallback) => limits[key] ?? (SECTION_DEFS.find((d) => d.key === key) || {}).limit ?? fallback;
  const take = (ranked, n) => {
    const out = [];
    for (const r of ranked) {
      const k = keyOf(r.video);
      if (used.has(k)) continue;
      used.add(k);
      out.push(r);
      if (out.length >= n) break;
    }
    return out;
  };
  const favorites = videos.filter((v) => v.favorite);
  const recent = [...videos].sort((a, b) => new Date(b.savedAt || b.updatedAt || 0) - new Date(a.savedAt || a.updatedAt || 0));
  const trendingPool = pool.filter((v) => (Number(v.engagement && v.engagement.views) || 0) > 0 || (Number(v.engagement && v.engagement.likes) || 0) > 0);
  const emptySections = () => Object.fromEntries(SECTION_DEFS.map((d) => [d.key, { ...d, items: [], state: 'empty' }]));
  if (!prefs.recommendationsEnabled) {
    return { profile, disabled: true, sections: Object.fromEntries(SECTION_DEFS.map((d) => [d.key, { ...d, items: [], state: 'disabled' }])), platformFeed };
  }
  if (!prefs.personalizationEnabled) {
    const chrono = [...pool].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))
      .map((video) => ({ video, total: 0, reasons: [{ signal: 'recency', points: 0, label: 'latest first' }] }));
    const sections = emptySections();
    sections.forYou = { key: 'forYou', title: 'For You', items: take(chrono, lim('forYou', 6)), state: 'ok' };
    sections.recommended = { key: 'recommended', title: 'Recommended', items: take(chrono, lim('recommended', 6)), state: 'ok' };
    sections.recentlyVisited = { key: 'recentlyVisited', title: 'Recently Visited', items: recent.filter((v) => !dismissedSet.has(v.id)).slice(0, lim('recentlyVisited', 4)).map((video) => ({ video, total: 0, reasons: [] })), state: 'ok' };
    sections.trending = prefs.trendingEnabled
      ? { key: 'trending', title: 'Trending', items: [], state: platformFeed.supported ? 'ok' : 'unavailable' }
      : { key: 'trending', title: 'Trending', items: [], state: 'disabled' };
    return { profile, disabled: false, sections, platformFeed };
  }
  const sections = emptySections();
  // Recently Visited is chronological and OUTSIDE the dedupe budget: it
  // answers "what did I touch last", not "what should I watch next".
  const recentItems = recent.filter((v) => !dismissedSet.has(v.id)).slice(0, lim('recentlyVisited', 4)).map((video) => ({ video, total: 0, reasons: [{ signal: 'recency', points: 0, label: 'recently visited' }] }));
  sections.recentlyVisited = { key: 'recentlyVisited', title: 'Recently Visited', items: recentItems, state: 'ok' };
  const rankedAll = rank(pool);
  sections.forYou = { key: 'forYou', title: 'For You', items: take(rankedAll, lim('forYou', 6)), state: pool.length ? 'ok' : 'empty' };
  sections.recommended = { key: 'recommended', title: 'Recommended', items: take(rankedAll.slice(sections.forYou.items.length), lim('recommended', 6)), state: pool.length ? 'ok' : 'empty' };
  const trendingRanked = prefs.trendingEnabled ? rank(trendingPool.length ? trendingPool : pool) : [];
  sections.trending = {
    key: 'trending', title: 'Trending',
    items: prefs.trendingEnabled ? take(trendingRanked, lim('trending', 6)) : [],
    state: !prefs.trendingEnabled ? 'disabled' : (platformFeed.error && platformFeed.error.code === 'AUTH_REQUIRED' ? 'auth-required' : (trendingRanked.length || platformFeed.supported ? 'ok' : 'unavailable'))
  };
  const anchor = seedVideo || videos.find((v) => v.favorite) || videos[0] || null;
  const anchorCtx = { ...ctx, ...seedContext(anchor ? [anchor] : []) };
  // Anchor-relative sections use a LOCAL budget (no shared `used` slots):
  // they explain picks relative to one video, so with small libraries they
  // must still surface every other video even if it already ranked in
  // For You / Recommended. Global dedupe applies to the discovery sections
  // (forYou, recommended, similar, fromFavorites, fromCollections).
  const similarRanked = anchor ? pool.filter((v) => keyOf(v) !== keyOf(anchor)).map((v) => ({ video: v, ...scorer(v, anchorCtx) })).sort((a, b) => b.total - a.total) : [];
  const takeLocal = (ranked, n) => ranked.slice(0, n);
  // Refill helper: strict dedupe first, then top-up from the ranked list
  // (skipping only dismissed) so affinity sections stay useful instead of
  // empty once For You / Recommended consumed the shared budget.
  const takeWithRefill = (ranked, n) => {
    const strict = take(ranked, n);
    if (strict.length >= n) return strict;
    const have = new Set(strict.map((r) => keyOf(r.video)));
    for (const r of ranked) {
      if (strict.length >= n) break;
      const k = keyOf(r.video);
      if (have.has(k) || dismissedSet.has(r.video.id)) continue;
      have.add(k);
      strict.push(r);
    }
    return strict;
  };
  // `similar` participates in global dedupe (discovery slot); becauseSaved
  // is the explanatory mirror and intentionally exempt.
  sections.similar = { key: 'similar', title: 'Similar Videos', items: take(similarRanked, lim('similar', 4)), state: anchor ? 'ok' : 'empty', anchor };
  sections.becauseYouSaved = {
    key: 'becauseYouSaved', title: anchor && !anchor.favorite ? 'Because You Saved “' + truncate(anchor.title, 28) + '”' : 'Because You Saved',
    items: takeLocal(similarRanked, lim('becauseYouSaved', 4)), state: anchor ? 'ok' : 'empty', anchor
  };
  // From Your Favorites never recommends a favorite itself; it finds
  // non-favorites by favorite affinity. Fall back to favorite-adjacent
  // ranking (creator/platform affinity) so small libraries still answer.
  const nonFavPool = favorites.length ? pool.filter((v) => !v.favorite) : [];
  const favCtx = { ...ctx, favoriteBoost: true };
  const favRanked = nonFavPool.map((v) => ({ video: v, ...scorer(v, favCtx) })).sort((a, b) => b.total - a.total);
  sections.fromFavorites = { key: 'fromFavorites', title: 'From Your Favorites', items: takeWithRefill(favRanked, lim('fromFavorites', 4)), state: favorites.length ? (favRanked.length ? 'ok' : 'empty') : 'empty' };
  const collSeeds = videos.filter((v) => (v.collections || []).length);
  sections.fromCollections = {
    key: 'fromCollections', title: 'Similar to Your Collections',
    items: takeWithRefill(rank(collSeeds.length ? pool : []), lim('fromCollections', 4)),
    state: collSeeds.length ? 'ok' : 'empty'
  };
  return { profile, disabled: false, sections, platformFeed };
}

function truncate(s = '', n = 28) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

export function recommendLegacy(videos = [], limit = 6, extra = {}) {
  const built = buildSections({ videos, ...extra });
  return built.sections.forYou.items.map((i) => i.video).slice(0, limit);
}
