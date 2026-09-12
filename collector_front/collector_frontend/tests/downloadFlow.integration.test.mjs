// End-to-end download orchestration flows through the real service + registry
// (providers mocked at their boundaries — no network, no DOM, no yt-dlp).
import { describe, it, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { download, resolveDownloadOptions, setRegistry, setYtDlpBridge } from '../src/components/video-vault/js/downloads/downloadService.js';
import { ProviderRegistry, createDefaultRegistry } from '../src/components/video-vault/js/downloads/providerRegistry.js';
import { DirectMediaProvider } from '../src/components/video-vault/js/downloads/providers/directMediaProvider.js';
import { BrowserDetectionProvider } from '../src/components/video-vault/js/downloads/providers/browserDetectionProvider.js';
import { YtDlpProvider } from '../src/components/video-vault/js/downloads/providers/ytDlpProvider.js';
import { SaveFromProvider } from '../src/components/video-vault/js/downloads/providers/saveFromProvider.js';
import { normalizeError } from '../src/components/video-vault/js/downloads/errors.js';

const yt = (bridge) => new YtDlpProvider(bridge);
const sf = (fetchFn) => new SaveFromProvider({ fetchFn: fetchFn || (async () => ({ ok: false })) });
const fullRegistry = (bridge, fetchFn) => new ProviderRegistry([new DirectMediaProvider(), new BrowserDetectionProvider(), yt(bridge || { available: async () => false, formats: async () => ({ formats: [] }) }), sf(fetchFn)]);

const ytVideo = { id: 'v1', title: 'T', url: 'https://www.youtube.com/watch?v=abc', canonicalUrl: 'https://www.youtube.com/watch?v=abc', platform: 'YouTube' };

afterEach(() => { setRegistry(createDefaultRegistry()); setYtDlpBridge(null); });

describe('provider fallback chain (end-to-end)', () => {
  it('direct wins and stops the chain', async () => {
    const reg = fullRegistry();
    const r = await reg.resolve({ ...ytVideo, contentUrl: 'https://cdn.test/a.mp4' });
    assert.equal(r.provider, 'direct');
    assert.equal(r.available, true);
    assert.equal(r.attempts.length, 1);
  });

  it('direct miss → browser detection serves; chain continues on failure', async () => {
    const reg = fullRegistry();
    const r = await reg.resolve({ ...ytVideo, detectedMediaUrl: 'https://cdn.test/b.webm' });
    assert.equal(r.provider, 'browser-detection');
    assert.equal(r.available, true);
    assert.ok(r.attempts.some((a) => a.provider === 'direct' && !a.available));
  });

  it('direct+browser miss → yt-dlp lists formats', async () => {
    const reg = fullRegistry({ available: async () => true, formats: async () => ({ title: 'T', formats: [{ ext: 'mp4', height: 1080, url: 'https://cdn/x.mp4', formatId: '22' }] }) });
    const r = await reg.resolve(ytVideo);
    assert.equal(r.provider, 'ytdlp');
    assert.ok(r.options.some((o) => o.quality === '1080p'));
    assert.ok(r.attempts.filter((a) => !a.available).length >= 2);
  });

  it('yt-dlp helper down → SaveFrom resolves direct URL', async () => {
    const reg = fullRegistry(null, async () => ({ ok: true, text: async () => JSON.stringify({ url: 'https://cdn/sf.mp4', meta: { title: 'T' } }) }));
    const r = await reg.resolve(ytVideo);
    assert.equal(r.provider, 'savefrom');
    assert.equal(r.options[0].url, 'https://cdn/sf.mp4');
  });

  it('SaveFrom API down → open-savefrom page fallback (still usable)', async () => {
    const reg = fullRegistry(null, async () => { throw new Error('cloudflare'); });
    const r = await reg.resolve(ytVideo);
    assert.equal(r.provider, 'savefrom');
    assert.equal(r.options[0].action, 'open-savefrom');
  });

  it('every provider fails → single useful error, no throw', async () => {
    const reg = new ProviderRegistry([
      { name: 'direct', resolve: async () => { throw new Error('boom'); } },
      { name: 'ytdlp', resolve: async () => { throw new Error('helper crashed'); } },
      sf(async () => { throw new Error('down'); })
    ]);
    setRegistry(reg);
    const r = await download({ ...ytVideo });
    assert.equal(r.status, 'unavailable');
    assert.ok(r.error?.message);
    assert.equal(typeof r.error.message, 'string');
  });
});

describe('auth + private flows (login required UI contract)', () => {
  it('logged-out: AUTH_REQUIRED result carries pageUrl for Open Site & Login', async () => {
    setRegistry(fullRegistry({ available: async () => true, formats: async () => ({ authRequired: true }) }));
    const r = await download({ ...ytVideo });
    assert.equal(r.status, 'auth-required');
    assert.equal(r.pageUrl, ytVideo.url);
    assert.ok(/logged out|log in/i.test(r.error.message));
  });

  it('retry after login: same video succeeds once the platform session exists', async () => {
    let authed = false;
    const bridge = { available: async () => true, formats: async () => (authed ? { title: 'T', formats: [{ ext: 'mp4', url: 'https://cdn/x.mp4' }] } : { authRequired: true }) };
    setRegistry(fullRegistry(bridge));
    const before = await download({ ...ytVideo });
    assert.equal(before.status, 'auth-required');
    authed = true; // user logged in on the platform, returns, hits Retry
    const after = await download({ ...ytVideo });
    // Helper-supplied direct URLs download immediately; helper-only formats
    // surface as 'ytdlp' for the picker. Both mean success after login.
    assert.ok(['downloaded', 'ytdlp'].includes(after.status), after.status);
    assert.ok(after.options.length > 0);
  });

  it('private/DRM/paywall content: clearly refused, never bypassed', async () => {
    setRegistry(fullRegistry({ available: async () => true, formats: async () => ({ private: true, error: 'DRM protected' }) }));
    const r = await download({ ...ytVideo });
    assert.equal(r.status, 'private');
    assert.ok(/private|protected|DRM/i.test(r.error.message));
  });
});

describe('duplicate download guard + progress contract', () => {
  it('second identical download while first is in flight returns already-downloading', async () => {
    let release;
    const gate = new Promise((res) => { release = res; });
    const slow = { name: 'direct', resolve: () => gate.then(() => ({ available: false, options: [], error: { code: 'UNSUPPORTED', message: 'no' } })) };
    setRegistry(new ProviderRegistry([slow]));
    const first = download({ ...ytVideo });
    const second = await download({ ...ytVideo });
    assert.equal(second.status, 'already-downloading');
    release();
    const done = await first;
    assert.equal(done.status, 'unavailable');
  });

  it('progress flows through startDownload for helper-driven formats', async () => {
    const flow = [];
    const p = yt({ available: async () => true, formats: async () => ({ formats: [{ ext: 'mp4', height: 720, url: 'https://cdn/x.mp4', formatId: '22' }] }), download: async (payload, cb) => { cb && cb({ percent: 40 }); cb && cb({ percent: 100 }); return { ok: true }; } });
    p.onStatus((e) => flow.push({ s: e.status, p: e.percent }));
    const r = await p.resolve(ytVideo);
    assert.equal(r.available, true);
    const d = await p.startDownload(ytVideo.url, r.options[0], () => { });
    assert.equal(d.ok, true);
    assert.ok(flow.some((f) => f.s === 'downloading' && f.p === 40));
    assert.ok(flow.some((f) => f.s === 'complete'));
  });

  it('cancelled yt-dlp does not block the chain → SaveFrom page fallback serves', async () => {
    const reg = fullRegistry({ available: async () => true, formats: async () => { throw new Error('cancelled by user'); } });
    const r = await reg.resolve(ytVideo);
    assert.equal(r.available, true);
    assert.equal(r.provider, 'savefrom');
    assert.equal(r.options[0].action, 'open-savefrom');
    assert.ok(r.attempts.some((a) => a.provider === 'ytdlp' && !a.available));
  });
});

describe('standardized responses + friendly messages', () => {
  it('all misses carry {available, options, error:{code,message,detail}}', async () => {
    const r = await new DirectMediaProvider().resolve({ title: 't', url: 'https://youtube.com/watch?v=1' });
    assert.equal(r.available, false);
    assert.deepEqual(r.options, []);
    assert.ok(r.error.code && r.error.message && typeof r.error.detail === 'string');
  });
  it('error messages are user-facing (no stack/provider jargon)', () => {
    for (const code of ['UNSUPPORTED', 'NETWORK_ERROR', 'EXTRACTION_ERROR', 'PROVIDER_ERROR', 'PRIVATE_CONTENT', 'AUTH_REQUIRED', 'UNKNOWN']) {
      const e = normalizeError(code, 'ECONNRESET at yt_dlp.sock');
      assert.ok(!/ECONNRESET|yt_dlp|sock/i.test(e.message), code);
      assert.ok(e.message.length > 10);
    }
  });
  it('resolveDownloadOptions never rejects (service-level containment)', async () => {
    setRegistry({ resolve: async () => { throw new Error('registry blew up'); } });
    const r = await resolveDownloadOptions(ytVideo);
    assert.equal(r.available, false);
    assert.equal(r.error.code, 'PROVIDER_ERROR');
    assert.ok(!/registry blew up/i.test(r.error.message));
  });
});
