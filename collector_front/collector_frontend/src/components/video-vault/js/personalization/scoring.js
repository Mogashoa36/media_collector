// Transparent, swappable scoring model.
// A scorer is (candidate, context) => { total, reasons[] }.
// The default scorer is a weighted sum of explainable signals; a future ML
// model only needs to implement the same interface and be passed as
// { scorer } to buildSections() — no UI rewrite required.
import { tokenize } from './profile.js';

export const DEFAULT_WEIGHTS = Object.freeze({
  contentSimilarity: 3.0,
  creatorRelevance: 2.5,
  platformPreference: 1.2,
  collectionRelevance: 2.0,
  favoriteAffinity: 1.5,
  recency: 0.8,
  popularity: 0.6,
  tagOverlap: 1.5,
  categoryOverlap: 1.2,
  feedbackBoost: 1.0,
  dismissedPenalty: -100,
  seenPenalty: -4
});

function creatorKey(video = {}) {
  const c = video.creator || {};
  return String(c.username || c.name || '').trim().toLowerCase();
}

function candidateTokens(video = {}) {
  return new Set(tokenize(`${video.title || ''} ${video.description || ''}`));
}

function overlap(a, b) {
  if (!a?.size || !b) return 0;
  let n = 0;
  for (const t of a) if (b.has?.(t) ?? b.includes?.(t)) n++;
  return n;
}

function recencyScore(video = {}) {
  const at = video.savedAt || video.publication?.publishedAt || video.updatedAt;
  if (!at) return 0;
  const ageMs = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  return Math.max(0, 1 - ageMs / (30 * 86400000));
}

function popularityScore(video = {}) {
  const e = video.engagement || {};
  const views = Number(e.views) || 0;
  const likes = Number(e.likes) || 0;
  if (!views && !likes) return 0;
  return Math.min(1, Math.log10(views + likes * 10 + 1) / 7);
}

export function defaultScorer(candidate = {}, ctx = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(ctx.weights || {}) };
  const reasons = [];
  let total = 0;
  const add = (key, value, label) => {
    const w = weights[key] ?? 1;
    const pts = value * w;
    if (pts) { total += pts; reasons.push({ signal: key, points: round(pts), label }); }
  };

  const profile = ctx.profile;
  const seedTokens = ctx.seedTokens || new Set();
  const seedTags = ctx.seedTags || new Set();
  const seedCategories = ctx.seedCategories || new Set();
  const seedCollections = ctx.seedCollections || new Set();
  const tokens = candidateTokens(candidate);

  const contentHits = overlap(tokens, seedTokens);
  if (contentHits) add('contentSimilarity', Math.min(4, contentHits) / 4, `${contentHits} shared keywords`);

  const kwScore = [...tokens].reduce((s, t) => s + (profile?.maps.keywords.get(t) || 0), 0);
  if (kwScore > 0) add('contentSimilarity', Math.min(6, kwScore) / 6, 'matches your watch vocabulary');

  const cKey = creatorKey(candidate);
  if (cKey && (profile?.maps.creators.get(cKey) || 0) > 0) {
    add('creatorRelevance', Math.min(4, profile.maps.creators.get(cKey)) / 2, `more from ${candidate.creator?.name || candidate.creator?.username || 'a saved creator'}`);
  }
  const plat = String(candidate.platform || '').toLowerCase();
  if (plat && (profile?.maps.platforms.get(plat) || 0) > 0) {
    add('platformPreference', Math.min(4, profile.maps.platforms.get(plat)) / 4, `you watch ${candidate.platform}`);
  }
  if (plat && profile?.avoidedPlatforms?.has(plat)) total += -2;
  const cols = (candidate.collections || []).map((c) => String(c).toLowerCase());
  const colHits = cols.filter((c) => seedCollections.has(c) || (profile?.maps.collections.get(c) || 0) > 0).length;
  if (colHits) add('collectionRelevance', Math.min(3, colHits) / 1.5, 'fits your collections');
  const tagHits = overlap(new Set([...(candidate.tags || []), ...(candidate.hashtags || [])].map((t) => String(t).toLowerCase().replace(/^#+/, ''))), seedTags);
  if (tagHits) add('tagOverlap', Math.min(3, tagHits) / 1.5, `${tagHits} shared tags`);
  const catHits = overlap(new Set((candidate.categories || []).map((c) => String(c).toLowerCase())), seedCategories);
  if (catHits) add('categoryOverlap', Math.min(2, catHits), 'shared category');
  if (candidate.favorite || ctx.favoriteSet?.has(candidate.id)) add('favoriteAffinity', 1, 'from your favorites');
  // From-Your-Favorites context: candidates are non-favorites by
  // construction; reward affinity with the favorite cohort (shared creator
  // graph + shared vocabulary) so the section answers even for small libs.
  if (ctx.favoriteBoost && !(candidate.favorite || ctx.favoriteSet?.has(candidate.id))) {
    if (cKey && (profile?.maps.creators.get(cKey) || 0) > 0) add('favoriteAffinity', 0.75, 'same creator as a favorite');
    else if (kwScore > 0) add('favoriteAffinity', 0.5, 'similar to your favorites');
    else add('favoriteAffinity', 0.15, 'from your library');
  }
  add('recency', recencyScore(candidate), 'recent');
  add('popularity', popularityScore(candidate), 'popular');
  if (ctx.positiveSet?.has(candidate.id)) add('feedbackBoost', 1.5, 'you liked similar picks');

  if (ctx.dismissedSet?.has(candidate.id)) {
    total += weights.dismissedPenalty;
    reasons.push({ signal: 'dismissed', points: weights.dismissedPenalty, label: 'you dismissed this' });
  } else if (ctx.seenSet?.has(candidate.id)) {
    total += weights.seenPenalty * 0.25;
  }
  return { total: round(total), reasons: reasons.slice(0, 5) };
}

function round(n) { return Math.round(n * 100) / 100; }
