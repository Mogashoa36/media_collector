export function extractJsonLd(document) {
  const result = { thumbnailUrls: [] };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || '');
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const video = entries.find(entry => entry && (entry['@type'] === 'VideoObject' || entry.duration || entry.contentUrl));
      if (!video) continue;
      result.title ||= video.name || '';
      result.description ||= video.description || '';
      result.url ||= video.url || video.embedUrl || '';
      result.contentUrl ||= video.contentUrl || '';
      result.thumbnailUrls.push(...(Array.isArray(video.thumbnailUrl) ? video.thumbnailUrl : [video.thumbnailUrl]).filter(Boolean));
      result.publishedAt ||= video.uploadDate || '';
      result.duration ||= video.duration || '';
      const author = typeof video.author === 'object' ? video.author : {};
      result.creatorName ||= author.name || (typeof video.author === 'string' ? video.author : '');
      result.creatorUrl ||= author.url || '';
      const stats = Array.isArray(video.interactionStatistic) ? video.interactionStatistic : [video.interactionStatistic];
      stats.filter(Boolean).forEach(stat => {
        const type = String(stat.interactionType || '').toLowerCase();
        if (type.includes('watch') || type.includes('view')) result.views ||= stat.userInteractionCount;
        if (type.includes('like')) result.likes ||= stat.userInteractionCount;
        if (type.includes('comment')) result.comments ||= stat.userInteractionCount;
      });
    } catch {
      continue;
    }
  }
  return result;
}
