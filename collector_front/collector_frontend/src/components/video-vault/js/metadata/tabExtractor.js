// VideoVault content script — runs in every web page and answers metadata requests
// from the popup with data read from the LIVE, fully-rendered DOM.
//
// Modern platforms (YouTube, TikTok, Instagram, X, Twitch…) no longer ship meta
// tags or <img> elements in their raw HTML, so a fresh fetch() reads nothing but
// an app shell. The page the user has open, however, is the ground truth: its DOM
// contains the real thumbnail, the <video> element (poster/src/duration) and title.
(() => {
  const SHELL_TITLES = /^(Instagram|TikTok|Twitch|Dailymotion|Facebook|X\s*\/?\s*Twitter|X|Post\s*\/\s*X|Facebook\s*[–—-]\s*(log in|sign up).*|Login\s*•?\s*Instagram)$/i;
  const DIRECT_EXTENSION = /\.(mp4|m4v|mov|mkv|webm|ogg|ogv|m3u8|mpd)(?:$|[?#])/i;
  const absoluteUrl = value => { try { return new URL(value, location.href).href; } catch { return ''; } };
  const attribute = (element, name) => Number(element.getAttribute(name) || 0) || null;

  function thumbnailCandidates() {
    const candidates = [];
    const add = (value, source, width, height) => {
      const url = absoluteUrl(value);
      if (!url || candidates.some(item => item.url === url)) return;
      candidates.push({ url, source, width: width || null, height: height || null });
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const parsed = JSON.parse(script.textContent || '');
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        const video = entries.find(entry => entry && (entry['@type'] === 'VideoObject' || entry.duration || entry.contentUrl));
        if (video) [].concat(video.thumbnailUrl).filter(Boolean).forEach(thumbnail => add(thumbnail, 'json-ld'));
      } catch { }
    });
    document.querySelectorAll('meta[property="og:image"], meta[property="og:image:secure"], meta[name="twitter:image"], meta[name="twitter:image:src"]').forEach(metaTag => add(metaTag.content, metaTag.getAttribute('property') || metaTag.getAttribute('name')));
    document.querySelectorAll('video[poster]').forEach(video => add(video.poster, 'video-poster', attribute(video, 'width'), attribute(video, 'height')));
    document.querySelectorAll('video[src]').forEach(video => add(video.src, 'video-src'));
    document.querySelectorAll('video source[src], link[rel="image_src"], meta[name="thumbnail"]').forEach(element => add(element.src || element.href || element.content, element.tagName === 'link' ? 'image_src' : 'meta-thumbnail'));
    // Rendered <img>s carry live natural dimensions — a strong signal for the real
    // thumbnail (and they have already passed any hotlink checks the page enforces).
    document.querySelectorAll('img').forEach(image => {
      if ((image.currentSrc || image.src) && (image.naturalWidth || image.naturalHeight)) {
        add(image.currentSrc || image.src, 'page-image', image.naturalWidth || null, image.naturalHeight || null);
      }
    });
    return candidates;
  }

  function bestCandidate() {
    const PRIORITY = { 'json-ld': 6, 'open-graph': 5, 'twitter': 5, 'video-poster': 5, 'video-src': 4, 'image_src': 3, 'meta-thumbnail': 3, 'page-image': 0 };
    const score = candidate => (PRIORITY[candidate.source] || 0) * 100000 + (candidate.width || 0) * (candidate.height || 0) + (/original|full|hd|large|maxres|1280|1920/i.test(candidate.url) ? 300 : 0) - (/avatar|icon|logo|placeholder|pixel|tracking|favicon|emoji|sprite|spinner/i.test(candidate.url) ? 10000 : 0);
    const candidates = thumbnailCandidates().sort((a, b) => score(b) - score(a));
    if (!candidates.length) return { url: '', width: null, height: null, format: '', quality: '', source: '', alternatives: [] };
    const selected = candidates[0];
    const area = (selected.width || 0) * (selected.height || 0);
    return { url: selected.url, width: selected.width, height: selected.height, format: selected.url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '', quality: area >= 409600 ? 'HD' : 'standard', source: selected.source, alternatives: candidates.slice(1).map(candidate => candidate.url) };
  }

  function directMediaUrl() {
    const values = [];
    document.querySelectorAll('video').forEach(video => values.push(video.currentSrc || video.src));
    document.querySelectorAll('video source[src]').forEach(source => values.push(source.src));
    document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]').forEach(metaTag => values.push(metaTag.content));
    for (const value of values) {
      if (!value || !/^https?:/i.test(value)) continue;
      try { if (DIRECT_EXTENSION.test(new URL(value).pathname)) return value; } catch { }
    }
    return '';
  }

  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || message.message !== 'videovault:extract') return;
    const videos = [...document.querySelectorAll('video')];
    const video = videos.find(candidate => candidate.currentSrc || candidate.src) || videos[0];
    const width = video?.videoWidth || attribute(video, 'width') || null;
    const height = video?.videoHeight || attribute(video, 'height') || null;
    const duration = videos.map(candidate => candidate.duration).find(value => Number.isFinite(value)) || null;
    const ogTitle = (document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.content || '').trim();
    const rawTitle = document.title || '';
    const title = !rawTitle.trim() ? ogTitle : SHELL_TITLES.test(rawTitle.trim()) ? ogTitle : rawTitle;
    const canonicalElement = document.querySelector('link[rel="canonical"]');
    const canonical = canonicalElement ? absoluteUrl(canonicalElement.href) : location.href;
    sendResponse({
      title,
      pageUrl: location.href,
      url: location.href,
      canonicalUrl: canonical || location.href,
      thumbnail: bestCandidate(),
      contentUrl: directMediaUrl(),
      video: { duration, width, height, aspectRatio: width && height ? Number((width / height).toFixed(3)) : null },
      requiresLogin: false,
      unavailable: false
    });
  });
})();