// Local taste profile built only from on-device VideoVault data.
// Pure + dependency-injectable: pass { videos, events, selectionCounts,
// preferences } in tests instead of touching localStorage.
// No network, no third-party calls, no credentials of any kind.
export function tokenize(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9#@_'\u00c0-\u024f\u1e00-\u1eff.\s-]/gi, ' ')
    .split(/[\s_.,;:!?(){}\[\]"'`~^$*+=|<>«»—–-]+/)
    .map((t) => t.trim().replace(/^#+/, ''))
    .filter((t) => t.length > 2 && !STOP.has(t));
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has', 'are',
  'was', 'were', 'will', 'would', 'about', 'into', 'your', 'you', 'our',
  'video', 'videos', 'watch', 'official', 'full', 'part', 'episode', 'new',
  'best', 'top', 'how', 'what', 'when', 'why', 'she', 'him', 'her', 'his',
  'its', 'our', 'out', 'now', 'get', 'got', 'just', 'like', 'more', 'most',
  'over', 'under', 'after', 'before', 'between', 'through', 'during', 'each',
  'other', 'some', 'such', 'than', 'then', 'too', 'very', 'can', 'also'
]);

function creatorKey(video = {}) {
  const c = video.creator || {};
  return String(c.username || c.name || '').trim().toLowerCase();
}

function bump(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

export function buildProfile({ videos = [], events = [], selectionCounts = {}, preferences = {} } = {}) {
  const platforms = new Map();
  const creators = new Map();
  const collections = new Map();
  const keywords = new Map();
  const tags = new Map();
  const categories = new Map();
  const platformPrefs = preferences.platforms || {};
  const preferredPlatforms = new Set(
    Object.entries(platformPrefs).filter(([, v]) => v === true).map(([k]) => String(k).toLowerCase())
  );
  const avoidedPlatforms = new Set(
    Object.entries(platformPrefs).filter(([, v]) => v === false).map(([k]) => String(k).toLowerCase())
  );

  const saved = videos.filter((v) => v && (v.savedAt || v.id));
  for (const v of saved) {
    const w = 1;
    bump(platforms, String(v.platform || '').toLowerCase(), w);
    bump(creators, creatorKey(v), 2);
    for (const c of v.collections || []) bump(collections, String(c).toLowerCase(), 1.5);
    for (const t of tokenize(`${v.title || ''} ${v.description || ''}`)) bump(keywords, t, 1);
    for (const t of [...(v.tags || []), ...(v.hashtags || [])]) bump(tags, String(t).toLowerCase().replace(/^#+/, ''), 1.5);
    for (const c of v.categories || []) bump(categories, String(c).toLowerCase(), 1.5);
    if (v.favorite) {
      bump(creators, creatorKey(v), 2);
      bump(platforms, String(v.platform || '').toLowerCase(), 1);
      for (const t of tokenize(v.title)) bump(keywords, t, 1);
    }
  }

  // Behavioural events: opened/viewed, selected, explicit feedback.
  // Negative signals are stored separately and applied as penalties later.
  for (const e of events || []) {
    const kind = e.type || e.action || '';
    if (kind === 'opened' || kind === 'viewed') {
      bump(platforms, String(e.platform || '').toLowerCase(), 0.5);
      for (const t of tokenize(e.title)) bump(keywords, t, 0.5);
    } else if (kind === 'saved') {
      bump(platforms, String(e.platform || '').toLowerCase(), 0.75);
    } else if (kind === 'favorite') {
      bump(platforms, String(e.platform || '').toLowerCase(), 1);
    }
  }
  for (const [id, count] of Object.entries(selectionCounts || {})) {
    const v = saved.find((x) => x.id === id);
    if (!v) continue;
    const times = Math.min(Number(count) || 0, 10);
    if (times >= 2) {
      bump(creators, creatorKey(v), times * 0.5);
      for (const t of tokenize(v.title)) bump(keywords, t, times * 0.25);
    }
  }

  const top = (map, n = 12) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    savedCount: saved.length,
    favoriteCount: saved.filter((v) => v.favorite).length,
    topPlatforms: top(platforms), topCreators: top(creators),
    topCollections: top(collections), topKeywords: top(keywords, 30),
    topTags: top(tags), topCategories: top(categories),
    preferredPlatforms, avoidedPlatforms,
    maps: { platforms, creators, collections, keywords, tags, categories }
  };
}
