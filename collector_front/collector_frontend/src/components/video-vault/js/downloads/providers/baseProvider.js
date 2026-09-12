// Base contract every download provider implements.
//
// Normalized download option shape (returned by all providers):
//   { provider, title, format, quality, fileType, url|action, status, error }
// where `status` is 'available' | 'unavailable' and `error` is a normalized
// error object from errors.js (or null). Providers never throw for expected
// misses — they return { available:false, options:[], error }.
import { ErrorCodes, normalizeError } from '../errors.js';

export class BaseDownloadProvider {
  constructor(name) {
    this.name = name;
  }

  // Whether this provider can even attempt the given video/page.
  // Must be cheap and synchronous.
  // eslint-disable-next-line no-unused-vars
  supports(_video) {
    return false;
  }

  // Attempt to resolve download options. Never throws for expected misses.
  // Returns: { available:boolean, options:Array, error?:{code,message,detail} }
  // eslint-disable-next-line no-unused-vars
  async resolve(_video, _context = {}) {
    return { available: false, options: [], error: normalizeError(ErrorCodes.UNSUPPORTED, `${this.name} cannot handle this video`) };
  }

  ok(video, options) {
    return {
      available: options.length > 0,
      options: options.map((option) => ({
        provider: this.name,
        title: option.title || video?.title || '',
        format: option.format || '',
        quality: option.quality || option.resolution || '',
        fileType: option.fileType || option.format || '',
        url: option.url || '',
        action: option.action || (option.url ? 'download' : 'open'),
        status: 'available',
        error: null
      })),
      error: null
    };
  }

  miss(code, detail = '') {
    return { available: false, options: [], error: normalizeError(code, detail) };
  }
}
