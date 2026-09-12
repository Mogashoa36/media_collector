import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeError, classifyFailure, ErrorCodes } from '../src/components/video-vault/js/downloads/errors.js';
import { DirectMediaProvider } from '../src/components/video-vault/js/downloads/providers/directMediaProvider.js';
import { BrowserDetectionProvider } from '../src/components/video-vault/js/downloads/providers/browserDetectionProvider.js';
import { YtDlpProvider } from '../src/components/video-vault/js/downloads/providers/ytDlpProvider.js';
import { SaveFromProvider } from '../src/components/video-vault/js/downloads/providers/saveFromProvider.js';
import { ProviderRegistry, createDefaultRegistry } from '../src/components/video-vault/js/downloads/providerRegistry.js';

describe('direct media', () => {
  it('resolves mp4 with file type', async () => {
    const r = await new DirectMediaProvider().resolve({ title: 't', contentUrl: 'https://cdn.test/a.mp4' });
    assert.equal(r.available, true);
    assert.equal(r.options[0].provider, 'direct');
    assert.equal(r.options[0].fileType, 'mp4');
  });
  it('exposes hls and dash as stream options', async () => {
    for (const pair of [['https://cdn.test/a.m3u8', 'hls'], ['https://cdn.test/a.mpd', 'dash']]) {
      const r = await new DirectMediaProvider().resolve({ title: 't', video: { contentUrl: pair[0] } });
      assert.equal(r.options[0].format, pair[1]);
      assert.equal(r.options[0].action, 'open');
    }
  });
  it('misses cleanly on unsupported media', async () => {
    const r = await new DirectMediaProvider().resolve({ url: 'https://youtube.com/watch?v=1' });
    assert.equal(r.available, false);
    assert.equal(r.error.code, 'UNSUPPORTED');
  });
  it('uses browser-detected media', async () => {
    const r = await new BrowserDetectionProvider().resolve({ detectedMediaUrl: 'https://cdn.test/b.webm' });
    assert.equal(r.available, true);
  });
});

describe('fallback between providers', () => {
  it('falls back to savefrom when yt-dlp helper is down', async () => {
    const reg = createDefaultRegistry({ ytDlpBridge: { available: async () => false, formats: async () => ({ formats: [] }) }, saveFrom: { fetchFn: async () => { throw new Error('down'); } } });
    const agg = await reg.resolve({ url: 'https://www.youtube.com/watch?v=abc', platform: 'YouTube' });
    assert.equal(agg.available, true);
    assert.equal(agg.provider, 'savefrom');
  });
  it('short-circuits on AUTH_REQUIRED', async () => {
    const reg = createDefaultRegistry({ ytDlpBridge: { available: async () => true, formats: async () => ({ authRequired: true }) } });
    const agg = await reg.resolve({ url: 'https://www.youtube.com/watch?v=abc', platform: 'YouTube' });
    assert.equal(agg.error.code, 'AUTH_REQUIRED');
  });
  it('survives provider throw', async () => {
    const bad = { name: 'direct', resolve: async () => { throw new Error('boom'); } };
    const reg = new ProviderRegistry([bad, new SaveFromProvider({ fetchFn: async () => { throw new Error('x'); } })]);
    const agg = await reg.resolve({ url: 'https://www.youtube.com/watch?v=1', platform: 'YouTube' });
    assert.equal(agg.available, true);
  });
  it('reports unavailable when nothing can serve', async () => {
    const agg = await new ProviderRegistry([]).resolve({ url: 'https://example.com/x' });
    assert.equal(agg.available, false);
  });
});
describe('savefrom fallback', () => {
  it('page fallback on network failure', async () => {
    const r = await new SaveFromProvider({ fetchFn: async () => { throw new Error('down'); } })
      .resolve({ url: 'https://www.youtube.com/watch?v=abc', platform: 'YouTube' });
    assert.equal(r.options[0].action, 'open-savefrom');
  });
  it('direct url on extraction success', async () => {
    const r = await new SaveFromProvider({ fetchFn: async () => ({ ok: true, text: async () => JSON.stringify({ url: 'https://cdn/dl.mp4' }) }) })
      .resolve({ url: 'https://www.youtube.com/watch?v=abc', platform: 'YouTube' });
    assert.equal(r.options[0].url, 'https://cdn/dl.mp4');
  });
  it('unsupported platform rejected', async () => {
    const r = await new SaveFromProvider().resolve({ url: 'https://example.com/x', platform: 'Other' });
    assert.equal(r.error.code, 'UNSUPPORTED');
  });
});

describe('yt-dlp states and errors', () => {
  it('lists formats with detecting signal', async () => {
    const seen = [];
    const p = new YtDlpProvider({ available: async () => true, formats: async () => ({ title: 'T', formats: [{ ext: 'mp4', height: 720, url: 'https://cdn/x.mp4' }] }) });
    p.onStatus((e) => seen.push(e.status));
    const r = await p.resolve({ url: 'https://www.youtube.com/watch?v=1', platform: 'YouTube' });
    assert.equal(r.available, true);
    assert.ok(seen.includes('detecting'));
  });
  it('maps auth private network ffmpeg cancel', async () => {
    const cases = [[new Error('please sign in'), 'AUTH_REQUIRED'], [new Error('private video'), 'PRIVATE_CONTENT'], [new Error('network timeout'), 'NETWORK_ERROR'], [new Error('ffmpeg missing'), 'PROVIDER_ERROR'], [new Error('cancelled'), 'PROVIDER_ERROR']];
    for (const pair of cases) {
      const p = new YtDlpProvider({ available: async () => true, formats: async () => { throw pair[0]; } });
      const r = await p.resolve({ url: 'https://www.youtube.com/watch?v=1', platform: 'YouTube' });
      assert.equal(r.error.code, pair[1]);
    }
  });
  it('progress then complete', async () => {
    const flow = [];
    const p = new YtDlpProvider({ available: async () => true, formats: async () => ({ formats: [] }), download: async (payload, cb) => { cb && cb({ percent: 50 }); return { ok: true }; } });
    p.onStatus((e) => flow.push(e.status));
    const d = await p.startDownload('https://www.youtube.com/watch?v=1', { formatId: '22' }, () => {});
    assert.equal(d.ok, true);
    assert.ok(flow.includes('downloading') && flow.includes('complete'));
  });
});

describe('standard error codes', () => {
  it('normalizes and classifies', () => {
    assert.equal(normalizeError('AUTH_REQUIRED').code, ErrorCodes.AUTH_REQUIRED);
    assert.equal(classifyFailure({ httpStatus: 401 }), 'AUTH_REQUIRED');
    assert.equal(classifyFailure({ message: 'private video' }), 'PRIVATE_CONTENT');
    assert.equal(normalizeError('BOGUS').code, 'UNKNOWN');
  });
});
