// Negative + positive feedback store (not-interested / dismiss /
// remove-recommendation / liked). Local-only: chrome.storage.local when
// available, else localStorage. No credentials, cookies or tokens are ever
// stored here — only video ids + reason codes.
// Shape: { dismissed: {id: {at, reason}}, liked: {id: {at}} }
export const NEGATIVE_REASONS = Object.freeze({
  NOT_INTERESTED: 'not-interested',
  DISMISS: 'dismiss',
  REMOVE_RECOMMENDATION: 'remove-recommendation'
});

const KEY = 'videovault-recommendation-feedback';
const hasChrome = () => typeof chrome !== 'undefined' && chrome.storage?.local;

async function readStore() {
  try {
    if (hasChrome()) return (await chrome.storage.local.get(KEY))[KEY] || { dismissed: {}, liked: {} };
    return JSON.parse(localStorage.getItem(KEY) || 'null') || { dismissed: {}, liked: {} };
  } catch { return { dismissed: {}, liked: {} }; }
}

async function writeStore(store) {
  if (hasChrome()) { await chrome.storage.local.set({ [KEY]: store }); return store; }
  localStorage.setItem(KEY, JSON.stringify(store));
  return store;
}

function idOf(videoOrId) {
  return typeof videoOrId === 'string' ? videoOrId : (videoOrId?.id || videoOrId?.canonicalUrl || videoOrId?.url || '');
}

export async function getFeedback() { return readStore(); }

// Generic negative-signal writer. All three named signals (not-interested,
// dismiss, remove-recommendation) funnel through here so the engine has a
// single exclusion path while the reason stays available for future
// per-signal weighting in an ML scorer.
export async function dismissRecommendation(videoOrId, reason = NEGATIVE_REASONS.NOT_INTERESTED) {
  const store = await readStore();
  const id = idOf(videoOrId);
  if (!id) return store;
  store.dismissed[id] = { at: Date.now(), reason };
  delete store.liked[id];
  return writeStore(store);
}

// Named negative signals (all exclude the item from every section).
export const notInterested = (videoOrId) => dismissRecommendation(videoOrId, NEGATIVE_REASONS.NOT_INTERESTED);
export const dismiss = (videoOrId) => dismissRecommendation(videoOrId, NEGATIVE_REASONS.DISMISS);
export const removeRecommendation = (videoOrId) => dismissRecommendation(videoOrId, NEGATIVE_REASONS.REMOVE_RECOMMENDATION);

export async function undismissRecommendation(videoOrId) {
  const store = await readStore();
  delete store.dismissed[idOf(videoOrId)];
  return writeStore(store);
}

export async function likeRecommendation(videoOrId) {
  const store = await readStore();
  const id = idOf(videoOrId);
  if (!id) return store;
  store.liked[id] = { at: Date.now() };
  delete store.dismissed[id];
  return writeStore(store);
}

export async function isDismissed(videoOrId) {
  const store = await readStore();
  return Boolean(store.dismissed[idOf(videoOrId)]);
}

export async function getDismissReason(videoOrId) {
  const store = await readStore();
  return store.dismissed[idOf(videoOrId)]?.reason || null;
}

export async function clearFeedback() {
  return writeStore({ dismissed: {}, liked: {} });
}

// Sync in-memory variants for pure unit tests (no storage).
export function feedbackSets(store = { dismissed: {}, liked: {} }) {
  return {
    dismissedSet: new Set(Object.keys(store.dismissed || {})),
    positiveSet: new Set(Object.keys(store.liked || {}))
  };
}
