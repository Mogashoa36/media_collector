import { PlatformAdapter } from './platformAdapter.js';
import { extractMetadata } from '../metadata/metadataExtractor.js';
import { normalizeBrowseVideo } from './normalize.js';

export class PageAdapter extends PlatformAdapter {
  constructor(platform, url) { super(platform); this.url = url; }
  async getFeed() {
    try {
      const metadata = await extractMetadata(this.url, this.url);
      if (metadata?.requiresLogin) return { supported: false, reason: 'Login required', error: { code: 'AUTH_REQUIRED', message: 'Login required' }, authUrl: this.url };
      if (metadata?.unavailable || (!metadata.title && !metadata.thumbnail?.url)) return { supported: false, reason: 'Feed unavailable' };
      const video = normalizeBrowseVideo({ ...metadata, platform: this.platform, url: metadata.url || this.url, pageUrl: this.url, canonicalUrl: metadata.canonicalUrl || this.url });
      return { supported: true, videos: [video] };
    } catch (error) {
      return { supported: false, reason: 'Feed unavailable', error: { code: 'NETWORK_ERROR', message: String(error?.message || error) } };
    }
  }
  async getVideoDetails(url = this.url) {
    const feed = await this.getFeed({ url });
    if (!feed.supported) return { supported: false, error: feed.error || null, reason: feed.reason };
    return { supported: true, video: feed.videos[0] };
  }
  async getCurrentUser() { return { supported: false }; }
  async isAuthenticated() {
    try {
      return { supported: true, authenticated: Boolean(localStorage.getItem(`videovault-authenticated:${this.platform}`)) };
    } catch { return { supported: false, authenticated: false }; }
  }
  // Local-data recommendations: never claim platform feed support; the
  // Browse UI falls back to saved videos when this is unsupported.
  async getRecommendations() { return { supported: false, videos: [] }; }
  async getDownloadOptions() { return { supported: false, options: [] }; }
}
