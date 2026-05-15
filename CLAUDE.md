# Oceans Symphony — Architecture Notes for Claude

## Critical: Always Respect User Terminology

Users can customise the words used for their system, alters, fronting, and switching. **Every piece of new UI must use these terms — never hardcode "system", "alter", "alters", "fronting", "fronter", "switch", "headmate", "headmates", "member" (when referring to alters), etc.**

- **Hook:** `useTerms()` from `@/lib/useTerms` — use this in any component that surfaces these words.
- **Available terms:** `terms.system`, `terms.System`, `terms.alter`, `terms.Alter`, `terms.alters`, `terms.Alters`, `terms.front`, `terms.Front`, `terms.fronting`, `terms.Fronting`, `terms.fronter`, `terms.Fronter`, `terms.fronters`, `terms.Fronters`, `terms.switch`, `terms.Switch`, `terms.switches`, etc.
- **Static configs** (like `navigationConfig.js` `ALL_PAGES`) cannot use the hook — resolve labels at the component level (see `resolveLabel` pattern in `NavigationSettings.jsx` and `termMap` in `AppLayout.jsx`).
- **Tooltips and sort labels** count too — e.g., "Most fronting time first" not "Most fronted first".
- **Compound words count too** — e.g., `${t.system}-wide` not "system-wide"; `${t.Switch} Log` not "Switch Log".
- **ALL body text, descriptions, labels, placeholders, and tour steps** must use terms — not just headings and buttons.
- **"headmate" and "headmates" are hardcoded synonyms** — always replace with `${t.alter}` / `${t.alters}`.
- When in doubt: if the word would change if the user had set a custom term, use `useTerms()`.

## Critical: Custom Status Notes

**How they work (like Facebook statuses):**
- Every time the user types in the "Set a new status..." field on the Dashboard and hits Save, a **brand new** `localEntities.StatusNote` record is created with `{ timestamp, note }`.
- **Old status notes are NEVER modified or deleted.** Each save is immutable.
- The input field always clears after saving — it is not an "edit" of the previous status.
- The timeline shows each StatusNote at its **own `timestamp`** (when it was saved), NOT at session start time.
- The dashboard shows the most recent StatusNote as a read-only preview above the input.
- Status notes appear in the Tally panel under "Custom Statuses".
- Status notes are included in Therapy Reports via `buildStatusNotesSection({ statusNotes })`.

**Entity:** `localEntities.StatusNote` — fields: `timestamp` (ISO), `note` (string).

**DO NOT:**
- Store statuses in `localStorage[symphony_status_${session.id}]` — this overwrites on change and pins to session start time (broken pattern from old code).
- Tie custom statuses to fronting sessions or alters — they are system-wide standalone notes.
- Update or delete StatusNote records after creation.

**Query key:** `["statusNotes"]`

---

## Two Separate "Status" Concepts — Do Not Confuse

1. **Custom Status Notes** (`localEntities.StatusNote`) — the Dashboard field described above. System-wide, timestamped, immutable log. Like Facebook statuses.

2. **Alter-Specific Notes / Board Messages** (`base44.entities.AlterMessage`) — per-alter notes stored on individual alter pages. Completely separate feature. Do not mix these up.

---

## Location Records

**Entity:** `localEntities.Location` — fields: `timestamp`, `name`, `category`, `latitude`, `longitude`, `source` ("gps" | "manual"), `notes`.

- Category constants live in `src/lib/locationCategories.js` — use `getCategoryMeta(id)` everywhere.
- GPS-captured records have `latitude`/`longitude` and should show a "Open in Maps" link (`https://www.google.com/maps?q={lat},{lng}`).
- Timeline column order: alters | symptoms | events | emotions | locations | activities.
- **Query key:** `["locations"]`

---

## Alter Lineage / System Change Events

**Entity:** `localEntities.SystemChangeEvent` — fields: `type` (fusion|split|dormancy|return), `date` (ISO, year_only events store Jan 1 of that year), `year_only` (bool), `source_alter_ids`, `result_alter_ids`, `fusion_type`, `cause`, `notes`.

- Dates are year-only — stored as `new Date(year, 0, 1).toISOString()` with `year_only: true`.
- Display year-only dates as just the year (not "Jan 1, XXXX").
- When a **split** event is saved, automatically create `base44.entities.AlterRelationship` records linking each result alter to each source alter with `relationship_type: "Split from"`.
- **Fusion absorption wording:** say "alter that persists" NOT "surviving alter" — the absorbed alters aren't being killed.
- Alter `origin_year` field (number) on the Alter entity — separate from lineage events, just records when an alter first appeared.

---

## Timeline Column Layout

InfiniteTimeline uses absolute positioning. Column order (left to right):
```
[time label 44px] | [alters] | [symptoms] | [events] | [emotions] | [locations] | [activities]
```
- `LABEL_WIDTH = 44`
- Each column only renders if it has data for that day.
- `StatusNoteBadge` is positioned at `left: LABEL_WIDTH - 22` (right edge of the time column).
- Time labels are **left-aligned** (`text-left pl-1`), NOT right-aligned.

---

## Local Entities vs Cloud Entities

- **`localEntities.X`** — stored in IndexedDB locally, no server sync. Use for: Location, StatusNote, SystemChangeEvent, Alter (in local mode), etc.
- **`base44.entities.X`** — cloud-synced. Use for: FrontingSession, EmotionCheckIn, Activity, AlterRelationship, etc.
- `localEntities` is a Proxy — any entity name works automatically.

---

## Critical: Data Backup / Restore Coverage

`src/components/settings/DataBackupRestore.jsx` defines which entities are backed up. **Every new local entity that holds user data must ship in the same commit as its backup wiring.** Treat "added to ENTITY_NAMES + assigned to a category" as part of the entity's definition of done.

**Two arrays must be updated together — getting only one wrong silently drops the entity from exports:**

1. `ENTITY_NAMES` — the raw allow-list (gates which entities `getFullDbDump` will read).
2. `EXPORT_CATEGORIES` — the user-facing checkbox grid. **The export iterator walks `EXPORT_CATEGORIES[].entities`, NOT `ENTITY_NAMES`.** An entity that's only in `ENTITY_NAMES` will never be exported. (This is exactly what happened with `GroceryItem` pre-v0.9.1 — registered but uncategorized, so user grocery lists were silently dropped from backups for months.)

If the entity doesn't fit an existing category, add a new `EXPORT_CATEGORIES` entry rather than lumping unrelated things together.

**Device-specific entities are intentionally excluded** — `FriendIdentity` (the user's friend-server identity, tied to a single browser), `PushSubscription` (per-browser push registration). Restoring them on a different device causes collisions or impersonation. If you add another device-bound entity, leave it out of both arrays AND document the exclusion in the comment block above `ENTITY_NAMES`.

---

## Critical: Keep the Feature Tour Up to Date

**Every new feature or changed UI must be reflected in `src/components/onboarding/FeatureTour.jsx`.**

Rules:
- When adding a new page or major component, add at least one tour step for it in the correct section.
- When renaming, moving, or removing a UI element that is referenced in a tour step, update that step's `title`, `body`, `target` (data-tour attribute), and `route` accordingly.
- When adding a new `data-tour="…"` attribute to an element, add the matching tour step in `buildSteps()`.
- Tour steps must use `t.` terms (never hardcode "alter", "system", "fronting", etc.).
- Tour accuracy matters — never describe a feature differently from how it actually works (e.g. correct icon names, correct field locations).
- The tour is the user's primary onboarding resource. Stale steps erode trust.

---

## Critical: Keep the Changelog and Version Up to Date

**Whenever a feature, improvement, or notable fix ships, add an entry to `src/lib/changelog.js` AND bump `APP_VERSION` in `src/lib/appVersion.js`. Both are non-negotiable — do them in the same commit as the user-visible change, every time, no exceptions.**

Versioning rules:
- Bump PATCH (`0.5.0 → 0.5.1`) for fixes, small improvements, and most changes — this is the default.
- Bump MINOR (`0.5.x → 0.6.0`) for a meaningful new feature block (e.g. "to-do integration", "header redesign").
- Bump MAJOR (`0.x.y → 1.0.0`) only for big direction shifts.
- The version is shown in Settings upper-right next to an "alpha" chip. Testers reference it when reporting issues, so keep it accurate.

Rules:
- Add a new date block at the top of the `CHANGELOG` array when starting a new session's work.
- Use `type: "feature"` for new capabilities, `"improve"` for enhancements, `"fix"` for user-visible bug fixes, `"hotfix"` for minor/internal fixes (brief text only).
- For hotfixes, write "Hotfix: [brief description]" — no need for detail.
- For larger features, write 1–2 sentences describing what the user can now do.
- Do not add entries for refactors, renames, or changes that have no user-visible effect.
- The changelog is shown in Settings → Recent Updates — keep it user-facing, not technical jargon.
- **Every single commit that changes behaviour visible to the user must include a changelog entry. No batching. No "I'll add it later". If you forgot, add it now before the next task.**
- **Bug fixes always get a changelog entry** — even small ones. Crashes, wrong text, broken interactions — all count.
- **Terminology fixes count** — if text was hardcoded and now uses user terms, log it.

What always needs a changelog entry:
- New settings sections or pages
- New data entities or logging types
- UI/UX behaviour changes visible to the user
- Onboarding changes
- Any bug fix the user would notice (crashes, broken buttons, wrong labels, missing UI)
- Terminology corrections in user-facing text

---

## Build Targets — Web, TWA, Native (post v0.11.3)

Single React codebase, three build targets. Native work must be **purely
additive** — every web-only code path stays untouched unless a runtime
`isNative()` branch is needed.

| Target | Built by | Distributed via | Background tasks? |
|--------|----------|-----------------|-------------------|
| Web PWA | `npm run build` → Vercel | `oceans-symphony.vercel.app` | No |
| Bubblewrap TWA | Existing Bubblewrap pipeline against the Vercel deploy | Existing Play Store listing | No |
| Capacitor native (Android) | `npm run build && npx cap sync android && npx cap open android` | **Separate** Play Store listing under `app.oceans_symphony.nativeapp` | Yes (Phase 3+) |

Rules for keeping the targets healthy:

- **Branch at runtime, not at build time.** Use `isNative()` /
  `getNativePlatform()` from `src/lib/platform.js`. Do NOT sniff the
  user agent. Do NOT add separate entry-point files for the native
  build.
- **Native-only dependencies must be dynamically imported inside an
  `isNative()` guard** so Vite tree-shakes them out of the web bundle
  (e.g. `if (isNative()) { const { Filesystem } = await import('@capacitor/filesystem'); … }`).
- **`server.url` must never be set** in `capacitor.config.ts`. The
  Capacitor build bundles web assets into the APK; pointing at the live
  Vercel URL would kill offline behaviour and skip the native-bridge JS
  injection.
- **The native app's package id (`app.oceans_symphony.nativeapp`) is
  distinct from the TWA's id(s) in `public/assetlinks.json`**, so the
  two apps can co-exist on the Play Store and on user devices. Do not
  change the TWA id; do not point the native app at a TWA id.
- **PWA / TWA non-regression is non-negotiable.** At every native phase,
  the `git diff` of web-only code paths must remain empty or very near
  empty.

See `/root/.claude/plans/is-there-any-way-glowing-wand.md` for the full
phasing plan.

---

## User Data Preservation — Non-Negotiable

**User data must never be silently lost or overwritten. People should be able to keep their data always and forever — that is the contract this app makes.** Every implementation, refactor, and bug fix must protect this. Specific rules:

- **Never replace/overwrite existing records** when the intent is to add new ones. If a feature is a "log" (statuses, locations, check-ins, etc.), always `create` new records — never `update` old ones.
- **Never delete user data** as part of a migration or refactor. If old storage format is being replaced (e.g., localStorage → entity), keep reading the old format as a fallback; only stop writing to it.
- **Schema changes**: When adding fields to existing entities, default existing records gracefully (optional fields, null defaults). Never make changes that would corrupt or lose existing records.
- **Before removing a data source**: Confirm the new source is fully populated and the old source has no unique data the user hasn't already migrated.
- When in doubt about a destructive operation — **ask the user first**.

### Storage Layer Invariants (post v0.11.0 — do not regress)

These rules came out of a critical bug where encrypted data became unreachable overnight after a localStorage wipe (Android device cleaners). They apply to everything that touches `localDb.js`, `storageMode.js`, `App.jsx`'s boot path, `StorageModeSetup.jsx`, `UnlockScreen.jsx`, `RecoveryScreen.jsx`:

- **Never silently return `_db = {}` when stored data exists.** If data is on disk but unreadable (encrypted with no key, corrupted JSON, missing salt, IDB error), `initLocalDb` MUST throw a typed error (`EncryptedDataWithoutKeyError`, `CorruptedDataError`, `MissingSaltError`, `StorageReadError`). The boot path catches these and routes to `RecoveryScreen` — never to `firstrun` and never to a half-loaded dashboard.
- **Never trust localStorage alone to decide "first run".** Use `peekStoredData()` from `localDb.js` — it checks IndexedDB directly. Android cleaners regularly wipe localStorage while leaving IndexedDB intact; routing those users back into setup destroyed their data.
- **Never swallow init errors with `.catch(() => setSetupState(null))`.** Surface every init failure to the user via the recovery screen.
- **Encryption metadata (flag + salt) MUST be persisted alongside the encrypted payload**, not only in localStorage. `saveDb()` embeds `__salt` inside the `__encrypted` envelope so a localStorage wipe alone can't make data permanently undecryptable. Never break that — the salt + ciphertext are an inseparable pair.
- **`requestPersistentStorage()` runs FIRST on boot**, before any storage read. Don't move it later in the sequence.
- **`StorageModeSetup` must check `peekStoredData()` before completing setup.** If data exists, refuse to overwrite and instruct the user to reload. App.jsx's boot path should never reach setup when data exists — the check is defence-in-depth.
- **Recovery actions that destroy data (reset, fresh start) must always save a raw copy to Downloads first.** `RecoveryScreen.handleReset` writes the raw blob (including encrypted ciphertext) before `loadDbDump({})`. Don't add a "fast reset" path that skips the backup.
- **`getDb()` throws if called before `initLocalDb` completes.** Don't reintroduce a synchronous `_db = {}` fallback — the previous one let early callers seed an empty in-memory DB that would overwrite real data on the next save.

### When you change anything in this layer

1. Verify the boot path against the seven scenarios: (a) brand-new user, (b) returning unencrypted user, (c) returning encrypted user with intact localStorage, (d) returning encrypted user with wiped localStorage, (e) returning user with corrupted IDB JSON, (f) returning user with missing salt, (g) returning user with IDB read error.
2. None of those scenarios should ever land on `firstrun` if data exists, ever silently empty the DB, or ever overwrite the on-disk blob without explicit user confirmation.
3. Add a changelog entry every time, even for a small refactor in this area — testers need to know.
