// Consistent platform-adapter interface for Browse/discovery.
// Every adapter returns predictable normalized responses and marks
// unavailable capabilities with { supported:false } instead of throwing.
export class PlatformAdapter {
  constructor(platform) { this.platform = platform; }
  get id() { return this.platform; }
  // Feed/browse: { supported, videos:[normalized], reason?, error? }
  async getFeed(_options = {}) { return { supported: false, reason: 'Feed unavailable' }; }
  // Details: { supported, video?, error? }
  async getVideoDetails(_url, _options = {}) { return { supported: false }; }
  // Identity: { supported, user?, authenticated?, error? }
  async getCurrentUser() { return { supported: false }; }
  // Auth probe: { supported, authenticated, error? } — only true when the
  // platform reliably reports it; never guess logged-out from generic errors.
  async isAuthenticated() { return { supported: false, authenticated: false }; }
  // Recommendations: { supported, videos:[], error? } — callers fall back to
  // local VideoVault data when unsupported/gated.
  async getRecommendations(_options = {}) { return { supported: false, videos: [] }; }
  // Downloads: { supported, options:[normalized], error? }
  async getDownloadOptions(_video, _options = {}) { return { supported: false, options: [] }; }
}
