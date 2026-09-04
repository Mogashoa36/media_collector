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
function closeModal() { $('#modal-root').innerHTML = ''; }
async function saveVideoFromLink(url, title) {
  const normalizedUrl = url.trim();
  let parsedUrl;
  try { parsedUrl = new URL(normalizedUrl); } catch { throw new Error('Enter a valid video link.'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Only web links can be saved.');
  await storage.saveVideo({ title: title.trim() || parsedUrl.hostname.replace(/^www\./, ''), url: normalizedUrl, thumbnail: thumbnailFor(normalizedUrl), platform: detectPlatform(normalizedUrl) });
  await refresh();
  closeModal();
  toast('Video saved to VideoVault');
}
async function showSaveLinkForm() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="confirm-modal save-link-modal" role="dialog" aria-modal="true" aria-labelledby="save-link-title"><button class="modal-close" data-modal-close aria-label="Close">×</button><span class="modal-kicker">ADD TO YOUR LIBRARY</span><h2 id="save-link-title">Save a video link</h2><form id="save-link-form"><label for="video-url">Video URL</label><input id="video-url" type="url" placeholder="https://youtube.com/..." required autocomplete="url"><label for="video-title">Title <span>(optional)</span></label><input id="video-title" type="text" placeholder="Use the site name if blank" maxlength="500"><p class="form-error" id="save-link-error" role="alert"></p><button class="primary-button" type="submit">Save video</button></form></section></div>`;
  root.querySelector('[data-modal-close]').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = event => { if (event.target.classList.contains('modal-backdrop')) closeModal(); };
  const urlInput = $('#video-url');
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) { urlInput.value = tab.url; $('#video-title').value = tab.title || ''; }
  }
  urlInput.focus();
  root.querySelector('#save-link-form').onsubmit = async event => {
    event.preventDefault();
    const error = $('#save-link-error');
    error.textContent = '';
    try { await saveVideoFromLink(urlInput.value, $('#video-title').value); } catch (reason) { error.textContent = reason.message; }
  };
}
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
  await showSaveLinkForm();
}
document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => { state.view = button.dataset.view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button)); render(); });
$('#search-input').oninput = event => { state.query = event.target.value; render(); }; $('#sort-select').onchange = event => { state.sort = event.target.value; render(); }; $('#save-button').onclick = saveCurrentVideo;
$('#theme-toggle').onclick = () => { document.body.classList.toggle('light-theme'); localStorage.setItem('videovault-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); };
if (localStorage.getItem('videovault-theme') === 'light') document.body.classList.add('light-theme');
document.addEventListener('keydown', event => { if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#search-input').focus(); } if (event.key === 'Escape') $('#modal-root').innerHTML = ''; });
refresh();