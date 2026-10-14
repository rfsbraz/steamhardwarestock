// Change notifications from the Worker: one Discord webhook post and one
// ntfy.sh post per cron run, however many statuses changed. Each channel is
// skipped quietly when its secret is missing. Errors are logged without the
// webhook URL or topic, and never thrown.
import StockStatus from '../public/stock-status.js';

export const DISCORD_MAX = 2000;
const NTFY_MAX = 4000;
const TIMEOUT_MS = 5000;
const label = (status) => StockStatus.copyFor(status).label;

export function formatMessage(changes, max = DISCORD_MAX) {
  const head = changes.length === 1 ? 'Steam hardware stock change:' : `${changes.length} Steam hardware stock changes:`;
  const lines = changes.map((c) => `- ${c.productName} in ${c.regionName}: ${label(c.previous)} → ${label(c.status)} <${c.url}>`);
  let out = head;
  for (let i = 0; i < lines.length; i++) {
    const next = `${out}
${lines[i]}`;
    const reserve = i < lines.length - 1 ? 60 : 0;
    if (next.length + reserve > max) return `${out}
...and ${lines.length - i} more: https://steamhardwarestock.com/history`;
    out = next;
  }
  return out;
}

async function post(name, fetchImpl, url, init) {
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`${name} post failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    // The error text can include the URL, so only log its type.
    console.error(`${name} post failed: ${error?.name || 'Error'}`);
    return false;
  }
}

export async function notifyChanges(env, changes, { fetchImpl = (...a) => fetch(...a) } = {}) {
  if (!changes.length) return false;
  const jobs = [];
  if (/^https:\/\//.test(env.DISCORD_WEBHOOK_URL || '')) {
    jobs.push(post('discord', fetchImpl, env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: formatMessage(changes), allowed_mentions: { parse: [] } })
    }));
  }
  if (env.NTFY_TOPIC) {
    const first = changes[0];
    jobs.push(post('ntfy', fetchImpl, `https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, {
      method: 'POST',
      headers: {
        Title: changes.length === 1 ? `${first.productName}: ${label(first.status)}` : `${changes.length} Steam hardware stock changes`,
        Click: changes.length === 1 ? first.url : 'https://steamhardwarestock.com/history',
        Tags: 'video_game'
      },
      body: formatMessage(changes, NTFY_MAX).replace(/ <(https:[^>]+)>/g, '')
    }));
  }
  if (!jobs.length) return false;
  const results = await Promise.all(jobs);
  return results.some(Boolean);
}
