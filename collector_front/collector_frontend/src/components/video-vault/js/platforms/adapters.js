// Per-platform adapters share the PageAdapter behavior (official feeds are
// not available without API keys, so Browse reads the public page through
// permitted browser mechanisms). Separate classes keep the architecture
// modular: capabilities can diverge per platform without touching callers.
import { PageAdapter } from './pageAdapter.js';

export class YouTubeAdapter extends PageAdapter {
  constructor(url) { super('YouTube', url); }
}
export class TikTokAdapter extends PageAdapter {
  constructor(url) { super('TikTok', url); }
}
export class RedditAdapter extends PageAdapter {
  constructor(url) { super('Reddit', url); }
}
export class InstagramAdapter extends PageAdapter {
  constructor(url) { super('Instagram', url); }
}
export class XTwitterAdapter extends PageAdapter {
  constructor(url) { super('X / Twitter', url); }
}
export class VimeoAdapter extends PageAdapter {
  constructor(url) { super('Vimeo', url); }
}
export class FacebookAdapter extends PageAdapter {
  constructor(url) { super('Facebook', url); }
}
export class OtherAdapter extends PageAdapter {
  constructor(url) { super('Other', url); }
}

const CLASSES = {
  YouTube: YouTubeAdapter,
  TikTok: TikTokAdapter,
  Reddit: RedditAdapter,
  Instagram: InstagramAdapter,
  'X / Twitter': XTwitterAdapter,
  Vimeo: VimeoAdapter,
  Facebook: FacebookAdapter,
  Other: OtherAdapter
};

export function adapterForPlatform(platform, url) {
  const Cls = CLASSES[platform] || OtherAdapter;
  return new Cls(url);
}
