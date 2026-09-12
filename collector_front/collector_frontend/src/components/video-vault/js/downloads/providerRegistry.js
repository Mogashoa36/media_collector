// Ordered provider registry: direct -> browser -> yt-dlp -> savefrom.
// Providers are swappable without touching UI/business logic: register,
// replace or disable any entry here.
import { ErrorCodes } from './errors.js';
import { DirectMediaProvider } from './providers/directMediaProvider.js';
import { BrowserDetectionProvider } from './providers/browserDetectionProvider.js';
import { ytDlpProvider } from './providers/ytDlpProvider.js';
import { SaveFromProvider } from './providers/saveFromProvider.js';

export const PROVIDER_ORDER = ['direct', 'browser-detection', 'ytdlp', 'savefrom'];

export class ProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map();
    providers.forEach((provider) => this.register(provider));
  }

  register(provider) {
    if (provider?.name) this.providers.set(provider.name, provider);
    return this;
  }

  disable(name) {
    this.providers.delete(name);
    return this;
  }

  enabled() {
    return PROVIDER_ORDER.filter((name) => this.providers.has(name))
      .map((name) => this.providers.get(name));
  }

  // First provider with available options wins. AUTH_REQUIRED /
  // PRIVATE_CONTENT short-circuit immediately (no point trying weaker
  // fallbacks once a provider reliably knows access is gated).
  async resolve(video, context = {}) {
    const attempts = [];
    for (const provider of this.enabled()) {
      let result;
      try {
        result = await provider.resolve(video, context);
      } catch (error) {
        result = {
          available: false, options: [],
          error: { code: ErrorCodes.PROVIDER_ERROR, message: 'Download provider failed', detail: String(error?.message || error) }
        };
      }
      attempts.push({ provider: provider.name, ...result });
      if (result?.available && result.options?.length) {
        return { provider: provider.name, available: true, options: result.options, attempts, error: null, fallbackToPage: result.fallbackToPage, pageUrl: result.pageUrl };
      }
      if (result?.error?.code === ErrorCodes.AUTH_REQUIRED || result?.error?.code === ErrorCodes.PRIVATE_CONTENT) {
        return { provider: provider.name, available: false, options: [], attempts, error: result.error };
      }
    }
    const lastError = attempts.length ? attempts[attempts.length - 1].error : null;
    return {
      provider: null, available: false, options: [], attempts,
      error: lastError || { code: ErrorCodes.UNSUPPORTED, message: 'Download unavailable', detail: '' }
    };
  }
}

export function createDefaultRegistry(overrides = {}) {
  const registry = new ProviderRegistry([
    new DirectMediaProvider(),
    new BrowserDetectionProvider(),
    ytDlpProvider,
    new SaveFromProvider(overrides.saveFrom || {})
  ]);
  if (overrides.disable) overrides.disable.forEach((name) => registry.disable(name));
  if (overrides.ytDlpBridge) ytDlpProvider.setBridge(overrides.ytDlpBridge);
  return registry;
}

let singleton = null;
export function defaultRegistry() {
  if (!singleton) singleton = createDefaultRegistry();
  return singleton;
}
