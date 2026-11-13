import { buildAtom, feedScope } from '../../lib/feed.mjs';
import { serveFeed } from '../_feed.js';

// /<product>/feed.xml and /<country>/feed.xml
export function onRequestGet(context) {
  return serveFeed(context, buildAtom, 'application/atom+xml', feedScope([context.params.scope]));
}
