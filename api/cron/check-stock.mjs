import { BlobPreconditionFailedError } from '@vercel/blob';
import { readHistoryFresh, mergeEvent, writeHistory, writeStatus } from '../../lib/history-store.mjs';
import { buildStatusDoc } from '../../lib/status-doc.mjs';

const INTERVAL_SECONDS = 600;
import { checkAll } from '../../lib/steam.mjs';

const CORS = { 'access-control-allow-origin': '*' };

function applyAll(history, results, ts) {
  let transitions = 0;
  for (const { product, region, available, status } of results) {
    const key = `${product.id}:${region}`;
    const changed = mergeEvent(history, {
      key,
      productId: product.id,
      productName: product.name,
      region,
      source: 'steam',
      available,
      status,
      ts
    });
    if (changed) transitions++;
  }
  return transitions;
}

export default {
  async fetch(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return new Response('CRON_SECRET not configured', { status: 503, headers: CORS });
    }
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${expected}`) {
      return new Response('unauthorized', { status: 401, headers: CORS });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response('no storage configured', { status: 503, headers: CORS });
    }

    const { results, errors, total, fetchCount } = await checkAll();
    console.log(`cron: ${fetchCount} Steam requests, ${results.length} results, ${errors.length} errors`);
    const ts = new Date().toISOString();

    // Every run refreshes status.json, even when nothing changed, so the
    // timestamp shows the check is alive. A failed region keeps no cell.
    try {
      await writeStatus(buildStatusDoc(results, { generatedAt: ts, intervalSeconds: INTERVAL_SECONDS }));
    } catch (error) {
      console.error('cron status write error:', error?.name, error?.message);
    }

    let read;
    try {
      read = await readHistoryFresh();
    } catch (error) {
      console.error('cron read error:', error?.name, error?.message);
      return new Response(JSON.stringify({ error: 'history unavailable' }), {
        status: 503,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }

    let { history, etag } = read;
    let transitions = applyAll(history, results, ts);

    if (transitions === 0) {
      return new Response(JSON.stringify({ checked: results.length, transitions: 0, errors: errors.length, total }), {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }

    try {
      await writeHistory(history, etag);
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        try {
          read = await readHistoryFresh();
        } catch (retryError) {
          console.error('cron retry read error:', retryError?.name, retryError?.message);
          return new Response(JSON.stringify({ error: 'history unavailable on retry' }), {
            status: 503,
            headers: { ...CORS, 'content-type': 'application/json' }
          });
        }
        history = read.history;
        etag = read.etag;
        transitions = applyAll(history, results, ts);
        if (transitions === 0) {
          return new Response(JSON.stringify({ checked: results.length, transitions: 0, errors: errors.length, total }), {
            status: 200,
            headers: { ...CORS, 'content-type': 'application/json' }
          });
        }
        await writeHistory(history, etag);
      } else {
        console.error('cron write error:', error?.name, error?.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS, 'content-type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ checked: results.length, transitions, errors: errors.length, total }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' }
    });
  }
};
