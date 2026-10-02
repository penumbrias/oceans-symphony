# Running your own Oceans Symphony relay

The app is local-first: your data lives on your device and the relay never
sees it. What the relay does is narrow — it is the small server that lets
two systems find each other and pass messages:

- **Friends** — friend codes, friend lists, pending requests, and
  forwarding the end-to-end encrypted front/alter payloads.
- **Reminder delivery** — the schedule that fires a notification when the
  app is closed.
- **Web push** — signing the actual push messages.

Everything else (journals, alters, activities, check-ins, the lot) is on
your device and goes nowhere near it.

## What the relay can and cannot see

It is a router, not a database of your life. Friends payloads are
end-to-end encrypted: the private key lives in `FriendIdentity` on your
device and is deliberately excluded from backups, so it never reaches any
server. The relay stores the ciphertext, the public keys, and who is
friends with whom.

Self-hosting changes **who runs that router** — not what it is able to
read. If your reason for self-hosting is "I don't want a stranger holding
my friend graph", that is exactly what it fixes.

## What it takes

```bash
cd server
cp .env.example .env     # set EXTRA_ALLOWED_ORIGINS at minimum
docker compose up -d
```

That gets you Redis plus the relay on `127.0.0.1:8787`. Then put a
TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of it, and
point the app at your HTTPS address in **Settings → Notifications &
reminders → Friends & sync server**. Restart the app.

HTTPS is not optional: the app's Content-Security-Policy allows only
`https:` connections, and the relay carries bearer credentials. A plain
`http://` LAN address will be refused by the settings screen, and blocked
by the browser even if it weren't.

Without Docker: `npm install` inside `server/`, then
`REDIS_URL=… node server/index.mjs`.

## What actually migrates

| | Self-hosted? | Notes |
|---|---|---|
| Friends (codes, requests, lists) | Yes | Fully |
| Front / alter sharing | Yes | Still end-to-end encrypted |
| Reminder delivery | Yes | The relay runs the every-minute dispatch itself |
| Web push | Yes | The app fetches your relay's VAPID public key at runtime |
| **Android (FCM) push** | **No** | See below |

**Android push is the one thing that can't follow you.** The Play Store
build is bound to its Firebase project by `google-services.json` baked
into the APK at build time. Setting `FIREBASE_SERVICE_ACCOUNT` on your
relay only delivers Android push if you also ship your own build of the
app. Web push has no such restriction, and local reminders (the ones the
app schedules on the device) are unaffected either way.

## Friend codes belong to one relay

A friend code is issued by, and only exists on, the relay that minted it.
So:

- Switching relays gives you a **new identity** on the new one.
- You and your friends must be on the **same relay** to see each other.
- Your old identity isn't destroyed — switch back and it's still there.

This is deliberate. Federating identities across relays would mean
trusting a relay's claims about users it doesn't own, and re-deriving
every safety number. One home relay per person is the honest model.

## How it stays one codebase

The handlers in `api/` are **not** forked for self-hosting. `server/index.mjs`
imports those exact files and supplies the two things Vercel otherwise
provides:

1. **The KV backend.** `api/_kv.js` reads `globalThis.__SYMPHONY_KV`, which
   the server installs before importing any handler
   (`server/kvRedis.mjs`, a Redis adapter matching Upstash's semantics —
   JSON-encoded values, object-form `zadd`, `byScore` ranges).
2. **The request/response shims** Vercel's runtime adds on top of Node's
   own: `req.body`, `req.query`, `res.status().json()`.

Plus the every-minute reminder dispatch that `vercel.json` runs as a cron.

If you add a KV method to a handler, add it to `server/kvRedis.mjs` too —
the adapter throws a named error for anything unimplemented rather than
silently returning `undefined`, so you'll find out immediately rather than
via mysteriously missing data.

## Operational notes

- **Redis here is durable data, not a cache.** It holds friend identities
  and friend links. Losing it invalidates everyone's friend codes. The
  compose file enables `appendonly`; back the volume up.
- **`EXTRA_ALLOWED_ORIGINS` is the setting people get wrong.** If the
  browser origin you open the app from isn't listed, every response is
  blocked by CORS and the app reports the relay as unreachable. The
  desktop (`symphony://app`) and native (`app.local.oceans-symphony`)
  origins are allowed by default; a web deployment of your own is not.
- **`/health`** reports whether Redis is actually reachable, not merely
  whether the process is alive. The container health check uses it.
- **`CRON_SECRET`** stops anyone triggering reminder dispatch. Set
  `ENABLE_CRON=0` if you'd rather drive `/api/reminders/dispatch` from
  your own scheduler.
