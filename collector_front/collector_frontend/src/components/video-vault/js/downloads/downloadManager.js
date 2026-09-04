export function getDownloadOptions(video) {
  const url = video?.downloadUrl || video?.contentUrl || '';
  if (!url || !/^https?:/i.test(url) || !video.downloadAllowed) return { supported: false, options: [] };
  return { supported: true, options: [{ url, label: 'Download' }] };
}
export function download(video) {
  const result = getDownloadOptions(video);
  if (!result.supported) return false;
  const link = document.createElement('a'); link.href = result.options[0].url; link.download = ''; link.rel = 'noopener'; link.click(); return true;
}
