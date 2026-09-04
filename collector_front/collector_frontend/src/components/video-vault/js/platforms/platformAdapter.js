export class PlatformAdapter {
  constructor(platform) { this.platform = platform; }
  async getFeed() { return { supported: false, reason: 'Feed unavailable' }; }
  async getVideoDetails() { return { supported: false }; }
  async getCurrentUser() { return { supported: false }; }
  async isAuthenticated() { return { supported: false, authenticated: false }; }
  async getRecommendations() { return { supported: false, videos: [] }; }
  async getDownloadOptions() { return { supported: false, options: [] }; }
}
