export function detectPlatform(url = '') {
  const host = url.toLowerCase();
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
  if (host.includes('tiktok.com')) return 'TikTok';
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('facebook.com') || host.includes('fb.watch')) return 'Facebook';
  if (host.includes('reddit.com')) return 'Reddit';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'X / Twitter';
  if (host.includes('vimeo.com')) return 'Vimeo';
  return 'Other';
}

export function platformVideoId(url = '') {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1).split('/')[0];
    if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v') || '';
    if (parsed.hostname.includes('vimeo.com')) return parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (parsed.hostname.includes('tiktok.com')) return parsed.pathname.split('/').filter(Boolean).pop() || '';
    return '';
  } catch {
    return '';
  }
}
