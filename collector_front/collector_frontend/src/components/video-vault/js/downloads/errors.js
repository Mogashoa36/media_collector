// Centralized download/platform error codes for VideoVault.
//
// Every provider and platform adapter returns errors in this shape so the UI
// can render a consistent message without each caller inventing strings.
// No passwords, cookies, tokens or auth headers are ever stored here — codes
// only describe what happened.
export const ErrorCodes = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PRIVATE_CONTENT: 'PRIVATE_CONTENT',
  UNSUPPORTED: 'UNSUPPORTED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  UNKNOWN: 'UNKNOWN'
});

const MESSAGES = {
  AUTH_REQUIRED: 'Login required — you’re logged out of this site. Log in on the original platform and try again.',
  PRIVATE_CONTENT: 'This video is private or protected (DRM, paywall or platform restriction) — downloading isn’t possible.',
  UNSUPPORTED: 'Download unavailable for this video. You can still open the original page.',
  NETWORK_ERROR: 'Network problem — check your connection and try again.',
  EXTRACTION_ERROR: 'Couldn’t read media from this page. Open the original site and try again.',
  PROVIDER_ERROR: 'The download service failed. Try again, or open the original page.',
  UNKNOWN: 'Something went wrong. Try again in a moment.'
};

export function normalizeError(code, detail = '') {
  const normalized = Object.values(ErrorCodes).includes(code) ? code : ErrorCodes.UNKNOWN;
  return {
    code: normalized,
    message: MESSAGES[normalized] || MESSAGES.UNKNOWN,
    detail: typeof detail === 'string' ? detail : ''
  };
}

// Only treat a provider signal as "logged out" when the provider explicitly
// says so. Callers must not claim logged-out state on generic failures.
export function isAuthRequired(error) {
  return error?.code === ErrorCodes.AUTH_REQUIRED;
}

export function isPrivateContent(error) {
  return error?.code === ErrorCodes.PRIVATE_CONTENT;
}

// Heuristic mapping of provider/auth failures to a code. Providers should
// prefer explicit codes; this is only a safety net.
export function classifyFailure({ httpStatus = 0, message = '', requiresLogin = false, isPrivate = false } = {}) {
  if (requiresLogin || httpStatus === 401 || httpStatus === 403) return ErrorCodes.AUTH_REQUIRED;
  if (isPrivate) return ErrorCodes.PRIVATE_CONTENT;
  const text = String(message || '').toLowerCase();
  if (/login|sign in|unauthenticated|auth_required/i.test(text)) return ErrorCodes.AUTH_REQUIRED;
  if (/private|restricted|paywall|drm|forbidden/i.test(text)) return ErrorCodes.PRIVATE_CONTENT;
  if (/network|timeout|econn|fetch failed|offline/i.test(text)) return ErrorCodes.NETWORK_ERROR;
  if (/unsupported|no download|not supported/i.test(text)) return ErrorCodes.UNSUPPORTED;
  if (/extract|parse|invalid response/i.test(text)) return ErrorCodes.EXTRACTION_ERROR;
  if (/provider|unavailable/i.test(text)) return ErrorCodes.PROVIDER_ERROR;
  return ErrorCodes.UNKNOWN;
}
