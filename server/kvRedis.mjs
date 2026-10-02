// Redis-backed adapter exposing the slice of the @vercel/kv API that the
// relay handlers actually use.
//
// The handlers are NOT forked for self-hosting — api/_kv.js picks this up
// from globalThis.__SYMPHONY_KV and every endpoint runs the same code that
// runs on Vercel. That means this adapter has to match Upstash's
// SEMANTICS, not just its method names. The three that bite:
//
//   1. VALUES ARE JSON. Upstash's client serialises objects on set and
//      parses them back on get. Plain redis stores strings, so we do the
//      same encode/decode here — otherwise every profile comes back as
//      "[object Object]".
//   2. zadd takes OBJECTS: kv.zadd(key, { score, member }, …), not
//      ioredis's positional (key, score, member).
//   3. zrange(key, min, max, { byScore: true }) means BYSCORE, which in
//      node-redis/ioredis is a separate argument form.
//
// Only these nine methods are implemented, because only these nine are
// used (verified by sweeping api/ for `kv.<method>(`). Anything else
// throws loudly rather than silently returning undefined — a quiet
// mismatch here would look like data loss to the user.

import Redis from 'ioredis';

// Upstash returns already-parsed values; plain Redis returns strings.
function decode(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // A value that was never JSON (a counter written by INCR) comes back
    // as-is, which is what Upstash does too.
    return raw;
  }
}

function encode(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function createRedisKv(url, options = {}) {
  const redis = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    ...options,
  });

  const kv = {
    async get(key) {
      return decode(await redis.get(key));
    },

    async set(key, value) {
      return redis.set(key, encode(value));
    },

    async del(...keys) {
      if (!keys.length) return 0;
      return redis.del(...keys.flat());
    },

    async mget(...keys) {
      const flat = keys.flat();
      if (!flat.length) return [];
      const raw = await redis.mget(...flat);
      return raw.map(decode);
    },

    // kv.zadd(key, { score, member }, { score, member }, …)
    async zadd(key, ...items) {
      const args = [];
      for (const it of items.flat()) {
        if (!it || typeof it !== 'object') continue;
        args.push(it.score, encode(it.member));
      }
      if (!args.length) return 0;
      return redis.zadd(key, ...args);
    },

    // kv.zrange(key, min, max, { byScore: true })
    async zrange(key, min, max, opts = {}) {
      const raw = opts.byScore
        ? await redis.zrangebyscore(key, min, max)
        : await redis.zrange(key, min, max);
      return raw.map(decode);
    },

    async zrem(key, ...members) {
      const flat = members.flat().map(encode);
      if (!flat.length) return 0;
      return redis.zrem(key, ...flat);
    },

    async incr(key) {
      return redis.incr(key);
    },

    async expire(key, seconds) {
      return redis.expire(key, seconds);
    },
  };

  // Guard against a handler quietly calling something we didn't implement.
  const guarded = new Proxy(kv, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined; // not a thenable
      throw new Error(
        `[self-host] kv.${String(prop)}() is not implemented in server/kvRedis.mjs. ` +
        `Add it there (matching Upstash semantics) rather than changing the handler.`
      );
    },
  });

  return { kv: guarded, redis };
}
