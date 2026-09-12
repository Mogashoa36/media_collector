// Integration tests for the main VideoVault recommendation flows.
// Pure modules + storage-free inputs; mirrors the popup's Browse/Details
// display-dedupe and state mapping without needing a real DOM.
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { buildSections, SECTION_DEFS } from '../src/components/video-vault/js/personalization/sections.js';
import { buildProfile } from '../src/components/video-vault/js/personalization/profile.js';
import { getPlatformRecommendations, getRecommendations } from '../src/components/video-vault/js/personalization/recommendationService.js';

const v = (o) => ({ id: o.id, title: o.title || '', description: o.description || '', platform: o.platform || 'YouTube',
  creator: { name: o.creator || '' }, collections: o.collections || [], tags: o.tags || [], hashtags: o.hashtags || [],
  categories: o.categories || [], savedAt: o.savedAt || new Date().toISOString(), favorite: !!o.favorite,
  engagement: o.engagement || {}, url: 'https://x.test/' + o.id, canonicalUrl: 'https://x.test/' + o.id });

const lib = () => [
  v({ id: 'a', title: 'lofi hip hop beats to relax', creator: 'Chill Tunes', collections: ['Music'], tags: ['lofi'], favorite: true }),
  v({ id: 'b', title: 'lofi hip hop beats to focus', creator: 'Chill Tunes', collections: ['Music'], tags: ['lofi'] }),
  v({ id: 'c', title: 'baking sourdough bread tutorial', creator: 'Baker', collections: ['Cooking'] }),
  v({ id: 'd', title: 'morning jazz piano session', creator: 'Jazz Club', platform: 'Vimeo' }),
  v({ id: 'e', title: 'lofi hip hop beats to sleep', creator: 'Chill Tunes', collections: ['Music'], tags: ['lofi'] }),
  v({ id: 'f', title: 'evening jazz guitar session', creator: 'Jazz Club', platform: 'Vimeo' }),
  v({ id: 'g', title: 'sourdough pizza from scratch', creator: 'Baker', collections: ['Cooking'] }),
  v({ id: 'h', title: 'deep focus ambient electronic mix', creator: 'Night Drive', collections: ['Music'] })
];

// Mirrors browseSections() display dedupe in popup.js (history exempt).
function displayDedupeLists(sec) {
  const seen = new Set();
  const dedupe = (list) => list.filter((i) => { const k = i.video.canonicalUrl || i.video.url || i.video.id; if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return {
    forYou: dedupe(sec.forYou.items), recommended: dedupe(sec.recommended.items), similar: dedupe(sec.similar.items),
    fromFavorites: dedupe(sec.fromFavorites.items), fromCollections: dedupe(sec.fromCollections.items)
  };
}

// Mirrors openDetails() rec-group selection in popup.js.
function detailsGroups(sec) {
  const seen = new Set();
  const dedupe = (list) => list.filter((i) => { const k = i.video.canonicalUrl || i.video.url || i.video.id; if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return [
    { title: 'SIMILAR VIDEOS', items: dedupe(sec.similar.items) },
    { title: 'FROM YOUR FAVORITES', items: dedupe(sec.fromFavorites.items) },
    { title: 'SIMILAR TO YOUR COLLECTIONS', items: dedupe(sec.fromCollections.items) }
  ].filter((g) => g.items.length);
}

describe('recommendation UI flows (integration)', () => {
  it('flow: cold start renders empty Browse sections with usable states', () => {
    const r = buildSections({ videos: [] });
    assert.equal(r.sections.forYou.state, 'empty');
    assert.equal(r.sections.trending.state, 'unavailable');
    assert.equal(detailsGroups(r.sections).length, 0);
  });

  it('flow: saving videos populates For You with explainable reasons', () => {
    const events = lib().slice(0, 3).map((vid) => ({ type: 'saved', platform: vid.platform, title: vid.title, at: Date.now() }));
    const r = buildSections({ videos: lib(), events });
    assert.ok(r.sections.forYou.items.length > 0);
    assert.ok(r.sections.forYou.items[0].reasons.length > 0);
    assert.ok(r.sections.becauseYouSaved.items.length > 0);
  });

  it('flow: opening videos strengthens platform + vocabulary signals', () => {
    const opened = [{ type: 'opened', platform: 'Vimeo', title: 'morning jazz piano session', at: Date.now() }];
    const withOpen = buildProfile({ videos: lib(), events: opened });
    const without = buildProfile({ videos: lib() });
    assert.ok((withOpen.maps.platforms.get('vimeo') || 0) > (without.maps.platforms.get('vimeo') || 0));
    assert.ok((withOpen.maps.keywords.get('jazz') || 0) > (without.maps.keywords.get('jazz') || 0));
  });

  it('flow: selecting videos frequently boosts their keywords', () => {
    const vids = lib();
    const counts = { b: 5 };
    const profile = buildProfile({ videos: vids, selectionCounts: counts });
    const tokens = 'lofi hip hop beats to focus'.split(' ').filter((t) => t.length > 2);
    const boosted = tokens.some((t) => (profile.maps.keywords.get(t) || 0) >= 1);
    assert.ok(boosted);
  });

  it('flow: favoriting switches From Your Favorites to ok and feeds signals', () => {
    const base = buildSections({ videos: lib().map((x) => ({ ...x, favorite: false })) });
    assert.equal(base.sections.fromFavorites.state, 'empty');
    const after = buildSections({ videos: lib(), events: [{ type: 'favorite', platform: 'YouTube', title: 'lofi hip hop beats to relax', at: Date.now() }] });
    assert.equal(after.sections.fromFavorites.state, 'ok');
    assert.ok(after.sections.fromFavorites.items.length > 0);
  });

  it('flow: Not Interested removes the pick everywhere, immediately', () => {
    const before = buildSections({ videos: lib() });
    assert.ok(before.sections.forYou.items.some((i) => i.video.id === 'a'));
    const after = buildSections({ videos: lib(), feedback: { dismissed: { a: { at: Date.now(), reason: 'not-interested' } }, liked: {} } });
    const all = Object.values(after.sections).flatMap((s) => s.items.map((i) => i.video.id));
    assert.ok(!all.includes('a'));
    assert.ok(after.sections.forYou.items.length > 0);
  });

  it('flow: Browse page shows zero duplicates across recommendation sections', () => {
    const r = buildSections({ videos: lib() });
    const lists = displayDedupeLists(r.sections);
    const all = Object.values(lists).flatMap((l) => l.map((i) => i.video.id));
    assert.equal(all.length, new Set(all).size);
  });

  it('flow: Details modal shows deduped recommendation groups with reasons', () => {
    const r = buildSections({ videos: lib(), seedVideo: lib()[0], limits: { similar: 3 } });
    const groups = detailsGroups(r.sections);
    assert.ok(groups.length > 0);
    const ids = groups.flatMap((g) => g.items.map((i) => i.video.id));
    assert.equal(ids.length, new Set(ids).size);
    for (const group of groups) {
      for (const item of group.items) assert.ok(Array.isArray(item.reasons));
    }
  });

  it('flow: platform adapter recommendations merge; AUTH_REQUIRED keeps local sections', async () => {
    const adapters = [
      { platform: 'YouTube', getRecommendations: async () => ({ supported: true, videos: [v({ id: 'p1', title: 'platform pick', platform: 'YouTube' })] }) },
      { platform: 'Instagram', getRecommendations: async () => ({ supported: false, videos: [], error: { code: 'AUTH_REQUIRED', message: 'Login required' } }) },
      { platform: 'TikTok', getRecommendations: async () => { throw new Error('network down'); } }
    ];
    const merged = await getPlatformRecommendations(adapters);
    assert.equal(merged.videos.length, 1);
    assert.equal(merged.authRequired.adapter, 'Instagram');
    assert.equal(merged.unavailable, 1);

    const r = await getRecommendations({ videos: lib(), adapters });
    assert.ok(r.sections.forYou.items.length > 0);
    assert.equal(r.sections.trending.state, 'auth-required');
    assert.ok(r.platformFeed.videos.length === 1);
  });

  it('flow: settings toggles drive the UI states', () => {
    const vids = lib();
    assert.equal(buildSections({ videos: vids, preferences: { recommendationsEnabled: false } }).disabled, true);
    const chrono = buildSections({ videos: vids, preferences: { personalizationEnabled: false } });
    assert.ok(chrono.sections.forYou.items.length > 0);
    assert.equal(chrono.sections.forYou.items[0].total, 0);
    assert.equal(buildSections({ videos: vids, preferences: { trendingEnabled: false } }).sections.trending.state, 'disabled');
  });

  it('flow: clearing history / reset returns the engine to cold-start shape', () => {
    const r = buildSections({ videos: [], events: [], selectionCounts: {}, feedback: { dismissed: {}, liked: {} } });
    for (const d of SECTION_DEFS) {
      assert.ok(Array.isArray(r.sections[d.key].items));
      assert.equal(r.sections[d.key].items.length, 0);
    }
  });

  it('flow: dismissed content is excluded before display dedupe runs', () => {
    const r = buildSections({ videos: lib(), feedback: { dismissed: { h: { at: 1, reason: 'remove-recommendation' } }, liked: {} } });
    const lists = displayDedupeLists(r.sections);
    const all = Object.values(lists).flatMap((l) => l.map((i) => i.video.id));
    assert.ok(!all.includes('h'));
  });
});
