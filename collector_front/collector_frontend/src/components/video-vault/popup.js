import * as storage from './js/storage.js';
import { detectPlatform, fetchVideoMetadata, formatDuration, sourceFor, thumbnailFor } from './js/utils.js';
import { filterVideos } from './js/search.js';
import { renderGallery } from './js/gallery.js';
import { showDetails, showPlayer, confirmDelete } from './js/modal.js';
import { adaptersFor, platforms } from './js/platforms/index.js';
import { recommend } from './js/personalization/recommendationEngine.js';
import { clearPersonalization, getPreferences, setPreferences } from './js/personalization/preferences.js';
import { track } from './js/personalization/tracking.js';
import { download, getDownloadOptions } from './js/downloads/downloadManager.js';

const state = { videos: [], view: 'all', query: '', sort: 'newest', collection: '', source: '', selectionMode: false };
const selectedVideos = new Set();
const selectionCountsKey = 'videovault-selection-counts';
const $ = selector => document.querySelector(selector);
const gallery = $('#gallery');
function toast(message) { const element = $('#toast'); element.textContent = `✓  ${message}`; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); }
function openVideo(video) { track('opened', video); showPlayer(video, $('#modal-root')); }
async function remove(video) { await storage.deleteVideo(video.id); await refresh(); toast('Video deleted'); }
function closeModal() { $('#modal-root').innerHTML = ''; }
function updateSelection(video, selected, card) { if (selected) { selectedVideos.add(video.id); const counts = JSON.parse(localStorage.getItem(selectionCountsKey) || '{}'); counts[video.id] = (counts[video.id] || 0) + 1; localStorage.setItem(selectionCountsKey, JSON.stringify(counts)); if (counts[video.id] >= 3 && !video.favorite) storage.updateVideo(video.id, { favorite: true }).then(() => toast('Frequently selected video added to Favorites')); } else selectedVideos.delete(video.id); card.classList.toggle('is-selected', selected); $('#selected-count').textContent = selectedVideos.size; $('#bulk-actions').hidden = selectedVideos.size === 0; }
function clearSelection() { selectedVideos.clear(); $('#bulk-actions').hidden = true; document.querySelectorAll('.card-select input').forEach(input => { input.checked = false; }); document.querySelectorAll('.video-card').forEach(card => card.classList.remove('is-selected')); }
function authenticated(hostname) { return Boolean(localStorage.getItem(`videovault-authenticated:${hostname}`)); }
function toggleSelectionMode() { state.selectionMode = !state.selectionMode; document.body.classList.toggle('selection-mode', state.selectionMode); $('#select-mode').classList.toggle('active', state.selectionMode); $('#select-mode').textContent = state.selectionMode ? 'Done' : 'Select'; if (!state.selectionMode) clearSelection(); }
function showApiStatus(status, ok = true) { const element = $('#api-status'); element.textContent = `API ${status}`; element.className = `api-status ${ok ? 'success' : 'error'} show`; clearTimeout(showApiStatus.timer); showApiStatus.timer = setTimeout(() => element.classList.remove('show'), 2400); }
async function saveVideoFromLink(url, title) {
  const normalizedUrl = url.trim();
  let parsedUrl;
  try { parsedUrl = new URL(normalizedUrl); } catch { throw new Error('Enter a valid video link.'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Only web links can be saved.');
  $('#save-progress').textContent = 'Extracting metadata...';
  const metadata = await fetchVideoMetadata(normalizedUrl);
  showApiStatus(metadata.status || 'offline', Boolean(metadata.status && metadata.status < 400));
  if (metadata.requiresLogin) await showLoginNotice(parsedUrl.hostname);
  $('#save-progress').textContent = 'Checking duplicates...';
  const candidate = { ...metadata, title: title.trim() || metadata.cleanedTitle || metadata.title || parsedUrl.hostname.replace(/^www\./, ''), url: normalizedUrl, pageUrl: normalizedUrl, canonicalUrl: metadata.canonicalUrl || normalizedUrl, platform: metadata.platform || detectPlatform(normalizedUrl), thumbnailData: metadata.thumbnail?.url ? metadata.thumbnail : { url: metadata.thumbnail || thumbnailFor(normalizedUrl), width: null, height: null, format: '', quality: 'standard', source: 'fallback', alternatives: [] }, metadata: { extractionMethod: metadata.extractionMethod || [], extractionSuccess: true } };
  const duplicate = await storage.findDuplicate(candidate);
  if (duplicate) {
    $('#save-progress').textContent = 'Video already saved';
    if (!window.confirm('Video already saved. Update its metadata?')) throw new Error('Video already saved.');
    await storage.updateVideo(duplicate.id, { ...candidate, id: duplicate.id, favorite: duplicate.favorite, collections: duplicate.collections, savedAt: duplicate.savedAt });
    await refresh(); closeModal(); toast('Video metadata updated'); return;
  }
  $('#save-progress').textContent = 'Saving video...';
  const saved = await storage.saveVideo(candidate);
  await refresh();
  closeModal();
  const size = saved.thumbnail.width && saved.thumbnail.height ? `${saved.thumbnail.width} × ${saved.thumbnail.height}` : 'unavailable';
  const length = saved.video.duration ? formatDuration(saved.video.duration) : 'unavailable';
  toast(`Video saved: ${saved.title} | Thumbnail: ${size} | Platform: ${saved.platform} | Duration: ${length}`);
}
async function showLoginNotice(hostname) {
  const source = sourceFor(`https://${hostname}`);
  const key = `videovault-login-notice:${source}`;
  if (localStorage.getItem(key)) return;
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="confirm-modal login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><span class="warning-icon">i</span><h2 id="login-title">Sign in to ${source}</h2><p>This site requires an account before its title and thumbnail can be read. Sign in on the site, then save the link again.</p><div><button class="secondary-button" data-login-dismiss>Not now</button><button class="primary-button" data-login-done>I've signed in</button></div></section></div>`;
  await new Promise(resolve => { root.querySelector('[data-login-dismiss]').onclick = () => { closeModal(); resolve(); }; root.querySelector('[data-login-done]').onclick = () => { localStorage.setItem(key, '1'); localStorage.setItem(`videovault-authenticated:${source}`, '1'); closeModal(); renderSources(); resolve(); }; });
}
async function showSaveLinkForm() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="confirm-modal save-link-modal" role="dialog" aria-modal="true" aria-labelledby="save-link-title"><button class="modal-close" data-modal-close aria-label="Close">×</button><span class="modal-kicker">ADD TO YOUR LIBRARY</span><h2 id="save-link-title">Save a video link</h2><form id="save-link-form"><label for="video-url">Video URL</label><input id="video-url" type="url" placeholder="https://youtube.com/..." required autocomplete="url"><label for="video-title">Title <span>(optional)</span></label><input id="video-title" type="text" placeholder="Use the site name if blank" maxlength="500"><p class="form-error" id="save-link-error" role="alert"></p><p class="save-progress" id="save-progress" aria-live="polite"></p><button class="primary-button" type="submit">Save video</button></form></section></div>`;
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
  const visible = filterVideos([...state.videos].filter(video => (!state.collection || video.collections?.includes(state.collection)) && (!state.source || sourceFor(video.url) === state.source)), state.query, state.view, state.sort);
  renderSources();
  $('#video-count').textContent = state.videos.length; $('#favorite-count').textContent = state.videos.filter(video => video.favorite).length; $('#result-count').textContent = `${visible.length} ${visible.length === 1 ? 'video' : 'videos'}`; $('#view-label').textContent = state.view === 'favorites' ? 'FAVORITES' : 'YOUR LIBRARY';
  if (state.view === 'browse') return renderBrowse();
  if (state.view === 'settings') return renderSettings();
  if (state.view === 'collections') return renderCollections();
  renderGallery(gallery, visible, { hasSearch: Boolean(state.query), open: openVideo, select: updateSelection, save: saveCurrentVideo, favorite: async video => { await storage.toggleFavorite(video.id); await refresh(); toast(video.favorite ? 'Removed from favorites' : 'Added to favorites'); }, details: video => showDetails(video, $('#modal-root'), { open: openVideo, favorite: async item => { await storage.toggleFavorite(item.id); await refresh(); }, confirmDelete: item => confirmDelete(item, $('#modal-root'), () => remove(item)) }) });
}
function browseCard(video) { const thumbnail = typeof video.thumbnail === 'object' ? video.thumbnail : { url: video.thumbnail }; const duration = video.video?.duration; const downloadAvailable = getDownloadOptions(video).supported; return `<article class="browse-card"><img loading="lazy" src="${thumbnail.url || ''}" alt=""><div><h3>${video.title || 'Untitled video'}</h3><p>${video.platform || 'Unknown'}${duration ? ` • ${formatDuration(duration)}` : ''}</p><button data-browse-save>+ Save</button>${downloadAvailable ? '<button data-browse-download>Download</button>' : ''}</div></article>`; }
async function renderBrowse() { const active = state.browsePlatform || ''; const videos = recommend(state.videos.filter(video => !active || video.platform === active), 12); gallery.innerHTML = `<section class="browse-dashboard"><div class="browse-title"><div><span class="eyebrow">DISCOVER</span><h2>Browse</h2></div><button id="browse-refresh" class="select-mode" type="button">↻ Refresh</button></div><div class="platform-picker">${platforms.filter(platform => platform !== 'Facebook').map(platform => `<button class="platform-option ${active === platform ? 'selected' : ''}" data-platform="${platform}">${platform}</button>`).join('')}</div><h3>For You</h3><div class="browse-grid">${videos.map(browseCard).join('') || '<p class="browse-empty">Choose a platform or save videos to build your feed.</p>'}</div><h3>Trending</h3><p class="browse-empty">Trending is unavailable without an official platform feed.</p></section>`; gallery.querySelectorAll('[data-platform]').forEach(button => button.onclick = () => { state.browsePlatform = button.dataset.platform; renderBrowse(); }); $('#browse-refresh').onclick = () => renderBrowse(); gallery.querySelectorAll('[data-browse-save]').forEach((button, index) => button.onclick = async () => { await storage.saveVideo(videos[index]); track('saved', videos[index]); toast('Saved to Gallery'); }); gallery.querySelectorAll('[data-browse-download]').forEach((button, index) => button.onclick = () => download(videos[index])); }
function renderSettings() { const preferences = getPreferences(); gallery.innerHTML = `<section class="settings-panel"><span class="eyebrow">PREFERENCES</span><h2>Personalization</h2>${[['enabled','Personalize recommendations'],['trackSaved','Track saved videos'],['trackFavorites','Track favorites'],['trackViewing','Track viewing interactions'],['cloud','Use cloud personalization']].map(([key, label]) => `<label><input type="checkbox" data-pref="${key}" ${preferences[key] ? 'checked' : ''}>${label}</label>`).join('')}<button id="clear-personalization" class="danger-button" type="button">Clear Personalization Data</button></section>`; gallery.querySelectorAll('[data-pref]').forEach(input => input.onchange = () => setPreferences({ [input.dataset.pref]: input.checked })); $('#clear-personalization').onclick = () => { if (window.confirm('Reset your recommendations?')) { clearPersonalization(); toast('Personalization data cleared'); } }; }
function renderSources() {
  const counts = new Map();
  state.videos.forEach(video => { const source = sourceFor(video.url); counts.set(source, (counts.get(source) || 0) + 1); });
  $('#source-list').innerHTML = [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([source, count]) => `<button class="source-bookmark ${state.source === source ? 'selected' : ''}" data-source="${source}">${source}${authenticated(source) ? '<span class="auth-tick" title="Signed in">✓</span>' : ''}<b>${count}</b></button>`).join('');
  $('#clear-source').hidden = !state.source;
  $('#source-list').querySelectorAll('[data-source]').forEach(button => button.onclick = () => { state.source = state.source === button.dataset.source ? '' : button.dataset.source; render(); });
  $('#clear-source').onclick = () => { state.source = ''; render(); };
}
async function moveSelected() {
  const collections = await storage.getCollections();
  const target = window.prompt(`Move ${selectedVideos.size} video(s) to which folder?\nAvailable: ${collections.join(', ')}`);
  if (!target?.trim()) return;
  const folder = target.trim();
  if (!collections.includes(folder)) await storage.createCollection(folder);
  await Promise.all([...selectedVideos].map(id => storage.updateVideo(id, { collections: [folder] })));
  clearSelection(); await refresh(); toast('Videos moved');
}
async function shareSelected() {
  const videos = state.videos.filter(video => selectedVideos.has(video.id));
  const text = videos.map(video => `${video.title}\n${video.url}`).join('\n\n');
  try { if (navigator.share) await navigator.share({ title: 'Shared videos', text }); else await navigator.clipboard.writeText(text); toast(navigator.share ? 'Share sheet opened' : 'Video links copied'); } catch (error) { if (error.name !== 'AbortError') toast('Sharing is unavailable'); }
}
async function deleteSelected() {
  if (!window.confirm(`Delete ${selectedVideos.size} selected video(s)?`)) return;
  await Promise.all([...selectedVideos].map(id => storage.deleteVideo(id)));
  clearSelection(); await refresh(); toast('Videos deleted');
}
async function favoriteSelected() {
  await Promise.all([...selectedVideos].map(id => storage.updateVideo(id, { favorite: true })));
  clearSelection(); await refresh(); toast('Videos added to Favorites');
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
$('#select-mode').onclick = toggleSelectionMode; $('#clear-selection').onclick = clearSelection; $('#bulk-move').onclick = moveSelected; $('#bulk-favorite').onclick = favoriteSelected; $('#bulk-share').onclick = shareSelected; $('#bulk-delete').onclick = deleteSelected;
$('#theme-toggle').onclick = () => { document.body.classList.toggle('light-theme'); localStorage.setItem('videovault-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); };
if (localStorage.getItem('videovault-theme') === 'light') document.body.classList.add('light-theme');
document.addEventListener('keydown', event => { if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#search-input').focus(); } if (event.key === 'Escape') $('#modal-root').innerHTML = ''; });
refresh();