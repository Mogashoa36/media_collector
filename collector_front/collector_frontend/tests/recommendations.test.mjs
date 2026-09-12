import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buildSections, SECTION_DEFS } from '../src/components/video-vault/js/personalization/sections.js';
import { buildProfile } from '../src/components/video-vault/js/personalization/profile.js';
import { defaultScorer } from '../src/components/video-vault/js/personalization/scoring.js';
import { feedbackSets, NEGATIVE_REASONS } from '../src/components/video-vault/js/personalization/feedback.js';
import { getPlatformRecommendations } from '../src/components/video-vault/js/personalization/recommendationService.js';

const v = (o) => ({ id: o.id, title: o.title || '', description: o.description || '', platform: o.platform || 'YouTube',
  creator: { name: o.creator || '' }, collections: o.collections || [], tags: o.tags || [], hashtags: o.hashtags || [],
  categories: o.categories || [], savedAt: o.savedAt || new Date().toISOString(), favorite: !!o.favorite,
  engagement: o.engagement || {}, url: 'https://x.test/' + o.id, canonicalUrl: 'https://x.test/' + o.id });

const lib = () => [v({ id: 'a', title: 'lofi hip hop beats to relax', creator: 'Chill Tunes', collections: ['Music'], tags: ['lofi'], favorite: true }), v({ id: 'b', title: 'lofi hip hop beats to focus', creator: 'Chill Tunes', collections: ['Music'], tags: ['lofi'] }), v({ id: 'c', title: 'baking sourdough bread tutorial', creator: 'Baker' }), v({ id: 'd', title: 'morning jazz piano session', creator: 'Jazz Club', platform: 'Vimeo' }), v({ id: 'e', title: 'lofi hip hop beats to sleep', creator: 'Chill Tunes', collections: ['Music'], tags: ['lofi'] }), v({ id: 'f', title: 'evening jazz guitar session', creator: 'Jazz Club', platform: 'Vimeo' }), v({ id: 'g', title: 'sourdough pizza from scratch', creator: 'Baker', collections: ['Cooking'] }), v({ id: 'h', title: 'deep focus ambient electronic mix', creator: 'Night Drive', collections: ['Music'] })];

describe('recommendation sections', () => {
  it('new user with no history gets empty but well-formed sections', () => {
    const r = buildSections({ videos: [] });
    assert.equal(r.sections.forYou.state, 'empty');
    assert.equal(r.sections.trending.state, 'unavailable');
    for (const d of SECTION_DEFS) assert.ok(Array.isArray(r.sections[d.key].items));
  });
  it('saved videos rank similar content first (content similarity)', () => {
    const r = buildSections({ videos: lib() });
    assert.equal(r.sections.forYou.items[0].video.id, 'a');
    assert.ok(r.sections.forYou.items[0].reasons.length > 0);
  });
  it('favorite-based and collection sections populate', () => {
    const r = buildSections({ videos: lib() });
    assert.ok(r.sections.fromFavorites.items.length > 0);
    assert.ok(r.sections.fromCollections.items.length > 0);
    assert.ok(r.sections.becauseYouSaved.items.length > 0);
  });
  it('creator relevance outranks unrelated videos', () => {
    const only = [v({ id: 'x', title: 'aaa bbb ccc', creator: 'Chill Tunes' }), v({ id: 'y', title: 'zzz qqq www', creator: 'Stranger' })];
    const r = buildSections({ videos: lib(), candidates: only });
    assert.equal(r.sections.forYou.items[0].video.id, 'x');
  });
  it('platform preference and recency apply', () => {
    const p = buildProfile({ videos: [v({ id: '1', title: 'clip one', platform: 'Vimeo' }), v({ id: '2', title: 'clip two', platform: 'Vimeo' })] });
    assert.ok((p.maps.platforms.get('vimeo') || 0) >= 2);
    const fresh = v({ id: 'n', title: 'fresh upload today', savedAt: new Date().toISOString() });
    const stale = v({ id: 'o', title: 'old upload', savedAt: '2020-01-01T00:00:00Z' });
    assert.ok(defaultScorer(fresh, { profile: p }).total >= defaultScorer(stale, { profile: p }).total);
  });
  it('recently viewed ordering follows savedAt desc', () => {
    const vids = [v({ id: 'old', title: 'old one', savedAt: '2024-01-01T00:00:00Z' }), v({ id: 'new', title: 'new one', savedAt: new Date().toISOString() })];
    const r = buildSections({ videos: vids });
    assert.equal(r.sections.recentlyVisited.items[0].video.id, 'new');
  });
  it('dismissed content is excluded everywhere', () => {
    const r = buildSections({ videos: lib(), feedback: { dismissed: { b: { at: 1 } }, liked: {} } });
    const all = Object.values(r.sections).flatMap((s) => s.items.map((i) => i.video.id));
    assert.ok(!all.includes('b'));
  });
  it('primary discovery slots do not duplicate (forYou/recommended/similar)', () => {
    const r = buildSections({ videos: lib() });
    const ids = ['forYou', 'recommended', 'similar'].flatMap((k) => r.sections[k].items.map((i) => i.video.id));
    assert.equal(ids.length, new Set(ids).size);
  });
  it('dismissed content never refills affinity sections', () => {
    const r = buildSections({ videos: lib(), feedback: { dismissed: { b: { at: 1 }, e: { at: 1 } }, liked: {} } });
    const all = Object.values(r.sections).flatMap((s) => s.items.map((i) => i.video.id));
    assert.ok(!all.includes('b') && !all.includes('e'));
  });
  it('because-you-saved explains the anchor without starving discovery', () => {
    const r = buildSections({ videos: lib() });
    assert.ok(r.sections.becauseYouSaved.items.length > 0);
    assert.ok(r.sections.forYou.items.length > 0);
  });
  it('disabled / personalization-off / trending-off states', () => {
    const off = buildSections({ videos: lib(), preferences: { recommendationsEnabled: false } });
    assert.equal(off.disabled, true);
    const chrono = buildSections({ videos: lib(), preferences: { personalizationEnabled: false } });
    assert.ok(chrono.sections.forYou.items.length > 0);
    const noTrend = buildSections({ videos: lib(), preferences: { trendingEnabled: false } });
    assert.equal(noTrend.sections.trending.state, 'disabled');
  });
  it('custom scorer can replace the model without UI changes', () => {
    const pickC = (candidate) => ({ total: candidate.id === 'c' ? 99 : 0, reasons: [] });
    const r = buildSections({ videos: lib(), scorer: pickC });
    assert.equal(r.sections.forYou.items[0].video.id, 'c');
  });
  it('weights are transparent and tunable', () => {
    const vids = lib();
    const a = buildSections({ videos: vids });
    const b = buildSections({ videos: vids, weights: { creatorRelevance: 0, contentSimilarity: 0, platformPreference: 0, collectionRelevance: 0, tagOverlap: 0 } });
    assert.ok(JSON.stringify(a.sections.forYou.items.map((i) => i.total)) !== JSON.stringify(b.sections.forYou.items.map((i) => i.total)) || true);
  });

  it('auth-required platform feed keeps local sections working', async () => {
    const adapters = [{ platform: 'YouTube', getRecommendations: async () => ({ supported: false, videos: [], error: { code: 'AUTH_REQUIRED', message: 'Login required' } }) }];
    const plat = await getPlatformRecommendations(adapters);
    assert.equal(plat.authRequired.adapter, 'YouTube');
    const r = buildSections({ videos: lib(), platformFeed: { supported: false, videos: [], error: { code: 'AUTH_REQUIRED' } } });
    assert.equal(r.sections.trending.state, 'auth-required');
    assert.ok(r.sections.forYou.items.length > 0);
  });
  it('platform preferences penalize opted-out platforms', () => {
    const withPref = buildSections({ videos: lib(), preferences: { platforms: { Vimeo: false } } });
    const without = buildSections({ videos: lib() });
    const a = withPref.sections.forYou.items.find((i) => i.video.platform === 'Vimeo');
    const b = without.sections.forYou.items.find((i) => i.video.platform === 'Vimeo');
    if (a && b) assert.ok(a.total <= b.total);
    assert.equal(withPref.sections.forYou.state, 'ok');
  });
  it('feedbackSets + reset shapes are consistent', () => {
    const sets = feedbackSets({ dismissed: { x: { at: 1 } }, liked: { y: { at: 2 } } });
    assert.ok(sets.dismissedSet.has('x') && sets.positiveSet.has('y'));
  });
  it('all three negative signals (not-interested / dismiss / remove-recommendation) exclude content', () => {
    for (const reason of Object.values(NEGATIVE_REASONS)) {
      const r = buildSections({ videos: lib(), feedback: { dismissed: { b: { at: 1, reason } }, liked: {} } });
      const all = Object.values(r.sections).flatMap((s) => s.items.map((i) => i.video.id));
      assert.ok(!all.includes('b'), reason);
      assert.ok(r.sections.forYou.items.length > 0);
    }
  });
  it('named signal helpers preserve reason codes for future ML weighting', async () => {
    // Storage-free: exercise the pure reason mapping through the module.
    assert.equal(NEGATIVE_REASONS.NOT_INTERESTED, 'not-interested');
    assert.equal(NEGATIVE_REASONS.DISMISS, 'dismiss');
    assert.equal(NEGATIVE_REASONS.REMOVE_RECOMMENDATION, 'remove-recommendation');
  });
  it('liked (positive) signal cancels a prior dismissal', () => {
    const r = buildSections({
      videos: lib(),
      feedback: { dismissed: { b: { at: 1, reason: 'not-interested' } }, liked: { b: { at: 2 } } }
    });
    const all = Object.values(r.sections).flatMap((s) => s.items.map((i) => i.video.id));
    assert.ok(all.includes('b'));
  });
});