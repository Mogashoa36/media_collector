// Backwards-compatible shim: old import path keeps working.
export {
  download,
  getDownloadOptions,
  resolveDownloadOptions,
  fetchSaveFromMetadata,
  saveFromPageUrl,
  isSaveFromCandidate,
  openOriginal,
  setYtDlpBridge,
  setRegistry,
  getRegistry,
  createNativeYtDlpBridge
} from './downloadService.js';
