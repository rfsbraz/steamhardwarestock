import { buildAtom } from '../lib/feed.mjs';
import { serveFeed } from './_feed.js';

export function onRequestGet(context) {
  return serveFeed(context, buildAtom, 'application/atom+xml');
}
