import { escapeHtml, formatDate } from './utils.js';

export function renderGallery(gallery, videos, handlers) {
  if (!videos.length) {
    gallery.innerHTML = `<div class="empty-state"><div class="empty-art"><span></span><i></i><b></b></div><h2>${handlers.hasSearch ? 'No videos found' : 'Your gallery is empty'}</h2><p>${handlers.hasSearch ? 'Try a different search or clear your filters.' : "Save videos while browsing and they'll appear here."}</p>${handlers.hasSearch ? '' : '<button class="empty-save" data-action="save">Save Current Video</button>'}</div>`;
    gallery.querySelector('[data-action="save"]')?.addEventListener('click', handlers.save);
    return;
  }
  gallery.innerHTML = videos.map(video => `<article class="video-card" data-id="${video.id}"><div class="thumbnail-wrap"><img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy"><div class="play-overlay">▶</div><button class="card-favorite ${video.favorite ? 'is-favorite' : ''}" data-action="favorite" title="${video.favorite ? 'Unfavorite' : 'Favorite'}">${video.favorite ? '♥' : '♡'}</button></div><div class="card-content"><div class="card-title">${escapeHtml(video.title)}</div><div class="card-meta"><span class="platform-dot"></span>${escapeHtml(video.platform)} <span>•</span> ${formatDate(video.savedAt)}<button class="more-button" data-action="details" aria-label="More options">•••</button></div></div></article>`).join('');
  gallery.querySelectorAll('.video-card').forEach(card => card.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const video = videos.find(item => item.id === card.dataset.id);
    if (action === 'favorite') handlers.favorite(video); else if (action === 'details') handlers.details(video); else handlers.open(video);
  }));
}