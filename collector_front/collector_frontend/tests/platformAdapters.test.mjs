import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { PlatformAdapter } from '../src/components/video-vault/js/platforms/platformAdapter.js';
import { YouTubeAdapter, TikTokAdapter, RedditAdapter, InstagramAdapter, XTwitterAdapter, VimeoAdapter } from '../src/components/video-vault/js/platforms/adapters.js';
import { normalizeBrowseVideo, firstSupportedFeed, sectionBrowse } from '../src/components/video-vault/js/platforms/normalize.js';
import { adaptersFor, platformForUrl } from '../src/components/video-vault/js/platforms/index.js';

describe('adapter interface', () => {
  it('all platform adapters expose the standard methods', async () => {
    const list = [new YouTubeAdapter('u'), new TikTokAdapter('u'), new RedditAdapter('u'), new InstagramAdapter('u'), new XTwitterAdapter('u'), new VimeoAdapter('u')];
    for (const a of list) {
      for (const m of ['getFeed', 'getVideoDetails', 'getCurrentUser', 'isAuthenticated', 'getRecommendations', 'getDownloadOptions']) assert.equal(typeof a[m], 'function');
      assert.equal((await a.getCurrentUser()).supported, false);
      assert.equal((await a.getRecommendations()).supported, false);
      assert.equal((await a.getDownloadOptions()).supported, false);
    }
    assert.equal((await new PlatformAdapter('X').getFeed()).supported, false);
  });
  it('routes urls to platforms and handles bad urls', () => {
    assert.equal(platformForUrl('https://www.youtube.com/watch?v=1'), 'YouTube');
    assert.equal(adaptersFor('https://www.youtube.com/watch?v=1')[0].platform, 'YouTube');
    assert.equal(adaptersFor('not a url').length, 0);
  });
});

describe('browse normalization', () => {
  it('normalizes rows with platform/canonical/creator metadata', () => {
    const n = normalizeBrowseVideo({ url: 'https://www.youtube.com/watch?v=1', platform: 'YouTube', title: 'T' });
    assert.equal(n.canonicalUrl, 'https://www.youtube.com/watch?v=1');
    assert.equal(n.creator.name, '');
    assert.equal(n.platform, 'YouTube');
  });
  it('sections degrade independently', () => {
    const s2 = sectionBrowse({ recent: [{ url: 'https://x.test', title: 'a' }], forYou: [], recommended: [], trending: { supported: false }, platformRows: [] });
    assert.equal(s2.recent.length, 1);
    assert.equal(s2.trending.supported, false);
  });
  it('malformed platform responses fall back gracefully', async () => {
    const bad = await firstSupportedFeed([{ platform: 'A', getFeed: async () => { throw new Error('net'); } }]);
    assert.equal(bad.supported, false);
    const ok = await firstSupportedFeed([{ platform: 'A', getFeed: async () => ({ supported: false }) }, { platform: 'B', getFeed: async () => ({ supported: true, videos: [{ url: 'https://x.test', title: 'v' }] }) }]);
    assert.equal(ok.supported, true);
    assert.equal(ok.adapter, 'B');
  });
});
