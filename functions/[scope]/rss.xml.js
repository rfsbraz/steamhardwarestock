import { buildRss, feedScope } from '../../lib/feed.mjs';
import { serveFeed } from '../_feed.js';

// /<product>/rss.xml and /<country>/rss.xml
export function onRequestGet(context) {
  return serveFeed(context, buildRss, 'application/rss+xml', feedScope([context.params.scope]));
}
