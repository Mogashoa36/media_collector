import * as storage from './js/storage.js';
import { detectPlatform, fetchVideoMetadata, formatDuration, sourceFor, thumbnailFor } from './js/utils.js';
import { filterVideos } from './js/search.js';
import { renderGallery } from './js/gallery.js';
import { showDetails, showPlayer, confirmDelete } from './js/modal.js';
import { adaptersFor, platforms } from './js/platforms/index.js';
import { buildSections } from './js/personalization/recommendationEngine.js';
import { dismissRecommendation, getFeedback } from './js/personalization/feedback.js';
import { clearPersonalization, getPreferences, setPreferences, resetPersonalization } from './js/personalization/preferences.js';
import { track, recordSelection, events, readCountsAsync as readSelCounts } from './js/personalization/tracking.js';
import { download, getDownloadOptions, fetchSaveFromMetadata, saveFromPageUrl, openOriginal } from './js/downloads/downloadManager.js';
import { showAuthRequired, privateContentHtml, unavailableHtml } from './js/downloads/authUi.js';
import { createNativeYtDlpBridge, setYtDlpBridge } from './js/downloads/downloadManager.js';

const state = { videos: [], view: 'all', query: '', sort: 'newest', collection: '', source: '', selectionMode: false };
const selectedVideos = new Set();
const $ = selector => document.querySelector(selector);
const gallery = $('#gallery');
function toast(message) { const element = $('#toast'); element.textContent = `✓  ${message}`; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); }
function openVideo(video) { track('opened', video); showPlayer(video, $('#modal-root'), { download: doDownload }); }
async function doDownload(video) {
  const result = await download(video);
  if (result.status === 'downloaded') toast(`Download started (${result.provider || 'direct'})`);
  else if (result.status === 'already-downloading') toast('This download is already in progress');
  else if (result.status === 'savefrom') toast('SaveFrom opened — pick a format to download');
  else if (result.status === 'ytdlp') showDownloadPicker(video, result.options || []);
  else if (result.status === 'auth-required') showDownloadAuth(video, result);
  else if (result.status === 'private') showDownloadPrivate(video, result);
  else showDownloadUnavailable(video, result);
}
function downloadDialogShell(title, body) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="modal download-modal" role="dialog" aria-modal="true"><button class="modal-close" data-modal-close aria-label="Close">×</button><div class="modal-body"><span class="modal-kicker">${title}</span><div data-download-body>${body}</div></div></section></div>`;
  root.querySelector('[data-modal-close]').onclick = () => root.innerHTML = '';
  root.querySelector('.modal-backdrop').onclick = event => { if (event.target.classList.contains('modal-backdrop')) root.innerHTML = ''; };
  return root.querySelector('[data-download-body]');
}
async function showDownloadPicker(video, options) {
  const rows = options.map((option, index) => `<label><input type="radio" name="dl" value="${index}" ${index === 0 ? 'checked' : ''}>${option.quality || option.format || 'media'} — ${option.fileType || option.format || ''} (${option.provider})</label>`).join('');
  const body = downloadDialogShell(`DOWNLOAD / ${(video.platform || '').toUpperCase()}`, `<h2>${(video.title || 'Choose a format')}</h2><div class="download-options">${rows || '<p>No formats found.</p>'}</div><p class="download-state" data-download-state>Detecting media…</p><div class="modal-actions"><button class="secondary-button" data-download-original>Open Original</button><button class="primary-button" data-download-start>Download</button></div>`);
  body.querySelector('[data-download-original]').onclick = () => openOriginal(video);
  body.querySelector('[data-download-start]').onclick = async () => {
    const picked = options[Number(body.querySelector('input[name="dl"]:checked')?.value || 0)] || options[0];
    if (!picked) return;
    const state = body.querySelector('[data-download-state]');
    if (picked.url && /^https?:/i.test(picked.url)) {
      state.textContent = 'Preparing download…';
      const link = document.createElement('a'); link.href = picked.url; link.download = ''; link.rel = 'noopener'; link.click();
      state.textContent = 'Download complete — check your downloads folder.';
      toast('Download started');
    } else {
      state.textContent = 'Preparing download… install the optional local yt-dlp helper to fetch this format (see docs/YTDlpSetup.md).';
    }
  };
}
function showDownloadAuth(video, result) {
  const pageUrl = result.pageUrl || video.url || video.canonicalUrl || '';
  const body = downloadDialogShell('DOWNLOAD / LOGIN', `<h2>${(video.title || 'Download')}</h2><div data-auth-slot></div><div class="modal-actions"><button class="secondary-button" data-download-original>Open Original</button></div>`);
  body.querySelector('[data-download-original]').onclick = () => openOriginal(video);
  showAuthRequired(body.querySelector('[data-auth-slot]'), { platform: video.platform, pageUrl, detail: result.error?.detail || '', onRetry: async () => { const retry = await download(video); if (retry.status === 'downloaded') { toast('Download started'); document.querySelector('#modal-root').innerHTML = ''; } else if (retry.status === 'auth-required') { showDownloadAuth(video, retry); } else if (retry.status === 'already-downloading') { toast('This download is already in progress'); } else { toast(retry.error?.message || 'Still unavailable — try Open Site & Login'); } } });
}
function showDownloadPrivate(video, result) {
  const body = downloadDialogShell('DOWNLOAD / RESTRICTED', `<h2>${(video.title || 'Download')}</h2>${privateContentHtml({ platform: video.platform })}<div class="modal-actions"><button class="secondary-button" data-download-original>Open Original</button></div>`);
  body.querySelector('[data-download-original]').onclick = () => openOriginal(video);
}
function showDownloadUnavailable(video, result) {
  const message = result?.error?.message || '';
  const body = downloadDialogShell('DOWNLOAD', `<h2>${(video.title || 'Download')}</h2>${unavailableHtml({ message })}<div class="modal-actions"><button class="secondary-button" data-download-original>Open Original</button></div>`);
  body.querySelector('[data-download-original]').onclick = () => openOriginal(video);
}
async function remove(video) { await storage.deleteVideo(video.id); await refresh(); toast('Video deleted'); }
function closeModal() { $('#modal-root').innerHTML = ''; }
function updateSelection(video, selected, card) { selectedVideos[selected ? 'add' : 'delete'](video.id); card.classList.toggle('is-selected', selected); $('#selected-count').textContent = selectedVideos.size; $('#bulk-actions').hidden = selectedVideos.size === 0; }
// Frequent-selection signal: the count itself is written by recordSelection
// (single writer, no race with updateSelection). Every 3rd selection nudges
// the video into Favorites as implicit positive feedback.
function maybeAutoFavorite(video, selected) {
  if (!selected) return;
  readSelCounts().then((counts) => {
    if ((Number(counts[video.id]) || 0) >= 3 && !video.favorite) {
      storage.updateVideo(video.id, { favorite: true }).then(() => toast('Frequently selected video added to Favorites')).catch(() => { });
    }
  }).catch(() => { });
}
function clearSelection() { selectedVideos.clear(); $('#bulk-actions').hidden = true; document.querySelectorAll('.card-select input').forEach(input => { input.checked = false; }); document.querySelectorAll('.video-card').forEach(card => card.classList.remove('is-selected')); }
function authenticated(hostname) { return Boolean(localStorage.getItem(`videovault-authenticated:${hostname}`)); }
function toggleSelectionMode() { state.selectionMode = !state.selectionMode; document.body.classList.toggle('selection-mode', state.selectionMode); $('#select-mode').classList.toggle('active', state.selectionMode); $('#select-mode').textContent = state.selectionMode ? 'Done' : 'Select'; if (!state.selectionMode) clearSelection(); }
function showApiStatus(status, ok = true) { const element = $('#api-status'); element.textContent = `API ${status}`; element.className = `api-status ${ok ? 'success' : 'error'} show`; clearTimeout(showApiStatus.timer); showApiStatus.timer = setTimeout(() => element.classList.remove('show'), 2400); }
async function saveVideoFromLink(url, title, tabMetadata = null) {
  const normalizedUrl = url.trim();
  let parsedUrl;
  try { parsedUrl = new URL(normalizedUrl); } catch { throw new Error('Enter a valid video link.'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Only web links can be saved.');
  $('#save-progress').textContent = 'Extracting metadata...';
  const fetched = await fetchVideoMetadata(normalizedUrl);
  const metadata = { ...fetched, ...(tabMetadata || {}) };
  if (tabMetadata?.thumbnail?.url) metadata.thumbnail = tabMetadata.thumbnail;
  if (tabMetadata?.video) { const tabVideo = tabMetadata.video; metadata.video = { ...(fetched?.video || {}), duration: tabVideo.duration ?? fetched?.video?.duration, width: tabVideo.width ?? fetched?.video?.width, height: tabVideo.height ?? fetched?.video?.height, aspectRatio: tabVideo.aspectRatio ?? fetched?.video?.aspectRatio }; }
  if (tabMetadata?.contentUrl) metadata.contentUrl = tabMetadata.contentUrl;
  if (tabMetadata?.canonicalUrl) metadata.canonicalUrl = tabMetadata.canonicalUrl;
  showApiStatus(metadata.status || 'live', Boolean((metadata.status || 200) < 400));
  if (metadata.requiresLogin && !tabMetadata?.title) await showLoginNotice(parsedUrl.hostname, normalizedUrl);
  // SaveFrom rescue: when the native pipeline came up empty (app-shell pages,
  // login walls, missing thumbnails), ask SaveFrom for the title/thumbnail/direct URL.
  if (metadata.unavailable || (!metadata.title && !metadata.thumbnail?.url)) {
    $('#save-progress').textContent = 'Trying SaveFrom…';
    const saveFrom = await fetchSaveFromMetadata(normalizedUrl);
    if (saveFrom.ok) {
      metadata.title = metadata.title || saveFrom.title;
      metadata.contentUrl = metadata.contentUrl || saveFrom.url;
      metadata.downloadUrl = saveFrom.url;
      metadata.video = { ...(metadata.video || {}), duration: metadata.video?.duration || saveFrom.duration };
      if (saveFrom.thumbnail) metadata.thumbnail = { ...(metadata.thumbnail || {}), url: saveFrom.thumbnail, source: metadata.thumbnail?.source || 'savefrom' };
      $('#save-progress').textContent = 'Metadata restored via SaveFrom';
    }
  }
  $('#save-progress').textContent = 'Checking duplicates...';
  const candidate = { ...metadata, title: title.trim() || metadata.cleanedTitle || metadata.title || parsedUrl.hostname.replace(/^www\./, ''), url: normalizedUrl, pageUrl: normalizedUrl, contentUrl: metadata.contentUrl || '', canonicalUrl: metadata.canonicalUrl || normalizedUrl, platform: metadata.platform || detectPlatform(normalizedUrl), thumbnailData: metadata.thumbnail?.url ? metadata.thumbnail : { url: metadata.thumbnail || thumbnailFor(normalizedUrl), width: null, height: null, format: '', quality: 'standard', source: 'fallback', alternatives: [] }, metadata: { extractionMethod: metadata.extractionMethod || [], extractionSuccess: true } };
  const duplicate = await storage.findDuplicate(candidate);
  if (duplicate) {
    $('#save-progress').textContent = 'Video already saved';
    if (!window.confirm('Video already saved. Update its metadata?')) throw new Error('Video already saved.');
    await storage.updateVideo(duplicate.id, { ...candidate, id: duplicate.id, favorite: duplicate.favorite, collections: duplicate.collections, savedAt: duplicate.savedAt });
    await refresh(); closeModal(); toast('Video metadata updated'); return;
  }
  $('#save-progress').textContent = 'Saving video...';
  const saved = await storage.saveVideo(candidate);
  track('saved', saved);
  await refresh();
  closeModal();
  const size = saved.thumbnail.width && saved.thumbnail.height ? `${saved.thumbnail.width} × ${saved.thumbnail.height}` : 'unavailable';
  const length = saved.video.duration ? formatDuration(saved.video.duration) : 'unavailable';
  toast(`Video saved: ${saved.title} | Thumbnail: ${size} | Platform: ${saved.platform} | Duration: ${length}`);
}
async function showLoginNotice(hostname, videoUrl = '') {
  const source = sourceFor(`https://${hostname}`);
  const key = `videovault-login-notice:${source}`;
  if (localStorage.getItem(key)) return;
  const root = $('#modal-root');
  const saveFrom = videoUrl ? `<a class="player-open" href="${saveFromPageUrl(videoUrl)}" target="_blank" rel="noopener noreferrer">Try SaveFrom ↗</a>` : '';
  root.innerHTML = `<div class="modal-backdrop"><section class="confirm-modal login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><span class="warning-icon">i</span><h2 id="login-title">Sign in to ${source}</h2><p>This site requires an account before its title and thumbnail can be read. Sign in on the site and save again — or open the video in SaveFrom.</p><div>${saveFrom}<button class="secondary-button" data-login-dismiss>Not now</button><button class="primary-button" data-login-done>I've signed in</button></div></section></div>`;
  await new Promise(resolve => { root.querySelector('[data-login-dismiss]').onclick = () => { closeModal(); resolve(); }; root.querySelector('[data-login-done]').onclick = () => { localStorage.setItem(key, '1'); localStorage.setItem(`videovault-authenticated:${source}`, '1'); closeModal(); renderSources(); resolve(); }; });
}
async function showSaveLinkForm(tabMetadata = null) {
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
    try { await saveVideoFromLink(urlInput.value, $('#video-title').value, tabMetadata); } catch (reason) { error.textContent = reason.message; }
  };
}
function render() {
  const visible = filterVideos([...state.videos].filter(video => (!state.collection || video.collections?.includes(state.collection)) && (!state.source || sourceFor(video.url) === state.source)), state.query, state.view, state.sort);
  renderSources();
  $('#video-count').textContent = state.videos.length; $('#favorite-count').textContent = state.videos.filter(video => video.favorite).length; $('#result-count').textContent = `${visible.length} ${visible.length === 1 ? 'video' : 'videos'}`; $('#view-label').textContent = state.view === 'favorites' ? 'FAVORITES' : 'YOUR LIBRARY';
  if (state.view === 'browse') return renderBrowse();
  if (state.view === 'settings') return renderSettings();
  if (state.view === 'collections') return renderCollections();
  renderGallery(gallery, visible, { hasSearch: Boolean(state.query), open: openVideo, select: (video, checked, card) => { recordSelection(video); maybeAutoFavorite(video, checked); updateSelection(video, checked, card); }, save: saveCurrentVideo, canDownload: video => getDownloadOptions(video).supported, download: doDownload, favorite: async video => { if (!video.favorite) track('favorite', video); await storage.toggleFavorite(video.id); await refresh(); toast(video.favorite ? 'Removed from favorites' : 'Added to favorites'); }, details: video => openDetails(video), favorite: async item => { await storage.toggleFavorite(item.id); await refresh(); }, confirmDelete: item => confirmDelete(item, $('#modal-root'), () => remove(item)) }) });
}
async function openDetails(video) {
  const prefs = getPreferences();
  const feedback = await getFeedback().catch(() => ({ dismissed: {}, liked: {} }));
  const counts = await readSelCounts().catch(() => ({}));
  const built = buildSections({ videos: state.videos, events: events(), selectionCounts: counts, feedback,
    preferences: { recommendationsEnabled: true, personalizationEnabled: prefs.enabled !== false, trendingEnabled: true },
    seedVideo: video, limits: { similar: 3 } });
  const sec = built.sections;
  // Display-level dedupe across the modal's recommendation groups.
  const seen = new Set();
  const dedupe = (list) => list.filter((i) => { const v = i.video || {}; const k = v.canonicalUrl || v.url || v.id; if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const recGroups = [
    { title: 'SIMILAR VIDEOS', items: dedupe(sec.similar.items) },
    { title: 'FROM YOUR FAVORITES', items: dedupe(sec.fromFavorites.items) },
    { title: 'SIMILAR TO YOUR COLLECTIONS', items: dedupe(sec.fromCollections.items) }
  ].filter((g) => g.items.length);
  showDetails(video, $('#modal-root'), { open: openVideo, download: doDownload,
    dismiss: async (item) => { await dismissRecommendation(item.id || item.url, 'not-interested'); toast('Got it — fewer picks like this'); },
    similar: sec.similar.items,
    recGroups,
    openSimilar: (id) => { const target = state.videos.find(item => item.id === id); if (target) openDetails(target); },
    favorite: async item => { if (!item.favorite) track('favorite', item); await storage.toggleFavorite(item.id); await refresh(); }, confirmDelete: item => confirmDelete(item, $('#modal-root'), () => remove(item)) });
}
function browseCard(video) { const thumbnail = typeof video.thumbnail === 'object' ? video.thumbnail : { url: video.thumbnail }; const duration = video.video?.duration; const downloadAvailable = getDownloadOptions(video).supported; return `<article class="browse-card"><img loading="lazy" src="${thumbnail.url || ''}" alt=""><div><h3>${video.title || 'Untitled video'}</h3><p>${video.platform || 'Unknown'}${duration ? ` • ${formatDuration(duration)}` : ''}</p><button data-browse-save>+ Save</button><button data-browse-dismiss title="Not interested">✕</button>${downloadAvailable ? '<button data-browse-download>Download</button>' : ''}</div></article>`; }
let browseCache = { key: '', built: null };
async function browseSections(videos) {
  const prefs = getPreferences();
  const feedback = await getFeedback().catch(() => ({ dismissed: {}, liked: {} }));
  const counts = await readSelCounts().catch(() => ({}));
  const built = buildSections({ videos, events: events(), selectionCounts: counts, feedback,
    preferences: { recommendationsEnabled: prefs.recommendationsEnabled !== false, personalizationEnabled: prefs.enabled !== false, trendingEnabled: prefs.trendingEnabled !== false, platforms: prefs.platforms || {} } });
  const sec = built.sections;
  const items = (key) => sec[key].items.map(i => i.video);
  // Display-level dedupe across recommendation sections (Recently Visited is
  // history, not a recommendation, so it may overlap). Precedence follows the
  // page order of recommendation slots.
  const seen = new Set();
  const dedupe = (list) => list.filter((v) => { const k = v.canonicalUrl || v.url || v.id; if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const forYou = dedupe(items('forYou'));
  const recommended = dedupe(items('recommended'));
  const similar = dedupe(items('similar'));
  const fromFavorites = dedupe(items('fromFavorites'));
  const fromCollections = dedupe(items('fromCollections'));
  return { built, recent: items('recentlyVisited'), forYou, recommended, similar, fromFavorites, fromCollections,
    trendingState: sec.trending.state, platformFeed: built.platformFeed };
}
// Guards against overlapping Browse renders (rapid Refresh / platform picks):
// each render gets a token; a slower older render discards itself instead of
// clobbering the newer one.
let browseRenderToken = 0;
async function renderBrowseInner() {
  const token = ++browseRenderToken;
  const active = state.browsePlatform || ''; const pool = state.videos.filter(video => !active || video.platform === active); const sections = await browseSections(pool);
  if (token !== browseRenderToken) return;
  const videos = sections.forYou; gallery.innerHTML = `<section class="browse-dashboard"><div class="browse-title"><div><span class="eyebrow">DISCOVER</span><h2>Browse</h2></div><button id="browse-refresh" class="select-mode" type="button">↻ Refresh</button></div><p class="browse-note">Choose a source or discover the public page in your active tab.</p><div class="platform-picker">${[...platforms.filter(platform => platform !== 'Facebook'), 'Other websites'].map(platform => `<button class="platform-option ${active === platform ? 'selected' : ''}" data-platform="${platform}">${platform}</button>`).join('')}</div><button id="discover-active" class="primary-button" type="button">Discover active tab</button><div data-browse-auth></div><h3>Recently Visited</h3><div class="browse-grid">${sections.recent.map(browseCard).join('') || '<p class="browse-empty">Nothing visited yet.</p>'}</div><h3>For You</h3><div class="browse-grid">${videos.map(browseCard).join('') || '<p class="browse-empty">No recommendations yet — save some videos to build your feed.</p>'}</div><h3>Recommended</h3><div class="browse-grid">${sections.recommended.map(browseCard).join('') || '<p class="browse-empty">No recommendations yet.</p>'}</div><h3>Similar Videos</h3><div class="browse-grid">${sections.similar.map(browseCard).join('') || '<p class="browse-empty">Open a saved video to see similar picks.</p>'}</div><h3>From Your Favorites</h3><div class="browse-grid">${sections.fromFavorites.map(browseCard).join('') || '<p class="browse-empty">Favorite some videos to power this section.</p>'}</div><h3>Similar to Your Collections</h3><div class="browse-grid">${sections.fromCollections.map(browseCard).join('') || '<p class="browse-empty">Add videos to a collection to see related picks.</p>'}</div><h3>Trending</h3>${sections.trendingState === 'disabled' ? '<p class="browse-empty">Trending is turned off in Settings.</p>' : sections.trendingState === 'auth-required' ? '<div data-trending-auth></div>' : '<p class="browse-empty">Trending is unavailable without an official platform feed.</p>'}</section>`; gallery.querySelectorAll('[data-platform]').forEach(button => button.onclick = () => { state.browsePlatform = button.dataset.platform === 'Other websites' ? 'Other' : button.dataset.platform; renderBrowse(); }); $('#browse-refresh').onclick = () => renderBrowse();
  const trendingSlot = gallery.querySelector('[data-trending-auth]');
  if (trendingSlot) showAuthRequired(trendingSlot, { platform: active || 'platform', pageUrl: '', onRetry: async () => renderBrowse() }); $('#discover-active').onclick = discoverActiveTab; gallery.querySelectorAll('[data-browse-save]').forEach((button, index) => button.onclick = async () => { const duplicate = await storage.findDuplicate(videos[index]); if (duplicate) return toast('Already in Gallery'); await storage.saveVideo(videos[index]); track('saved', videos[index]); toast('Saved to Gallery'); }); gallery.querySelectorAll('[data-browse-download]').forEach((button, index) => button.onclick = () => doDownload(videos[index])); gallery.querySelectorAll('[data-browse-dismiss]').forEach((button, index) => button.onclick = async (event) => { event.stopPropagation(); await dismissRecommendation(videos[index]?.id || videos[index]?.url, 'not-interested'); toast('Recommendation dismissed'); renderBrowse(); }); }
async function renderBrowse() {
  gallery.innerHTML = '<section class="browse-dashboard"><p class="browse-empty">Loading recommendations…</p></section>';
  try {
    await renderBrowseInner();
  } catch {
    gallery.innerHTML = `<section class="browse-dashboard"><div class="auth-required"><strong>Recommendations unavailable</strong><span>Something went wrong while building your feed. Your saved videos are unaffected.</span><div class="auth-actions"><button type="button" class="primary-button" id="rec-retry">Retry</button></div></div></section>`;
    $('#rec-retry').onclick = () => renderBrowse();
  }
}
async function discoverActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return toast('Open a public website in Chrome first');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const adapter = adaptersFor(tab?.url || '')[0];
  if (!adapter) return toast('No public page found');
  const result = await adapter.getFeed();
  if (!result.supported) {
    if (result?.error?.code === 'AUTH_REQUIRED') {
      await renderBrowse();
      const slot = document.querySelector('[data-browse-auth]');
      if (slot) showAuthRequired(slot, { platform: adapter.platform, pageUrl: tab.url, onRetry: async () => discoverActiveTab() });
      return;
    }
    return toast(result.reason || 'Feed unavailable');
  }
  const normalized = result.videos.map(video => ({ ...video, platform: video.platform || adapter.platform, canonicalUrl: video.canonicalUrl || video.url || tab.url, pageUrl: video.pageUrl || tab.url, creator: video.creator || { name: '', username: '', profileUrl: '' } }));
  if (!normalized.length) return toast('Nothing discovered on this page');
  state.videos = [...normalized, ...state.videos];
  state.browsePlatform = normalized[0].platform;
  renderBrowse();
  toast('Active page discovered');
}
function renderSettings() { const preferences = getPreferences(); gallery.innerHTML = `<section class="settings-panel"><span class="eyebrow">PREFERENCES</span><h2>Personalization</h2>${[['enabled', 'Personalize recommendations'], ['recommendationsEnabled', 'Enable recommendations'], ['trendingEnabled', 'Enable trending content'], ['trackSaved', 'Track saved videos'], ['trackFavorites', 'Track favorites'], ['trackViewing', 'Track viewing interactions']].map(([key, label]) => `<label><input type="checkbox" data-pref="${key}" ${preferences[key] !== false ? 'checked' : ''}>${label}</label>`).join('')}<h3>Platform preferences</h3>${platforms.map(platform => `<label><input type="checkbox" data-platform-pref="${platform}" ${(preferences.platforms || {})[platform] !== false ? 'checked' : ''}>${platform}</label>`).join('')}<button id="clear-personalization" class="danger-button" type="button">Clear Recommendation History</button><button id="reset-personalization" class="danger-button" type="button">Reset Personalization</button></section>`; gallery.querySelectorAll('[data-pref]').forEach(input => input.onchange = () => setPreferences({ [input.dataset.pref]: input.checked })); gallery.querySelectorAll('[data-platform-pref]').forEach(input => input.onchange = () => setPreferences({ platforms: { ...(getPreferences().platforms || {}), [input.dataset.platformPref]: input.checked } })); $('#clear-personalization').onclick = () => { if (window.confirm('Clear recommendation history?')) { clearPersonalization(); toast('Recommendation history cleared'); } }; $('#reset-personalization').onclick = async () => { if (window.confirm('Reset all personalization?')) { await resetPersonalization(); renderSettings(); toast('Personalization reset'); } }; }
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
  let tabMetadata = null;
  if (typeof chrome !== 'undefined' && chrome.tabs?.query && chrome.tabs?.sendMessage) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && /^https?:/i.test(tab.url || '')) {
        const response = await chrome.tabs.sendMessage(tab.id, { source: 'videovault-popup', message: 'videovault:extract' });
        if (response && typeof response === 'object') tabMetadata = response;
      }
    } catch { }
  }
  await showSaveLinkForm(tabMetadata);
}
document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => { state.view = button.dataset.view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button)); render(); });
$('#search-input').oninput = event => { state.query = event.target.value; render(); }; $('#sort-select').onchange = event => { state.sort = event.target.value; render(); }; $('#save-button').onclick = saveCurrentVideo;
$('#select-mode').onclick = toggleSelectionMode; $('#clear-selection').onclick = clearSelection; $('#bulk-move').onclick = moveSelected; $('#bulk-favorite').onclick = favoriteSelected; $('#bulk-share').onclick = shareSelected; $('#bulk-delete').onclick = deleteSelected;
$('#theme-toggle').onclick = () => { document.body.classList.toggle('light-theme'); localStorage.setItem('videovault-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); };
if (localStorage.getItem('videovault-theme') === 'light') document.body.classList.add('light-theme');
document.addEventListener('keydown', event => { if (event.key === '/' && document.activeElement.tagName !== 'INPUT') { event.preventDefault(); $('#search-input').focus(); } if (event.key === 'Escape') $('#modal-root').innerHTML = ''; });
try { if (typeof chrome !== 'undefined' && chrome.runtime?.sendNativeMessage && !window['videovault-ytdlp-autowire']) { window['videovault-ytdlp-autowire'] = true; setYtDlpBridge(createNativeYtDlpBridge()); } } catch { /* yt-dlp stays disabled */ }
refresh();