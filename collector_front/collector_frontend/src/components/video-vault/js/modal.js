import { escapeHtml, formatDate } from './utils.js';

export function showDetails(video, root, handlers) {
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Video details"><button class="modal-close" data-modal-close aria-label="Close">×</button><img class="modal-image" src="${escapeHtml(video.thumbnail)}" alt=""><div class="modal-body"><span class="modal-kicker">${escapeHtml(video.platform)} / SAVED VIDEO</span><h2>${escapeHtml(video.title)}</h2><dl><div><dt>URL</dt><dd>${escapeHtml(video.url)}</dd></div><div><dt>Saved</dt><dd>${formatDate(video.savedAt)}</dd></div></dl><div class="modal-actions"><button class="secondary-button" data-modal-favorite>${video.favorite ? '♥ Favorited' : '♡ Favorite'}</button><button class="primary-button" data-modal-open>Open Video ↗</button></div><button class="delete-button" data-modal-delete>Delete video</button></div></section></div>`;
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