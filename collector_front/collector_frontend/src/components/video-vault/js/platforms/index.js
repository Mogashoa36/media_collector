import { adapterForPlatform } from './adapters.js';

export const platforms = ['YouTube', 'TikTok', 'Reddit', 'Instagram', 'X / Twitter', 'Vimeo', 'Facebook'];
const hosts = {
  YouTube: ['youtube.com', 'youtu.be'], TikTok: ['tiktok.com'], Reddit: ['reddit.com'],
  Instagram: ['instagram.com'], 'X / Twitter': ['x.com', 'twitter.com'], Vimeo: ['vimeo.com'], Facebook: ['facebook.com', 'fb.watch']
};

export function platformForUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const matched = platforms.filter(platform => hosts[platform].some(host => hostname === host || hostname.endsWith(`.${host}`)));
    return matched[0] || 'Other';
  } catch { return 'Other'; }
}

export function adaptersFor(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const matched = platforms.filter(platform => hosts[platform].some(host => hostname === host || hostname.endsWith(`.${host}`)));
    return (matched.length ? matched : ['Other']).map(platform => adapterForPlatform(platform, url));
  } catch { return []; }
}
