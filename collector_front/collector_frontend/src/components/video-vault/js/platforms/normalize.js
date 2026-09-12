// Normalizers shared by Browse/discovery adapters.
//
// normalizeBrowseVideo() guarantees every Browse result carries the same
// fields so Save/Favorite/Collection/Download/Open-original keep working no
// matter which platform produced the row.
export function normalizeBrowseVideo(raw = {}) {
  const url = raw.url || raw.canonicalUrl || raw.pageUrl || '';
  const thumbnail = typeof raw.thumbnail === 'object'
    ? raw.thumbnail
    : { url: raw.thumbnail || raw.thumbnailData?.url || '', width: null, height: null, format: '', quality: '', source: '', alternatives: [] };
  return {
    id: raw.id || '',
    title: raw.title || raw.cleanedTitle || '',
    description: raw.description || '',
    url,
    canonicalUrl: raw.canonicalUrl || url,
    pageUrl: raw.pageUrl || url,
    contentUrl: raw.contentUrl || raw.video?.contentUrl || '',
    downloadUrl: raw.downloadUrl || '',
    platform: raw.platform || 'Other',
    domain: raw.domain || safeHost(url),
    videoId: raw.videoId || '',
    creator: raw.creator || { name: '', username: '', profileUrl: '' },
    video: {
      duration: raw.video?.duration ?? raw.duration ?? null,
      width: raw.video?.width ?? null,
      height: raw.video?.height ?? null,
      aspectRatio: raw.video?.aspectRatio ?? null,
      format: raw.video?.format || '',
      mimeType: raw.video?.mimeType || '',
      quality: raw.video?.quality || ''
    },
    thumbnail,
    engagement: raw.engagement || { views: null, likes: null, comments: null, shares: null },
    publication: raw.publication || { publishedAt: null },
    tags: raw.tags || [],
    savedAt: raw.savedAt || null
  };
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Sectioned Browse model: Recently Visited / For You / Recommended /
// Trending / Platform-specific — each section degrades independently.
export function sectionBrowse({ recent = [], forYou = [], recommended = [], trending = null, platformRows = [] } = {}) {
  return {
    recent: recent.map(normalizeBrowseVideo),
    forYou: forYou.map(normalizeBrowseVideo),
    recommended: recommended.map(normalizeBrowseVideo),
    trending: trending && trending.supported === false ? { supported: false, reason: trending.reason || 'Trending unavailable' } : (trending?.videos || []).map(normalizeBrowseVideo),
    platformRows: (platformRows || []).map(normalizeBrowseVideo)
  };
}

// Adapter fallback helper: try adapters in order, return first supported
// feed, else a graceful { supported:false } aggregate.
export async function firstSupportedFeed(adapters = [], options = {}) {
  const errors = [];
  for (const adapter of adapters) {
    try {
      const result = await adapter.getFeed(options);
      if (result?.supported) return { supported: true, adapter: adapter.platform, videos: (result.videos || []).map(normalizeBrowseVideo) };
      errors.push({ adapter: adapter.platform, reason: result?.reason || 'unsupported', error: result?.error || null });
    } catch (error) {
      errors.push({ adapter: adapter?.platform || '?', reason: String(error?.message || error) });
    }
  }
  return { supported: false, reason: 'Feed unavailable', errors };
}
