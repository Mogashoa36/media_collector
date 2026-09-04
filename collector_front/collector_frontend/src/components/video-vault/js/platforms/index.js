import { PageAdapter } from './pageAdapter.js';

const platforms = ['YouTube', 'TikTok', 'Reddit', 'Instagram', 'X / Twitter', 'Vimeo', 'Facebook'];
const hosts = {
  YouTube: ['youtube.com', 'youtu.be'], TikTok: ['tiktok.com'], Reddit: ['reddit.com'],
  Instagram: ['instagram.com'], 'X / Twitter': ['x.com', 'twitter.com'], Vimeo: ['vimeo.com'], Facebook: ['facebook.com', 'fb.watch']
};

export function adaptersFor(url) {
  let hostname = '';
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch { return []; }
  const matched = platforms.filter(platform => hosts[platform].some(host => hostname === host || hostname.endsWith(`.${host}`)));
  return (matched.length ? matched : ['Other']).map(platform => new PageAdapter(platform, url));
}
export { platforms };
