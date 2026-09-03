export function filterVideos(videos, query, view, sort) {
  const normalized = query.trim().toLowerCase();
  let filtered = videos.filter(video => !normalized || [video.title, video.platform, video.url].some(value => value.toLowerCase().includes(normalized)));
  if (view === 'favorites') filtered = filtered.filter(video => video.favorite);
  return filtered.sort((a, b) => sort === 'oldest' ? new Date(a.savedAt) - new Date(b.savedAt) : sort === 'az' ? a.title.localeCompare(b.title) : sort === 'favorites' ? Number(b.favorite) - Number(a.favorite) || new Date(b.savedAt) - new Date(a.savedAt) : new Date(b.savedAt) - new Date(a.savedAt));
}