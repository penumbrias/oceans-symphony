// Oceans Symphony — self-hosted relay.
//
// Runs the SAME endpoints as the hosted deployment. The handlers in api/
// are imported unmodified; nothing about the Friends protocol, the crypto,
// the rate limits or the input caps is reimplemented here. This file is
// only the plumbing Vercel normally provides:
//
//   1. an HTTP server and a route table,
//   2. the small request/response shims Vercel's runtime adds
//      (req.body, req.query, res.status().json()),
//   3. a KV backend (Redis instead of Upstash — server/kvRedis.mjs),
//   4. the every-minute reminder dispatch that vercel.json runs as a cron.
//
// Deliberately zero runtime dependencies beyond what the handlers already
// need (ioredis for the KV adapter). No Express, no Hono: the surface is
// 20 routes of JSON, and a framework here would be one more thing between
// a self-hoster and a working relay.
//
// See docs/self-hosting.md for what this does and does not give you —
// notably, Android FCM push stays bound to the app's Firebase project and
// cannot be redirected to a self-hosted relay without your own build.

import http from 'node:http';
import { createRedisKv } from './kvRedis.mjs';

const PORT = Number(process.env.PORT || 8787);
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const ENABLE_CRON = process.env.ENABLE_CRON !== '0';
const BODY_LIMIT = 1024 * 1024; // 1 MB — the largest legitimate payload is
                                // an alter list; anything bigger is abuse.

// ── KV backend MUST be installed before any handler is imported ──
// api/_kv.js reads globalThis.__SYMPHONY_KV at module-eval time, and
// handlers import it transitively, so this has to happen before the
// dynamic imports below. That ordering is the whole reason the routes are
// loaded lazily rather than with static imports.
const { kv, redis } = createRedisKv(REDIS_URL);
globalThis.__SYMPHONY_KV = kv;

// Route table — mirrors the api/ directory, which is what Vercel derives
// its routes from. Kept explicit so an unlisted file is never reachable.
const ROUTES = [
  'friends/register', 'friends/list', 'friends/status', 'friends/request',
  'friends/respond', 'friends/remove', 'friends/delete', 'friends/update-front',
  'friends/get-alters', 'friends/update-alters', 'friends/save-pubkey',
  'friends/save-fcm-token', 'friends/save-push-sub', 'friends/notify-toggle',
  'push/send', 'push/vapid-public-key',
  'reminders/sync', 'reminders/dispatch',
];

const handlers = new Map();
async function loadHandlers() {
  for (const route of ROUTES) {
    const mod = await import(`../api/${route}.js`);
    handlers.set(`/api/${route}`, mod.default);
  }
}

// ── Vercel-compatible req/res shims ───────────────────────────────────
// The handlers are written against Vercel's Node signature. Node's own
// http objects already provide headers/method/setHeader/end; these are the
// pieces Vercel adds on top.

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
      return resolve(undefined);
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      // Vercel parses JSON bodies and leaves anything else as a string.
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload) => {
    if (payload === undefined || payload === null) return res.end();
    if (typeof payload === 'object') return res.json(payload);
    res.end(String(payload));
    return res;
  };
  return res;
}

// ── Reminder dispatch, the cron vercel.json normally owns ──────────────
// Called in-process rather than requiring the self-hoster to wire up
// system cron. CRON_SECRET is still honoured: the internal call presents
// it exactly as an external caller would, so the handler's auth path is
// the same one production exercises.
function startCron() {
  const dispatch = handlers.get('/api/reminders/dispatch');
  if (!dispatch) return;
  let running = false;
  const tick = async () => {
    if (running) return; // a slow run must never stack up
    running = true;
    try {
      const req = {
        method: 'POST',
        headers: {
          authorization: process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '',
          'x-forwarded-for': '127.0.0.1',
        },
        body: {},
        query: {},
        url: '/api/reminders/dispatch',
      };
      const res = decorateResponse({
        statusCode: 200,
        headersSent: false,
        setHeader() {},
        end() {},
        on() {},
      });
      await dispatch(req, res);
    } catch (err) {
      console.error('[cron] reminder dispatch failed:', err?.message || err);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 60_000).unref?.();
  console.log('[cron] reminder dispatch running every 60s');
}

const server = http.createServer(async (req, res) => {
  decorateResponse(res);
  let pathname;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname.replace(/\/+$/, '') || '/';
    req.query = Object.fromEntries(url.searchParams.entries());
  } catch {
    return res.status(400).json({ error: 'Bad request' });
  }

  // Unauthenticated liveness probe for docker/systemd health checks.
  // Reports whether Redis is actually reachable — a relay that answers
  // 200 while its store is down would be worse than no probe at all.
  if (pathname === '/health') {
    try {
      await redis.ping();
      return res.status(200).json({ ok: true, redis: 'up' });
    } catch (e) {
      return res.status(503).json({ ok: false, redis: 'down', error: e?.message || 'ping failed' });
    }
  }

  const handler = handlers.get(pathname);
  if (!handler) return res.status(404).json({ error: 'Not found' });

  try {
    req.body = await readBody(req);
  } catch (err) {
    return res.status(err?.statusCode === 413 ? 413 : 400).json({ error: err?.message || 'Bad body' });
  }

  try {
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (err) {
    // Never leak an internal error message or stack to the caller; the
    // operator gets it in the log instead.
    console.error(`[relay] ${pathname} failed:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
    else if (!res.writableEnded) res.end();
  }
});

await loadHandlers();
if (ENABLE_CRON) startCron();

server.listen(PORT, () => {
  console.log(`Oceans Symphony relay listening on :${PORT}`);
  console.log(`  Redis:      ${REDIS_URL.replace(/:\/\/.*@/, '://***@')}`);
  console.log(`  Routes:     ${ROUTES.length} endpoints under /api/`);
  console.log(`  Web push:   ${process.env.VAPID_PUBLIC_KEY ? 'configured' : 'NOT configured (set VAPID_* env vars)'}`);
  console.log(`  FCM:        ${process.env.FIREBASE_SERVICE_ACCOUNT ? 'configured' : 'not configured'}`);
  if (!process.env.EXTRA_ALLOWED_ORIGINS) {
    console.warn('  WARNING: EXTRA_ALLOWED_ORIGINS is unset. Browsers will block');
    console.warn('           responses unless you add the origin you open the app from.');
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[relay] ${sig} — shutting down`);
    server.close(() => redis.quit().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref?.();
  });
}
