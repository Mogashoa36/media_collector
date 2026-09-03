import * as storage from './js/storage.js';
import { detectPlatform, thumbnailFor } from './js/utils.js';
import { filterVideos } from './js/search.js';
import { renderGallery } from './js/gallery.js';
import { showDetails, confirmDelete } from './js/modal.js';

const state = { videos: [], view: 'all', query: '', sort: 'newest', collection: '' };
const $ = selector => document.querySelector(selector);
const gallery = $('#gallery');
function toast(message) { const element = $('#toast'); element.textContent = `✓  ${message}`; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); }
function openVideo(video) { window.open(video.url, '_blank', 'noopener'); }
async function remove(video) { await storage.deleteVideo(video.id); await refresh(); toast('Video deleted'); }
function render() {
  const visible = filterVideos([...state.videos].filter(video => !state.collection || video.collections?.includes(state.collection)), state.query, state.view, state.sort);
  $('#video-count').textContent = state.videos.length; $('#favorite-count').textContent = state.videos.filter(video => video.favorite).length; $('#result-count').textContent = `${visible.length} ${visible.length === 1 ? 'video' : 'videos'}`; $('#view-label').textContent = state.view === 'favorites' ? 'FAVORITES' : 'YOUR LIBRARY';
  if (state.view === 'collections') return renderCollections();
  renderGallery(gallery, visible, { hasSearch: Boolean(state.query), open: openVideo, save: saveCurrentVideo, favorite: async video => { await storage.toggleFavorite(video.id); await refresh(); toast(video.favorite ? 'Removed from favorites' : 'Added to favorites'); }, details: video => showDetails(video, $('#modal-root'), { open: openVideo, favorite: async item => { await storage.toggleFavorite(item.id); await refresh(); }, confirmDelete: item => confirmDelete(item, $('#modal-root'), () => remove(item)) }) });
}
async function renderCollections() {
  const collections = await storage.getCollections();
  gallery.innerHTML = `<div class="collections-panel"><div class="collection-heading"><div><span class="eyebrow">ORGANIZE YOUR LIBRARY</span><h2>Collections</h2></div><button class="add-collection" id="add-collection" title="Create collection">＋</button></div><div class="collection-list">${collections.map(name => `<button class="collection-chip ${state.collection === name ? 'selected' : ''}" data-collection="${name}"><span>▦</span>${name}<b>${state.videos.filter(video => video.collections?.includes(name)).length}</b></button>`).join('')}</div></div>`;
  $('#add-collection').onclick = async () => { const name = window.prompt('Collection name'); if (name?.trim()) { await storage.createCollection(name.trim()); await renderCollections(); toast('Collection created'); } };
  gallery.querySelectorAll('[data-collection]').forEach(button => button.onclick = () => { state.collection = state.collection === button.dataset.collection ? '' : button.dataset.collection; state.view = 'all'; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'all')); render(); });
}
async function refresh() { state.videos = await storage.getVideos(); render(); }
async function saveCurrentVideo() {
  let tab = {};
  // Chrome Extension APIs are available in the installed popup; fallback keeps local preview usable.
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || 'https://www.youtube.com/watch?v=video-vault-demo';
  await storage.saveVideo({ title: tab.title || 'Saved video from your browser', url, thumbnail: tab.url ? thumbnailFor(url) : 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=900&q=80', platform: detectPlatform(url) });
  await refresh(); toast('Video saved to VideoVault');
}
document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => { state.view = button.dataset.view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button)); render(); });
$('#search-input').oninput = event => { state.query = event.target.value; render(); }; $('#sort-select').onchange = event => { state.sort = event.target.value; render(); }; $('#save-button').onclick = saveCurrentVideo;
$('#theme-toggle').onclick = () => { document.body.classList.toggle('light-theme'); localStorage.setItem('videovault-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); };
if (localStorage.getItem('videovault-theme') === 'light') document.body.classList.add('light-theme');
document.addEventListener('keydown', event => { if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#search-input').focus(); } if (event.key === 'Escape') $('#modal-root').innerHTML = ''; });
refresh();