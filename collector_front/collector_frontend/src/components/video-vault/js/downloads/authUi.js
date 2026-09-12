// Auth-aware status UI shared by download/browse/metadata/playback flows.
// Renders the standardized login-required panel with Open Site & Login +
// Retry actions. Never requests or stores passwords/cookies/tokens: Retry
// simply re-runs the provider so the user's own platform session applies.
import { escapeHtml } from '../utils.js';

export function openSiteLogin(url) {
  if (!url) return false;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) { chrome.tabs.create({ url }); return true; }
  try { window.open(url, '_blank', 'noopener'); return true; } catch { return false; }
}

export function authPanelHtml({ platform = '', pageUrl = '', detail = '' } = {}) {
  const label = platform || pageUrl || 'this site';
  return `<div class="auth-required" role="alert" aria-live="assertive">`
    + `<strong>\uD83D\uDD12 Login required</strong>`
    + `<span>You\u2019re currently logged out of ${escapeHtml(label)}. Log in to access this content, then try again.</span>`
    + (detail ? `<small class="auth-detail">${escapeHtml(detail)}</small>` : '')
    + `<div class="auth-actions">`
    + `<button type="button" class="primary-button" data-auth-open>Open Site &amp; Login</button>`
    + `<button type="button" class="secondary-button" data-auth-retry>Retry</button>`
    + `</div></div>`;
}

// Mounts the panel into `container` and wires Open/Retry. onRetry is
// re-invoked without a page refresh; it should re-check auth and re-run the
// provider, then call the returned refresh() to update the UI.
export function showAuthRequired(container, { platform = '', pageUrl = '', detail = '', onRetry = null } = {}) {
  if (!container) return () => {};
  container.innerHTML = authPanelHtml({ platform, pageUrl, detail });
  const openBtn = container.querySelector('[data-auth-open]');
  const retryBtn = container.querySelector('[data-auth-retry]');
  if (openBtn) openBtn.onclick = () => openSiteLogin(pageUrl);
  if (retryBtn) {
    retryBtn.onclick = async () => {
      retryBtn.disabled = true;
      retryBtn.textContent = 'Retrying…';
      try {
        if (typeof onRetry === 'function') await onRetry();
      } finally {
        retryBtn.disabled = false;
        retryBtn.textContent = 'Retry';
      }
    };
  }
  return () => { container.innerHTML = ''; };
}

export function privateContentHtml({ platform = '' } = {}) {
  return `<div class="auth-required private" role="alert">`
    + `<strong>Private or restricted content</strong>`
    + `<span>This ${escapeHtml(platform || 'video')} is private, age-gated, or protected (DRM/paywall). `
    + `VideoVault can\u2019t download or play restricted content.</span></div>`;
}

export function unavailableHtml({ message = '' } = {}) {
  return `<div class="download-unavailable" role="status">`
    + `<strong>Download unavailable</strong>`
    + `<span>${escapeHtml(message || 'No provider can download this video. You can still open the original page.')}</span></div>`;
}

function escapeHtml(value = '') { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
