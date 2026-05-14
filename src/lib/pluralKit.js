// PluralKit API v2 client.
//
// Docs: https://pluralkit.me/api/
//
// Auth: HTTP Authorization header with the user's PluralKit token (no
// "Bearer " prefix, no `pk;`). PK tokens are full read-write — there is
// no read-only token variant — so they MUST be stored encrypted at rest
// (we keep them in the IDB SystemSettings entity which is encrypted
// alongside the rest of the DB when storage encryption is enabled).
//
// Rate limits: ~10 req/sec for GET, ~3 req/sec for writes. On 429 we
// pause briefly and retry once. For bulk exports we also gate writes
// with a small inter-request delay so we never hit the ceiling.
//
// CORS: api.pluralkit.me sets Access-Control-Allow-Origin: * — we can
// call it directly from the browser, no proxy needed.

const PK_API_BASE = "https://api.pluralkit.me/v2";

// Minimum gap between write requests in ms. 350 ms = ~3 req/s — exactly
// at the PK rate limit. Used by bulkPatchMembers / bulkCreateMembers
// during export so we don't get rate-limited mid-batch.
const PK_WRITE_INTERVAL_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pkFetch(path, token, init = {}) {
  const res = await fetch(`${PK_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 429) {
    // One retry after a short backoff. PluralKit returns a Retry-After
    // header on 429 but it's in seconds; clamp to a sane range.
    const retryAfter = parseInt(res.headers.get("Retry-After") || "1", 10);
    await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
    return pkFetch(path, token, init);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message || body?.error || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    // Strip any token-shaped string out of the error before throwing so
    // the user can't accidentally paste a stack-trace containing their
    // token elsewhere. PK tokens are alphanumeric, ~64 chars.
    const safe = detail.replace(/[A-Za-z0-9]{40,}/g, "<redacted>");
    throw new Error(`PluralKit (${res.status}): ${safe}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// GET /systems/@me — validates the token and returns the authenticated
// system. Used to wire up the connect flow.
export async function getOwnSystem(token) {
  return pkFetch("/systems/@me", token);
}

export async function getMembers(token, systemRef = "@me") {
  return pkFetch(`/systems/${systemRef}/members`, token);
}

export async function getGroups(token, systemRef = "@me") {
  // Include member arrays so we can map member→group relationships
  // without N+1 calls.
  return pkFetch(`/systems/${systemRef}/groups?with_members=true`, token);
}

// GET /systems/{ref}/switches?before=...&limit=100
//
// PK returns at most 100 switches per call, newest first. We page
// backward until we run out of `before` headroom or we reach the
// user's chosen earliest timestamp.
export async function getSwitches(token, systemRef = "@me", { earliest = null, max = 1000 } = {}) {
  const out = [];
  let before = null;
  while (out.length < max) {
    const qs = before ? `?before=${encodeURIComponent(before)}&limit=100` : `?limit=100`;
    const page = await pkFetch(`/systems/${systemRef}/switches${qs}`, token);
    if (!Array.isArray(page) || page.length === 0) break;
    for (const sw of page) {
      if (earliest && new Date(sw.timestamp).getTime() < earliest) return out;
      out.push(sw);
    }
    if (page.length < 100) break;
    before = page[page.length - 1].timestamp;
  }
  return out;
}

export async function createMember(token, member) {
  return pkFetch(`/members`, token, {
    method: "POST",
    body: JSON.stringify(member),
  });
}

export async function updateMember(token, memberId, partial) {
  return pkFetch(`/members/${memberId}`, token, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
}

// ── Field mapping helpers ─────────────────────────────────────────────────

function normalizeColor(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  return s.startsWith("#") ? s : `#${s}`;
}

function stripHash(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  return s.startsWith("#") ? s.slice(1) : s;
}

// PluralKit member → local Alter shape. Mirrors the SimplyPlural
// `mapMemberToAlter` pattern. `pk_id` is the external anchor we use to
// dedupe on re-import: if a local Alter already has that pk_id, the
// next import updates it instead of creating a new row.
export function mapPkMemberToAlter(member, groupsByMemberId = {}) {
  const groups = groupsByMemberId[member.id] || [];
  const banner = member.banner || "";
  // PK "banner" doubles as the alter profile header in OS — surface it via
  // the `_header_image` custom-field key that ProfileTab reads.
  const customFields = banner ? { _header_image: banner } : {};
  return {
    pk_id: member.id,
    name: member.name || "Unknown",
    display_name: member.display_name || "",
    pronouns: member.pronouns || "",
    description: member.description || "",
    color: normalizeColor(member.color),
    avatar_url: member.avatar_url || "",
    banner_url: banner,
    birthday: member.birthday || "",
    tags: [],
    groups,
    custom_fields: customFields,
    is_archived: false, // PK has no archive concept; preserve local archive flag separately
  };
}

// Local Alter → PluralKit member POST/PATCH body. Inverse of the mapper
// above. Only includes fields PK actually accepts; everything else
// stays local-only.
export function mapAlterToPkMember(alter) {
  const body = {};
  if (alter.name) body.name = alter.name;
  if (alter.display_name) body.display_name = alter.display_name;
  if (alter.pronouns) body.pronouns = alter.pronouns;
  if (alter.description) body.description = alter.description;
  const color = stripHash(alter.color);
  if (color) body.color = color;
  if (alter.avatar_url) body.avatar_url = alter.avatar_url;
  if (alter.banner_url) body.banner = alter.banner_url;
  if (alter.birthday) body.birthday = alter.birthday;
  return body;
}

// ── Bulk export helpers ───────────────────────────────────────────────────

// Throttled bulk send: PATCH existing members (those with a pk_id) and
// POST new ones. Returns { created: [{alterId, pkId}], updated: [pkId],
// failed: [{alterId, error}] } so the caller can update local records
// with the new pk_ids after creation.
export async function exportAltersToPluralKit(token, alters, onProgress) {
  const created = [];
  const updated = [];
  const failed = [];
  let i = 0;
  for (const alter of alters) {
    i += 1;
    onProgress?.(`Exporting ${i} of ${alters.length}…`);
    try {
      const body = mapAlterToPkMember(alter);
      if (alter.pk_id) {
        await updateMember(token, alter.pk_id, body);
        updated.push(alter.pk_id);
      } else {
        const newMember = await createMember(token, body);
        if (newMember?.id) {
          created.push({ alterId: alter.id, pkId: newMember.id });
        }
      }
    } catch (e) {
      failed.push({ alterId: alter.id, name: alter.name, error: e.message });
    }
    // Pace writes to stay under PK's ~3 req/s ceiling.
    if (i < alters.length) await sleep(PK_WRITE_INTERVAL_MS);
  }
  return { created, updated, failed };
}
