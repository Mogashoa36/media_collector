import { PlatformAdapter } from './platformAdapter.js';
import { extractMetadata } from '../metadata/metadataExtractor.js';

export class PageAdapter extends PlatformAdapter {
  constructor(platform, url) { super(platform); this.url = url; }
  async getFeed() {
    try {
      const metadata = await extractMetadata(this.url, this.url);
      if (!metadata.title && !metadata.thumbnail?.url) return { supported: false, reason: 'Feed unavailable' };
      return { supported: true, videos: [{ ...metadata, platform: this.platform, url: metadata.url || this.url }] };
    } catch {
      return { supported: false, reason: 'Feed unavailable' };
    }
  }
  async getVideoDetails() { return this.getFeed(); }
  async getCurrentUser() { return { supported: false }; }
  async isAuthenticated() { return { supported: true, authenticated: Boolean(localStorage.getItem(`videovault-authenticated:${this.platform}`)) }; }
  async getRecommendations() { return { supported: false, videos: [] }; }
  async getDownloadOptions() { return { supported: false, options: [] }; }
}
