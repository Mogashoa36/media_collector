function absoluteUrl(value, pageUrl) {
  try { return new URL(value, pageUrl).href; } catch { return ''; }
}

function dimensions(candidate) {
  const width = Number(candidate.width || candidate.getAttribute?.('width') || 0);
  const height = Number(candidate.height || candidate.getAttribute?.('height') || 0);
  return { width: width || null, height: height || null };
}

function score(candidate) {
  const area = (candidate.width || 0) * (candidate.height || 0);
  const quality = /original|full|hd|large|maxres|1280|1920/i.test(candidate.url) ? 300 : 0;
  const penalty = /avatar|icon|logo|placeholder|pixel|tracking/i.test(candidate.url) ? 10000 : 0;
  return area + quality - penalty;
}

export async function extractThumbnail(document, pageUrl, platform = '') {
  const candidates = [];
  const add = (value, source, width, height) => {
    const url = absoluteUrl(value, pageUrl);
    if (!url || candidates.some(item => item.url === url)) return;
    candidates.push({ url, source, width: width || null, height: height || null });
  };
  document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[name="twitter:image:src"]').forEach(meta => add(meta.content, meta.getAttribute('property') || meta.getAttribute('name')));
  document.querySelectorAll('video[poster], video source, video[src], link[rel="image_src"]').forEach(element => add(element.poster || element.src || element.href, 'video-element', ...Object.values(dimensions(element))));
  document.querySelectorAll('img').forEach(image => add(image.currentSrc || image.src, 'page-image', ...Object.values(dimensions(image))));
  const selected = candidates.sort((a, b) => score(b) - score(a))[0];
  if (!selected) return { url: '', width: null, height: null, format: '', quality: '', source: '', alternatives: [] };
  let width = selected.width;
  let height = selected.height;
  if (!width || !height) {
    try {
      const image = new Image();
      image.src = selected.url;
      await new Promise(resolve => { image.onload = resolve; image.onerror = resolve; });
      width ||= image.naturalWidth || null;
      height ||= image.naturalHeight || null;
    } catch { }
  }
  const area = (width || 0) * (height || 0);
  return { url: selected.url, width, height, format: selected.url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || '', quality: area >= 2073600 ? 'Full HD' : area >= 409600 ? 'HD' : 'standard', source: selected.source, alternatives: candidates.filter(item => item.url !== selected.url).map(item => item.url) };
}
