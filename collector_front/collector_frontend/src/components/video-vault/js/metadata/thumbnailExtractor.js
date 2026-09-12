function absoluteUrl(value, pageUrl) {
  try { return new URL(value, pageUrl).href; } catch { return ''; }
}

function dimensions(candidate) {
  const width = Number(candidate.width || candidate.getAttribute?.('width') || 0);
  const height = Number(candidate.height || candidate.getAttribute?.('height') || 0);
  return { width: width || null, height: height || null };
}

// Declared "this is the thumbnail" metadata beats random <img> tags, which on
// modern sites are usually avatars, logos, or ad slots.
const SOURCE_PRIORITY = { 'json-ld': 6, 'open-graph': 5, 'twitter': 5, 'video-poster': 5, 'video-src': 4, 'image_src': 3, 'meta-thumbnail': 3, 'page-image': 0 };

function score(candidate) {
  const area = (candidate.width || 0) * (candidate.height || 0);
  const quality = /original|full|hd|large|maxres|1280|1920/i.test(candidate.url) ? 300 : 0;
  const penalty = /avatar|icon|logo|placeholder|pixel|tracking|favicon|emoji|sprite|spinner/i.test(candidate.url) ? 10000 : 0;
  return (SOURCE_PRIORITY[candidate.source] || 0) * 100000 + area + quality - penalty;
}

function collectCandidates(document, pageUrl, extra = []) {
  const candidates = [];
  const add = (value, source, width, height) => {
    const url = absoluteUrl(value, pageUrl);
    if (!url || candidates.some(item => item.url === url)) return;
    candidates.push({ url, source, width: width || null, height: height || null });
  };
  extra.filter(Boolean).forEach(thumbnail => add(thumbnail, 'json-ld'));
  document.querySelectorAll('meta[property="og:image"], meta[property="og:image:secure"], meta[name="twitter:image"], meta[name="twitter:image:src"]').forEach(meta => add(meta.content, meta.getAttribute('property') || meta.getAttribute('name')));
  document.querySelectorAll('video[poster]').forEach(video => add(video.poster, 'video-poster', ...Object.values(dimensions(video))));
  document.querySelectorAll('video[src]').forEach(video => add(video.src, 'video-src'));
  document.querySelectorAll('video source[src], link[rel="image_src"], meta[name="thumbnail"]').forEach(element => add(element.src || element.href || element.content, element.tagName === 'link' ? 'image_src' : 'meta-thumbnail'));
  document.querySelectorAll('img').forEach(image => add(image.currentSrc || image.src, 'page-image', ...Object.values(dimensions(image))));
  return candidates;
}

async function loadImage(url, timeout = 3000) {
  return await new Promise(resolve => {
    const image = new Image();
    let done = false;
    const finish = result => { if (done) return; done = true; image.onload = null; image.onerror = null; resolve(result); };
    image.onload = () => finish({ width: image.naturalWidth || image.width || null, height: image.naturalHeight || image.height || null });
    image.onerror = () => finish(null);
    setTimeout(() => finish(null), timeout);
    try { image.decoding = 'async'; } catch { }
    image.src = url;
  });
}

export async function extractThumbnail(document, pageUrl, platform = '', extraThumbnails = []) {
  const candidates = collectCandidates(document, pageUrl, extraThumbnails).sort((a, b) => score(b) - score(a));
  if (!candidates.length) return { url: '', width: null, height: null, format: '', quality: '', source: '', alternatives: [] };
  // Verify the top candidates actually load in THIS browser: a URL that fails here
  // will also fail in the gallery, so walk down instead of trusting the first
  // (often hotlink-protected or 404) match blindly.
  let selected = candidates[0];
  for (const candidate of candidates.slice(0, 3)) {
    const loaded = await loadImage(candidate.url);
    if (loaded) { selected = { ...candidate, ...loaded }; break; }
  }
  const width = selected.width;
  const height = selected.height;
  const area = (width || 0) * (height || 0);
  return { url: selected.url, width, height, format: selected.url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '', quality: area >= 2073600 ? 'Full HD' : area >= 409600 ? 'HD' : 'standard', source: selected.source, alternatives: candidates.filter(item => item.url !== selected.url).map(item => item.url) };
}
