import { escapeHtml, formatDate, formatDuration, placeholderThumbnail } from './utils.js';

function thumbnailUrl(video) { return typeof video.thumbnail === 'object' ? video.thumbnail.url : video.thumbnail; }

const DIRECT_EXTENSION = /\.(mp4|m4v|mov|mkv|webm|ogg|ogv|m3u8|mpd)(?:$|[?#])/i;
const UNEMBEDDABLE = /^(.*\.)?(facebook\.com|fb\.watch|instagram\.com|x\.com|twitter\.com|reddit\.com|threads\.net)$/i;

function directMedia(video) {
  const candidates = [video.video?.contentUrl, video.contentUrl, video.downloadUrl, video.url].filter(Boolean);
  for (const candidate of candidates) {
    try { if (DIRECT_EXTENSION.test(new URL(candidate).pathname)) return candidate; } catch { }
  }
  return '';
}

function youtubeEmbed(url) {
  const parsed = new URL(url);
  if (parsed.hostname === 'youtu.be') return `https://www.youtube.com/embed/${encodeURIComponent(parsed.pathname.slice(1).split('/')[0])}?autoplay=1`;
  const videoId = parsed.searchParams.get('v');
  if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
  if (parsed.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${encodeURIComponent(parsed.pathname.split('/')[2] || '')}?autoplay=1`;
  return '';
}

export function playerSource(video) {
  const media = directMedia(video);
  if (media) return { type: 'video', src: media, external: video.url || '' };
  const url = video.url || '';
  let parsed;
  try { parsed = new URL(url); } catch { return { type: 'link', src: '', external: url }; }
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith('youtube.com') || host === 'youtu.be') return { type: 'iframe', src: youtubeEmbed(url), external: url };
  if (host.endsWith('vimeo.com')) {
    const videoId = parsed.pathname.split('/').filter(Boolean).pop();
    if (videoId) return { type: 'iframe', src: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?autoplay=1`, external: url };
  }
  if (host.endsWith('tiktok.com')) {
    const videoId = parsed.pathname.split('/').filter(Boolean).pop();
    if (videoId) return { type: 'iframe', src: `https://www.tiktok.com/embed/v2/${encodeURIComponent(videoId)}`, external: url };
  }
  if (host.endsWith('dailymotion.com')) {
    const videoId = parsed.pathname.split('/').filter(Boolean).pop();
    if (videoId) return { type: 'iframe', src: `https://www.dailymotion.com/embed/video/${encodeURIComponent(videoId)}?autoplay=1`, external: url };
  }
  if (UNEMBEDDABLE.test(host)) return { type: 'link', src: '', external: url };
  return { type: 'iframe', src: url, external: url };
}

export function showPlayer(video, root) {
  let source;
  try { source = playerSource(video); } catch { source = { type: 'link', src: '', external: video.url || '' }; }
  const open = source.external ? `<a class="player-open" href="${escapeHtml(source.external)}" target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>` : '';
  const player = source.type === 'link'
    ? `<div class="video-unavailable"><strong>Playback unavailable inline</strong><span>${escapeHtml(source.external || video.platform || 'This platform')} blocks embedding, so VideoVault can't play it in the popup. Open it in a new tab to watch it.</span>${open}</div>`
    : source.type === 'video'
    ? `<video class="video-player" src="${escapeHtml(source.src)}" controls autoplay playsinline>Your browser cannot play this video.</video>${open}`
    : `<iframe class="video-player" src="${escapeHtml(source.src)}" title="${escapeHtml(video.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>${open}`;
  root.innerHTML = `<div class="modal-backdrop player-backdrop"><section class="player-modal" role="dialog" aria-modal="true" aria-label="Playing ${escapeHtml(video.title)}"><button class="modal-close" data-modal-close aria-label="Close">×</button>${player}<div class="player-caption"><span class="modal-kicker">NOW PLAYING / ${escapeHtml(video.platform)}${video.video?.duration ? ` / ${formatDuration(video.video.duration)}` : ''}</span><h2>${escapeHtml(video.title)}</h2></div></section></div>`;
  root.querySelector('[data-modal-close]').onclick = () => root.innerHTML = '';
  root.querySelector('.modal-backdrop').onclick = event => { if (event.target.classList.contains('modal-backdrop')) root.innerHTML = ''; };
}

export function showDetails(video, root, handlers) {
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Video details"><button class="modal-close" data-modal-close aria-label="Close">×</button><img class="modal-image" src="${escapeHtml(thumbnailUrl(video) || placeholderThumbnail())}" alt=""><div class="modal-body"><span class="modal-kicker">${escapeHtml(video.platform)} / SAVED VIDEO</span><h2>${escapeHtml(video.title)}</h2><dl><div><dt>URL</dt><dd>${escapeHtml(video.url)}</dd></div><div><dt>Saved</dt><dd>${formatDate(video.savedAt)}</dd></div></dl><div class="modal-actions"><button class="secondary-button" data-modal-favorite>${video.favorite ? '♥ Favorited' : '♡ Favorite'}</button><button class="primary-button" data-modal-open>Play video</button></div><button class="delete-button" data-modal-delete>Delete video</button></div></section></div>`;
  root.querySelector('[data-modal-close]').onclick = () => root.innerHTML = '';
  root.querySelector('.modal-backdrop').onclick = event => { if (event.target.classList.contains('modal-backdrop')) root.innerHTML = ''; };
  root.querySelector('[data-modal-open]').onclick = () => handlers.open(video);
  root.querySelector('[data-modal-favorite]').onclick = () => { handlers.favorite(video); root.innerHTML = ''; };
  root.querySelector('[data-modal-delete]').onclick = () => handlers.confirmDelete(video);
}

export function confirmDelete(video, root, onConfirm) {
  root.innerHTML = `<div class="modal-backdrop"><section class="confirm-modal" role="alertdialog"><span class="warning-icon">!</span><h2>Delete this video?</h2><p>This will remove “${escapeHtml(video.title)}” from your gallery.</p><div><button class="secondary-button" data-cancel>Cancel</button><button class="danger-button" data-confirm>Delete</button></div></section></div>`;
  root.querySelector('[data-cancel]').onclick = () => root.innerHTML = '';
  root.querySelector('[data-confirm]').onclick = () => { root.innerHTML = ''; onConfirm(); };
}