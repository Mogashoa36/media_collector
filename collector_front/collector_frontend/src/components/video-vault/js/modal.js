import { escapeHtml, formatDate, formatDuration } from './utils.js';

function playerSource(url) {
  const parsed = new URL(url);
  if (parsed.hostname === 'youtu.be') return { type: 'iframe', src: `https://www.youtube.com/embed/${encodeURIComponent(parsed.pathname.slice(1))}?autoplay=1` };
  if (parsed.hostname.endsWith('youtube.com')) {
    const videoId = parsed.searchParams.get('v');
    if (videoId) return { type: 'iframe', src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1` };
  }
  if (parsed.hostname.endsWith('vimeo.com')) {
    const videoId = parsed.pathname.split('/').filter(Boolean).pop();
    if (videoId) return { type: 'iframe', src: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?autoplay=1` };
  }
  if (/\.(mp4|webm|ogg)(?:$|[?#])/i.test(parsed.pathname)) return { type: 'video', src: parsed.href };
  return { type: 'iframe', src: parsed.href };
}

export function showPlayer(video, root) {
  let source;
  try { source = playerSource(video.url); } catch { source = { type: 'iframe', src: 'about:blank' }; }
  const player = source.type === 'video'
    ? `<video class="video-player" src="${escapeHtml(source.src)}" controls autoplay playsinline>Your browser cannot play this video.</video>`
    : `<iframe class="video-player" src="${escapeHtml(source.src)}" title="${escapeHtml(video.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  root.innerHTML = `<div class="modal-backdrop player-backdrop"><section class="player-modal" role="dialog" aria-modal="true" aria-label="Playing ${escapeHtml(video.title)}"><button class="modal-close" data-modal-close aria-label="Close">×</button>${player}<div class="player-caption"><span class="modal-kicker">NOW PLAYING / ${escapeHtml(video.platform)}${video.video?.duration ? ` / ${formatDuration(video.video.duration)}` : ''}</span><h2>${escapeHtml(video.title)}</h2></div></section></div>`;
  root.querySelector('[data-modal-close]').onclick = () => root.innerHTML = '';
  root.querySelector('.modal-backdrop').onclick = event => { if (event.target.classList.contains('modal-backdrop')) root.innerHTML = ''; };
}

export function showDetails(video, root, handlers) {
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Video details"><button class="modal-close" data-modal-close aria-label="Close">×</button><img class="modal-image" src="${escapeHtml(video.thumbnail)}" alt=""><div class="modal-body"><span class="modal-kicker">${escapeHtml(video.platform)} / SAVED VIDEO</span><h2>${escapeHtml(video.title)}</h2><dl><div><dt>URL</dt><dd>${escapeHtml(video.url)}</dd></div><div><dt>Saved</dt><dd>${formatDate(video.savedAt)}</dd></div></dl><div class="modal-actions"><button class="secondary-button" data-modal-favorite>${video.favorite ? '♥ Favorited' : '♡ Favorite'}</button><button class="primary-button" data-modal-open>Play video</button></div><button class="delete-button" data-modal-delete>Delete video</button></div></section></div>`;
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