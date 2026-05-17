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

## Routing Gotcha — `/Home` is NOT the home page

The route names are a base44 leftover and don't match what the user (or
the bottom-nav labels) call them. Renaming would touch too many places
to be worth the risk this late, so internalise the mapping:

- **`/`** → `Dashboard.jsx`. This is the actual home page — the thing
  users (and the "Home" bottom-nav tab) think of as "Home". Pinned
  bulletins, critical-plan banners, and any "home_top" / "home_bottom"
  UpcomingPlans surfaces belong here.
- **`/Home`** → `Home.jsx`. This is the **alters directory** — the
  page reached by the "Alters" bottom-nav tab. Its own header comment
  describes it as "the alters directory and doesn't need to
  double-surface" Dashboard items.

Implications:
- `SURFACE_HOME_TOP` and `SURFACE_HOME_BOTTOM` in
  `src/lib/upcomingPlansSurfaces.js` refer to the **Dashboard** in the
  user's mental model, despite the `home_*` ids. Their Settings labels
  should say "Dashboard", not "Home" — fix any hint text that still
  says otherwise.
- If you find Dashboard-style features being rendered on `Home.jsx`,
  that's a regression worth fixing — move them to `Dashboard.jsx`.
- Don't propose renaming `/Home` → `/alters` to the user — they've
  considered it and explicitly rejected it as too disruptive given how
  many references point at the route id.

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

**Whenever a feature, improvement, or notable fix ships, three files move together in the SAME commit as the user-visible change — every time, no exceptions:**

1. `src/lib/changelog.js` — add an entry under a new (or current) date block.
2. `src/lib/appVersion.js` — bump `APP_VERSION`.
3. `android/app/build.gradle` — bump `versionCode` (strictly greater than the last Play upload — Play rejects duplicates) AND set `versionName` to match the new `APP_VERSION` string.

Skipping (3) means the next native build either gets rejected by Play (duplicate `versionCode`) or ships with a `versionName` that lies about which release it is — both happened during the early native rollout and cost real time. Treat the build.gradle bump as part of the release checklist, not a follow-up PR.

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
| Web PWA | `npm run build` → Vercel | `oceans-symphony.app` (canonical) / `oceans-symphony.vercel.app` (staging) | No |
| Bubblewrap TWA | Existing Bubblewrap pipeline against the Vercel deploy | Existing Play Store listing | No |
| Capacitor native (Android) | `npm run build && npx cap sync android && npx cap open android` | Shipped as an UPDATE to the existing TWA Play listing (`app.oceans_symphony.twa`) — see migration note below | Yes (Phase 3+) |

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
- **The native app's package id is `app.oceans_symphony.twa`** — the
  same id as the existing TWA Play listing (see
  `public/assetlinks.json`). This was a deliberate change in 0.16.3
  to ship the native build as an UPDATE to the existing internal-
  testing Play listing rather than under a separate co-installable
  listing. Implications:
    1. The TWA Bubblewrap pipeline is effectively shelved going
       forward — testers on Play will auto-update to the native
       build the next time they get the Play Store.
    2. TWA data lives in Chrome's IndexedDB scope for
       `oceans-symphony.app` (the canonical production domain — NOT
       the .vercel.app staging URL; Chrome storage is keyed by origin,
       so anything pointing users at .vercel.app sends them to an
       empty database), NOT inside the TWA package.
       The Play update does not touch Chrome's storage, so users
       CAN still open the URL in Chrome browser to access their
       old data and export a backup before importing into native.
       The first-launch
       `src/components/onboarding/TwaToNativeMigrationModal.jsx`
       explains this path.
    3. Signing key must match the TWA's existing key (Play rejects
       uploads under a mismatched cert fingerprint).
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

---

## App Overview

Oceans Symphony is a journaling and organisation tool built for plural / dissociative systems. It is **not a medical product** — it does not diagnose, treat, or replace clinical care. The first-run `DisclaimerModal` (and the `MedicalDisclaimer` surfaces sprinkled through the Grounding / Support / Resources screens) makes this explicit, and every clinical-adjacent surface re-states it.

It was built by a DID system for their own day-to-day use and shared with the wider plural community as a free, local-first app. The defaults reflect DID/OSDD lived experience, but every term is user-customizable so non-DID systems (median, traumagenic vs endogenic, etc.) can rename "alter", "system", "fronting", "switch" to whatever they actually use.

### Design principles

- **Customizable terminology everywhere.** Use `useTerms()` (from `@/lib/useTerms`) in any component that surfaces the words "system / alter / fronting / fronter / switch / headmate". See the hard rule at the top of this file.
- **Never silently lose user data.** "Storage Layer Invariants" above is non-negotiable — every storage/refactor change has to pass the seven-scenario boot check, and new entities ship with backup wiring in the same commit.
- **Customizable everything where possible.** Themes (`ThemeColorSettings`), navigation layout (`NavigationSettings`), accessibility (`AccessibilitySettings`), terms (`TermsSettings`), quick actions, dashboard pinning, report sections, custom emotions/symptoms/fields — the app's job is to fit the user, not the other way round.
- **Native + web parity from one codebase.** See "Build Targets" above. All three targets (web PWA, TWA, Capacitor native) share `src/`; branching is runtime via `isNative()` from `src/lib/platform.js`, never build-time.
- **Local-first.** Data lives in IndexedDB (`src/lib/localDb.js`). Optional at-rest encryption with a user passphrase (`src/lib/storageMode.js`, `src/lib/localEncryption.js`). No mandatory cloud account. The Friends feature and PluralKit / Simply Plural connectors are opt-in network surfaces.

### Cloud vs local entities (post-base44)

The old base44 SDK has been removed — `src/api/base44Client.js` now exposes `base44.entities` as an **alias for `localEntities`**. Everywhere in the codebase that still writes `base44.entities.X` is reading from / writing to IndexedDB. The distinction between `base44.entities.X` and `localEntities.X` in source is therefore stylistic / historical — both go to the same store. Treat new entity references as `localEntities.X`; leave existing `base44.entities.X` calls alone unless you're touching that line for another reason.

---

## Feature Catalogue

### 1. Dashboard & Navigation

**Purpose.** Single landing surface that surfaces what matters today (current fronters, custom status, pinned bulletins, critical plans, upcoming plans, unresolved plans, tasks, mention/message notifications, quick search, quick actions). See the "Routing Gotcha" section above — `/` is the dashboard ("Home" in the bottom-nav user model), `/Home` is the alters directory.

**Key entities.** Read-only consumer of nearly everything; doesn't own its own entities. `QuickAction` configures the quick-actions menu.

**Primary surfaces.**
- `src/pages/Dashboard.jsx` — the actual home page.
- `src/components/layout/AppLayout.jsx` — top header, bottom nav, sticky chrome, safe-area padding, `GroceryListPanel` overlay mount.
- `src/components/layout/SidebarNav.jsx` / `HeaderWaveBlock.jsx` / `AnnouncementBanner.jsx` / `PullToRefresh.jsx`.
- `src/components/dashboard/*` — `CurrentFronters`, `DashboardPins`, `UpcomingPlans`, `UnresolvedPlansCard`, `CriticalPinnedPlans`, `FeatureTiles`, `GlobalSearch`, `QuickActionsMenu`, `QuickNavMenu`, `TaskWidget`, `MentionNotifications`, `NotificationPopups`, `NotificationHistoryModal`, `PrivateMessagesIndicator`, `NewFeaturesBar`, `BetaTesterBanner`.
- `src/utils/navigationConfig.js` — `ALL_PAGES` master list; static, can't call `useTerms`, so callers resolve labels via the `resolveLabel` pattern (see `NavigationSettings.jsx:131`).

**Cross-feature interactions.** Pulls fronters from FrontingSession, statuses from StatusNote, plans from Activity (scheduled/done), tasks from Task, bulletins from Bulletin, search from `src/lib/globalSearch.js`. Writes nothing directly — every action delegates to the owning feature's modal.

**Gotchas.**
- `/Home` is the alters directory, not the dashboard (see Routing Gotcha at top).
- `SURFACE_HOME_TOP` / `SURFACE_HOME_BOTTOM` in `upcomingPlansSurfaces.js` actually refer to the Dashboard; hint copy should say "Dashboard".
- PRs #99 and #100 fixed Android edge-to-edge safe-area overlaps on the Activity Tracker header and day view — don't re-introduce `pt-[env(safe-area-inset-top)]` on pages where `AppLayout` already reserves it.
- Bottom nav height is user-configurable (`AccessibilitySettings`) — every fixed-position bottom surface (FloatingGroundingButton, etc.) must read the CSS variable, not hardcode `64px`.

---

### 2. Alter Management

**Purpose.** Per-alter profiles — names, pronouns, roles, age, colour, avatar, custom fields (system-wide + per-alter), groups, relationships, lineage events, origin year, archive flag.

**Key entities.**
- `Alter` — the core record. Notable fields: `name`, `pronouns`, `role`, `age`, `color`, `image_url`, `is_archived`, `origin_year`, `groups` (array of group ids), `alter_custom_fields` (per-alter ad-hoc map), and `tags`.
- `CustomField` — system-wide custom-field definitions (one row per field name).
- `AlterRelationship` + `RelationshipType` — directed relationships between alters; `RelationshipType` holds the catalogue (with inverse pairings).
- `Group` — alter groupings / folders.
- `SystemChangeEvent` — fusion / split / dormancy / return / emergence events. See lineage rules at top of this file.
- `InnerWorldLocation` — system map locations.
- `AlterNote`, `AlterMessage` — per-alter notes and DM-style board messages (distinct from system-wide `StatusNote`).

**Primary surfaces.**
- `src/pages/Home.jsx` — alters directory.
- `src/pages/AlterProfile.jsx` — individual profile page.
- `src/pages/GroupsManager.jsx`, `src/pages/SystemMap.jsx`, `src/pages/SystemHistory.jsx`.
- `src/components/alters/*` — `AlterCard`, `AlterGrid`, `AlterGridView`, `AlterEditModal`, `BioEditor`, `FolderGroupsSection`, `FrontersSection`, `GroupFolderView`, `RecordSystemChangeModal`, `profile/`.
- `src/components/system/SystemMap.jsx`.
- `src/components/settings/{CustomFieldsManager,RelationshipTypesManager,ArchivedAltersManager}.jsx`.

**Cross-feature interactions.** FrontingSession references `alter_id`; SystemChangeEvent ⇄ AlterRelationship (a "split" event auto-creates "Split from" relationships, see top rule); Group ids referenced from Alter; AlterNote / AlterMessage tied to alter; Timeline column reads alters per day.

**Gotchas.**
- Avatars stored as `local-image://<id>` URIs (see `src/lib/imageUrlResolver.js`, `src/lib/localImageStorage.js`). Don't write raw blob URLs to `image_url`.
- "Headmate" / "headmates" must NOT appear in user-facing text — replace with `${t.alter}` / `${t.alters}`.
- Archived alters are hidden from most lists but live in `Alter` with `is_archived: true`; `ArchivedAltersManager` is the resurrection UI.
- "Surviving alter" wording is banned for fusion — say "alter that persists".
- Year-only `SystemChangeEvent`s store `new Date(year, 0, 1).toISOString()` with `year_only: true`; render as just the year.

---

### 3. Fronting & Switching

**Purpose.** Track who's fronting, who's primary, when switches happen, what each alter felt during their slot.

**Key entities.**
- `FrontingSession` — per-alter (not per-switch). Fields: `alter_id`, `is_primary`, `is_active`, `start_time`, `end_time`, plus three JSON-string payloads: `note` (`[{ text, timestamp }]`), `session_emotions` (string array), `session_symptoms` (`[{ id, label, value, type }]`). Legacy rows may have `primary_alter_id` instead of `alter_id` + `is_primary`.
- `TriggerType` — user-defined switch triggers.

**Primary surfaces.**
- `src/pages/FrontHistory.jsx`, `src/pages/CoFrontingAnalytics.jsx`.
- `src/components/fronting/{FrontingBar,SetFrontModal,TriggerEditModal}.jsx`.
- `src/components/dashboard/CurrentFronters.jsx`.
- `src/components/timeline/AlterSessionPopover.jsx`.
- `src/components/journal/SwitchJournalModal.jsx`.
- `src/hooks/useSwipeActions.js` — `toggleFrontFor` / `togglePrimaryFor` (the canonical refetch-before-write pattern).
- `src/lib/perAlterSessionEntries.js` — read-only flattener for the JSON-string payloads.
- `src/lib/frontingUtils.js`.

**Cross-feature interactions.** Drives nearly everything: timeline alter column, dashboard "Current fronters", Tally panel attributions, EmotionCheckIn / SymptomCheckIn `alter_id` defaults, JournalEntry attribution, Friends front-sync (`src/lib/useFriendsFrontSync.js`).

**Gotchas.**
- **Always refetch active sessions before mutating `is_primary`.** Closure-captured snapshots become stale during 500ms long-press timeouts and rapid double-taps. Canonical example: `togglePrimaryFor` in `src/hooks/useSwipeActions.js` — fetch fresh, demote every primary not equal to the target, then update. This was the entire 0.16.9–0.16.22 fix arc.
- Per-alter payloads (`note`, `session_emotions`, `session_symptoms`) are JSON-stringified arrays. Don't try to JSON-parse them inside React render — use `parseSessionNote` / `parseSessionEmotions` / `parseSessionSymptoms` from `perAlterSessionEntries.js`. Treat parse failures as "no entries", never throw.
- Legacy `primary_alter_id` rows: when walking sessions, fall back to `s.alter_id || s.primary_alter_id` (see `perAlterSessionEntries.js`). Don't retroactively rewrite legacy rows — it re-buckets old notes onto co-fronters.
- PluralKit and Simply Plural do not have a "primary fronter" concept — imports never mark anyone primary (PR #84 MEDIUM-3/-4).

---

### 4. Activity Planner

**Purpose.** Log past activities, schedule future plans (one-off or recurring), and track plan completion. Activities live in a user-defined nested category tree. The recent Phase-1/2/3 push (0.16.x → 0.17.2) made plans first-class with a lifecycle enum so they no longer silently vanish when the scheduled time passes.

**Key entities.**
- `Activity` — both past logs AND future plans. Fields: `timestamp`, `activity_name`, `parent_category_id`, `duration_minutes`, `actual_duration_minutes`, `status` (enum from `src/lib/activityStatus.js` — `logged | scheduled | done | partial | skipped | cancelled`), `is_planned` (legacy), `recurrence` (config), `recurrence_parent_id`, `reschedule_history` (array of `{ from, to, ts }`), `alter_id`, `notes`.
- `ActivityCategory` — nested via `parent_category_id`. Use `src/lib/categoryTreeUtils.js` helpers for every walk.
- `ActivityGoal` — weekly per-category target.

**Primary surfaces.**
- `src/pages/ActivityTracker.jsx`.
- `src/components/activities/*` — `ActivityDayView`, `ActivityWeeklyGrid`, `ActivityMonthView`, `ActivityYearView`, `ActivityPlanModal`, `ActivityLogModal`, `ActivityEntryModal`, `ActivityDetailsModal`, `ActivityLifecyclePopover`, `ActivityNestingRecovery`, `ActivityPicker`, `ActivityPillSelector`, `ActivityTreeRow`, `ActivityCustomizationMenu`, `ActivityTallyTracker`, `ActivityGoalsPanel`, `PlanCompletionTracker`, `PlannedActivitiesList`, `RecurrenceBranchDialog`, `activityHelpers.jsx`.
- `src/lib/activityStatus.js` — status enum + `statusFor()` derivation.
- `src/lib/categoryTreeUtils.js` — cycle-safe tree walk (`getAncestorIds`, `getChildren`, `getRootCategories`, `hasCycle`, `wouldCreateCycle`, `detectCorruption`, `MAX_RENDER_DEPTH`).
- `src/lib/recurrenceUtils.js` — recurrence expansion / branching.
- `src/lib/planAnalytics.js` — completion-rate aggregation.
- `src/lib/planReminderScheduler.js` — pre-plan native reminders.
- `src/components/dashboard/UnresolvedPlansCard.jsx`, `CriticalPinnedPlans.jsx`, `UpcomingPlans.jsx`.

**Cross-feature interactions.** Plan completion section appears in therapy reports (`reportSections.js → buildPlansSection`); plan reminders go through `planReminderScheduler` with id offsets to avoid colliding with `nativeReminderScheduler`; `ActivityGoal` rollup reads `Activity` rows; Daily Tasks can create synthetic Activity records.

**Gotchas.**
- **Every category-tree walk MUST be cycle-guarded.** Use `categoryTreeUtils.js` — never inline `while (current?.parent_category_id)`. PR #95 (nesting recovery) and PR #101 (self-parent surfacing) exist because one bad row used to brick the whole Activities page indefinitely. Recursive renderers must clamp at `MAX_RENDER_DEPTH`.
- A category that's its own parent is NOT an orphan but is also NOT a root in the naive sense — `getRootCategories` includes self-parented rows on purpose so they remain editable.
- Rescheduling does NOT change `status` (stays `scheduled`); it mutates `timestamp` and appends to `reschedule_history`. There is no `rescheduled` status enum value.
- Legacy rows without `status`: derive via `statusFor(activity)` — past timestamp → `logged`, future → `scheduled`. Don't backfill the column.
- Recurring plan edits offer "this instance / this + future / whole series" via `RecurrenceBranchDialog` — handle all three branches in any edit code path.
- Don't filter category lists inline (`.filter(c => !c.parent_category_id)`); always go through `getRootCategories` so self-parent and orphan rules stay consistent.

---

### 5. Emotion Check-Ins

**Purpose.** Lightweight in-the-moment emotion logging — optionally tied to an alter, optionally tagged with a distress flag that triggers a grounding prompt.

**Key entities.**
- `EmotionCheckIn` — `timestamp`, `emotions` (array), `intensity`, `note`, `alter_id`, `is_distress`.
- `CustomEmotion` — user-defined entries that join the wheel picker's catalogue.

**Primary surfaces.**
- `src/components/emotions/QuickCheckInModal.jsx` — the modal opened from the Dashboard. Save/Cancel pinned at the top of the modal (PR #102); long-press / double-click a Check-In Log row reopens the modal in edit mode.
- `src/components/emotions/EmotionCheckInModal.jsx`, `EmotionWheelPicker.jsx`, `EmotionAnalytics.jsx`.
- `src/pages/CheckInLog.jsx`, `src/pages/ManageCheckIn.jsx`.
- `src/lib/emotionDistress.js`.
- `src/components/settings/CustomEmotionsManager.jsx`.

**Cross-feature interactions.** Distress flag links into Grounding (open the floating grounding button / state-check flow). Emotion data feeds Timeline emotions column, EmotionAnalytics, and `buildEmotionSection` in reports.

**Gotchas.**
- Quick Check-In modal must NOT dismiss on click-outside or Escape — only the explicit X / Save / Cancel buttons close it (testers lost half-filled entries previously).
- Editing a check-in reopens the same modal pre-filled; don't create a new EmotionCheckIn record on save in edit mode, update the existing one.

---

### 6. Symptoms & Habits

**Purpose.** Track recurring dissociative / mental-health symptoms with intensity and per-alter attribution.

**Key entities.**
- `SymptomCheckIn` — point-in-time symptom log with `alter_id`.
- `Symptom`, `SymptomDefinition`, `SymptomSession` — catalogue + session-style grouping.
- `CustomSymptom` (referenced in old surfaces — current model uses `SymptomDefinition`).

**Primary surfaces.**
- `src/pages/SystemCheckIn.jsx`.
- `src/components/symptoms/*`.
- `src/components/timeline/SymptomBar.jsx`, `SymptomSessionPopup.jsx`.
- `src/utils/symptomDefaults.js` — default catalogue.

**Cross-feature interactions.** Symptoms ride along with EmotionCheckIn (Quick Check-In can log both), feed the Tally panel, render in the Timeline symptoms column, and appear in `buildSymptomsSection` of reports.

**Gotchas.** Per-alter attribution is the default — when no fronter is set, attribute to primary; when no primary is set, leave `alter_id` null rather than guessing.

---

### 7. Journaling

**Purpose.** Long-form writing — personal entries, system-wide entries, switch journals, support-resource journals.

**Key entities.**
- `JournalEntry` — main journal records.
- `SupportJournalEntry` — entries written into Grounding / Learn reflection prompts.
- (No separate "switch journal" entity — `SwitchJournalModal` writes to `JournalEntry` with switch metadata.)

**Primary surfaces.**
- `src/pages/Journals.jsx`.
- `src/components/journal/*` — `JournalEditorModal`, `JournalViewModal`, `JournalEntryCard`, `FolderGrid`, `SwitchJournalModal`.

**Cross-feature interactions.** Switch journal modal is opened from the switching flow; journal entries appear in `buildJournalsSection`; support-journal entries surface in `buildSupportJournalsSection` and on the Learn → My Reflections view.

**Gotchas.**
- FrontingSession's `note` payload is a JSON-stringified array (see Section 3 gotcha) — never `JSON.parse` it in render. PR #83's HIGH-5 fixed the "session_symptoms exploded in render" bug; the same lesson applies to `note` and `session_emotions`.
- Mentions inside journal content use `src/lib/mentionUtils.js` + `MentionLog`.

---

### 8. To-do & Daily Tasks

**Purpose.** General task list + daily-recurring task templates that materialise per day. Tasks can link to activities so completing a task counts as an Activity log.

**Key entities.**
- `Task` — ad-hoc to-dos with `title`, `due_date`, `is_complete`, optional `activity_link` (creates a synthetic Activity on completion).
- `DailyTaskTemplate` — recurring task definitions.
- `DailyProgress` — per-day completion record for daily tasks.
- `QuickAction` — user-defined dashboard quick-action buttons; some link to tasks.

**Primary surfaces.**
- `src/pages/ToDoList.jsx`, `src/pages/DailyTasks.jsx`.
- `src/components/tasks/*` — `TaskCard`, `TaskItem`, `TaskFormModal`, `TaskTemplateManager`, `TaskQuickActionsSheet`, `LevelBar`, `PeriodReview`.
- `src/components/dashboard/TaskWidget.jsx`, `QuickActionsMenu.jsx`.
- `src/lib/dailyTaskSystem.js`, `src/lib/dailyTasks.js`.
- `src/components/settings/QuickActionsConfig.jsx`.

**Cross-feature interactions.** `Task → Activity` synthetic linking; `QuickAction` items can be tasks; tasks appear in `buildTasksSummarySection` of reports.

**Gotchas.** Daily tasks materialise per day on first view — don't pre-create rows for years out. Completing a synthetic-Activity-linked task creates a new `Activity` record (don't update an existing one — user-data invariant).

---

### 9. Goals

**Purpose.** Weekly per-category activity targets — surfaces progress against `ActivityGoal.target_hours` on the Activity Tracker.

**Key entities.** `ActivityGoal` — fields `category_id` (or `parent_category_id`), `target_minutes`, `target_hours`, optional weekday scope.

**Primary surfaces.**
- `src/components/activities/ActivityGoalsPanel.jsx`.
- Rolled up inside `ActivityTracker.jsx`.

**Cross-feature interactions.** Reads `Activity` rows where `status ∈ {logged, done, partial}`; reports include goal progress through `buildPlansSection`'s context.

**Gotchas.** `scheduled / skipped / cancelled` activities don't count toward goal completion. `partial` counts at `actual_duration_minutes` if present, else `duration_minutes`.

---

### 10. Timeline View

**Purpose.** Vertical day-by-day visualisation of alters, symptoms, events, emotions, locations, activities, status notes.

**Key entities.** Read-only consumer of: `FrontingSession`, `SymptomCheckIn` / `SymptomSession`, `SystemChangeEvent`, `EmotionCheckIn`, `Location`, `Activity`, `StatusNote`.

**Primary surfaces.**
- `src/pages/Timeline.jsx`.
- `src/components/timeline/*` — `InfiniteTimeline`, `HourlyTimeline`, `DailyTallyPanel`, `SymptomBar`, `SymptomSessionPopup`, `TimelineItem`, `AlterSessionPopover`.

**Cross-feature interactions.** See "Timeline Column Layout" section above for the exact left-to-right column order. `StatusNoteBadge` sits in the time column gutter (`left: LABEL_WIDTH - 22`).

**Gotchas.**
- Time labels left-aligned, NOT right-aligned. Column widths use absolute positioning, not CSS grid.
- Each column only renders if there's data for that day — empty columns collapse.
- Use `LABEL_WIDTH = 44` constant for the time gutter, don't hardcode.

---

### 11. Status Notes

See dedicated section "Critical: Custom Status Notes" at the top of this file. Surface: `src/pages/Dashboard.jsx` (Set-a-new-status field), `DailyTallyPanel` Custom Statuses bucket, `StatusNoteBadge` on Timeline. Reports: `buildStatusNotesSection`.

---

### 12. Location Records

See dedicated "Location Records" section at top. Surfaces: `src/pages/LocationHistory.jsx`, Timeline locations column. Reports: `buildLocationsSection`.

---

### 13. Backup & Restore

See "Critical: Data Backup / Restore Coverage" at top for the ENTITY_NAMES + EXPORT_CATEGORIES rule.

**Additional notes:**
- **Copy/paste backup workflow** (PR #82). In-app browsers like Facebook and Instagram silently block file downloads. `DataBackupRestore.jsx` falls back to a `PART:N:M:<chunk>` text-chunking flow (`splitBackupIntoParts`, `recommendedNumParts` — aim for ~50KB chunks). Restore accepts pasted chunks in either single-blob or multi-part mode.
- **Merge-mode singleton handling for `SystemSettings`** (PR #91). On import-merge, `SystemSettings.list()[0]` would clobber the existing settings row. The fix special-cases singleton entities so merge truly merges. Don't undo this — any new singleton must be handled the same way.
- **Device-bound entities are intentionally excluded** from `ENTITY_NAMES` and `EXPORT_CATEGORIES`:
  - `FriendIdentity` — friends-server identity is tied to one browser; importing it elsewhere causes impersonation collisions.
  - `PushSubscription` — per-browser push registration.
  - Plus localStorage keys `symphony_native_reminder_log_v1` and `symphony_plan_reminder_log_v1` (native OS notification ids that only mean anything on the installing device).
  Document any new device-bound entity in the comment block above `ENTITY_NAMES`.

---

### 14. Encryption & Privacy

**Purpose.** Optional at-rest encryption of the IDB blob behind a user passphrase; recovery flow when something goes wrong; in-public "panic-hide" overlay; per-screen anonymize mode for screenshots.

**Key entities.** No user-facing entities; storage layer + mode metadata only.

**Primary surfaces.**
- `src/lib/storageMode.js`, `src/lib/localEncryption.js`, `src/lib/encryption.js`, `src/lib/localDb.js`.
- `src/components/onboarding/{StorageModeSetup,UnlockScreen,RecoveryScreen}.jsx`.
- `src/components/settings/StorageModeSettings.jsx`.
- `src/components/grocery/GroceryListPanel.jsx` — the panic-hide overlay (a working-looking grocery list with `GroceryItem` / `GroceryFavorite` entities so the cover is real, not fake). Mounted from `AppLayout.jsx`.
- `src/components/alters/AlterGrid.jsx` — screenshot anonymize toggle (`off | names | all`, persisted to localStorage, blurs avatars/names).

**Cross-feature interactions.** Every page sits behind UnlockScreen when storage mode is encrypted. RecoveryScreen handles the seven boot-failure scenarios (see "Storage Layer Invariants" above).

**Gotchas.** See "Storage Layer Invariants" — every rule there is load-bearing. Especially: salt lives **inside the encrypted envelope**, not only in localStorage; never silently return `_db = {}`; recovery writes a raw blob to Downloads before any destructive reset.

---

### 15. Therapy Reports

**Purpose.** Generate a date-bounded summary report for a therapist, with per-section opt-in/out.

**Key entities.** `ReportTemplate` (saved builder presets — name, mode, sections_config, thresholds, cover-page/system/therapist fields, section_options; created/listed/deleted from the Templates panel in `ReportBuilder`) and `ReportExport` (append-only audit log — `date_from`, `date_to`, `mode`, `sections_included`, written on every successful generate in `TherapyReport.jsx`). The report body itself is still rebuilt from raw entities each generate — these two entities only persist the builder config and the export log, not the rendered output.

**Primary surfaces.**
- `src/pages/TherapyReport.jsx`.
- `src/components/report/*` — `ReportBuilder`, `ReportPreview`, `ExportModal`, `NoteworthySettings`.
- `src/lib/reportSections.js` — all `build*Section` helpers (Overview, Fronting, Emotion, Symptoms, Activities, Journals, Diary, Plans, Status notes, Patterns, Alter appendix, Bulletins, Locations, Sleep, Support journals, System check-ins, Tasks summary).
- `src/lib/reportGenerator.js`.

**Cross-feature interactions.** Reads almost every entity; the section-toggle grid in `ReportBuilder` decides which `build*Section` helpers run.

**Gotchas.**
- Plan completion section was added in Phase 3B — keep `buildPlansSection` in sync with the lifecycle enum.
- Anonymize toggle in the builder blurs all alter references — propagate the flag through every helper that surfaces alter names.

---

### 16. Reminders & Notifications

**Purpose.** Two distinct schedulers: user-defined reminders (one-off + recurring) and pre-plan reminders for upcoming activity plans.

**Key entities.**
- `Reminder` — user-configured reminders. Triggers can be time-based or event-based (e.g. "30 min after a distress emotion").
- `ReminderInstance` — materialised firing instances.

**Primary surfaces.**
- `src/pages/Reminders.jsx`.
- `src/components/reminders/*` — `RemindersInbox`, `RemindersManage`, `ReminderEditorModal`, `ReminderInstanceCard`, `ReminderToast`, `RemindersOnboarding`.
- `src/lib/nativeReminderScheduler.js` — native OS notifications for `Reminder` entities (Capacitor).
- `src/lib/planReminderScheduler.js` — native OS notifications for upcoming `Activity` plans.
- `src/lib/remindersScheduler.js` — web-fallback `setTimeout` scheduler while the app is open.
- `src/lib/nativeNotifications.js`, `src/lib/pushRegistration.js`.

**Cross-feature interactions.** Plan scheduler reads scheduled `Activity` rows; user scheduler reads `Reminder` rows.

**Gotchas.**
- **Int31 hash-offset trick.** Both schedulers hash entity ids into positive int31 values for native notification ids. The plan scheduler shifts its hash range so the two schedulers can't collide on the same OS notification slot (see `src/lib/planReminderScheduler.js:104` comment block). Don't change either hash scheme without re-checking the other.
- The native notification-id logs (`symphony_native_reminder_log_v1`, `symphony_plan_reminder_log_v1`) are intentionally NOT in backups — they reference per-device OS state.
- Web fallback only fires while the tab is open. Don't promise users the web build can wake them up.

---

### 17. Quick Support / Grounding / Learn

**Purpose.** In-the-moment crisis support and longer-form psychoeducation for systems.

**Key entities.**
- `GroundingTechnique` — catalogue (built-in defaults from `src/utils/groundingDefaults.js` + user customs).
- `GroundingPreference` — per-user favourites / config.
- `LearningProgress` — per-topic completion / reflection progress.
- `SupportJournalEntry` — reflections written into Learn prompts.

**Primary surfaces.**
- `src/pages/Grounding.jsx` — two tabs (Support / Learn).
- `src/components/grounding/*` — `BreathingExercise`, `BreathingTechniquePicker`, `CrisisResourcesCard`, `CustomTechniqueForm`, `FloatingGroundingButton`, `GuidedTechniqueView`, `StateCheckFlow`, `TechniqueCard`.
- `src/components/support/*` — `LearnSection` (overview → topic → reflections / needs / resources views, state machine via `view` state), `TopicView`, `ModuleCard`, `InteractiveExercise`, `MyReflections`, `NeedsCheckIn`, `ResourcesView`.
- `src/components/shared/MedicalDisclaimer.jsx` — must appear on every clinical-adjacent surface (PR #90).

**Cross-feature interactions.** Distress emotions can trigger the floating grounding button; reflection entries write to `SupportJournalEntry` which surfaces in reports via `buildSupportJournalsSection`.

**Gotchas.** Any new surface that mentions therapy / crisis / clinical concepts MUST embed a `MedicalDisclaimer` (full or compact `<details>` variant). The app is not medical advice — protect the user and the project.

---

### 18. Customization

**Purpose.** Terms, themes, navigation, accessibility, custom emotions/symptoms/fields/relationships/triggers/quick-actions — make the app fit the user.

**Key entities.** `SystemSettings` (singleton) holds terms, theme, navigation layout, accessibility flags, etc.

**Primary surfaces.**
- `src/components/settings/TermsSettings.jsx` — user terminology overrides.
- `src/components/settings/{ThemeColorSettings,AdvancedAppearance,AdvancedAppearanceNew}.jsx` — colours/fonts.
- `src/components/settings/NavigationSettings.jsx` — page ordering, bottom-nav contents (uses `resolveLabel` indirection because `ALL_PAGES` can't call `useTerms`).
- `src/components/settings/AccessibilitySettings.jsx` — bottom-nav height, font size, contrast halo for low-contrast user colours (PRs #89 / #92 / #93).
- `src/components/settings/{CustomEmotionsManager,CustomFieldsManager,CustomTriggerTypesManager,RelationshipTypesManager,QuickActionsConfig,DiaryCardPresetsManager,DiaryTemplateManager,UpcomingPlansSurfacesSection,RemindersSettings,TimezoneSettings,PreviewModeSection}.jsx`.
- `src/lib/useTerms.js` — single source of truth for term resolution + auto-conjugation overrides.

**Cross-feature interactions.** `SystemSettings` is read by virtually everything via `useTerms()` / `useAccessibility()` / `useAnalyticsGrouping()`.

**Gotchas.** `SystemSettings.list()[0]` was a real data-loss source — the singleton merge-mode fix (PR #91) handles this correctly; don't write naive `list()[0]` lookups elsewhere.

---

### 19. Friends & Social

**Purpose.** Lightweight per-system "friends" feature — share fronters / bulletins / polls with mutually-added systems via a small server.

**Key entities.**
- `FriendIdentity` — local-only per-browser identity (`userId`, `secret`, `friendCode`, `displayName`, `systemName`, `terms`, `privacyLevel`). **Excluded from backup** (device-bound).
- `Bulletin`, `BulletinComment` — system-wide posts and comments.
- `Poll` — polls attached to bulletins or standalone.
- `PushSubscription` — per-browser web-push registration (device-bound, excluded from backup).
- `MentionLog` — per-user mention tracking.

**Primary surfaces.**
- `src/pages/Friends.jsx`, `src/pages/BulletinPage.jsx`, `src/pages/Polls.jsx`.
- `src/components/bulletin/*` — `BulletinBoard`, `BulletinCard`, `BulletinComposer`, `BulletinActionMenu`, `BulletinCommentThread`, `PinnedPollCard`, `AuthorsRow`, `MentionAlertBanner`, `TaskBulletinCard`.
- `src/lib/friendsApi.js`, `src/lib/useFriendsFrontSync.js`, `src/lib/useFriendsFrontNotifications.js`, `src/lib/nativeBackgroundFriendSync.js`.

**Cross-feature interactions.** Bulletins surface on the Dashboard; mentions trigger notifications and write to `MentionLog`; front-sync mirrors FrontingSession changes to friends.

**Gotchas.** `FriendIdentity` is the canonical "do not include in backup" entity — restoring it elsewhere would let one device impersonate another.

---

### 20. PluralKit & Simply Plural imports

**Purpose.** One-way import / sync from PluralKit and Simply Plural for users coming from those tools.

**Primary surfaces.**
- `src/components/settings/{PluralKitConnect,SimplyPluralConnect}.jsx`.
- `src/lib/pluralKit.js`, `src/lib/simplyPlural.js`.
- `src/hooks/useSimplyPlural.js`.

**Gotchas.** Neither PK nor SP has a "primary fronter" concept — never mark imported sessions `is_primary: true` (PR #84 MEDIUM-3, MEDIUM-4).

---

### 21. Global Search

**Purpose.** One Dashboard search box that returns hits across every backed-up entity, including alter custom fields, group memberships, dates in multiple formats.

**Primary surfaces.**
- `src/lib/globalSearch.js` — pure-function engine (`buildSearchIndex`, per-type `build<Name>Records`).
- `src/components/dashboard/GlobalSearch.jsx` — UI with `TYPE_LABELS`, `TYPE_ICONS`, `TYPE_ORDER`.

**Adding a new entity.**
1. Add `build<Name>Records({ items, … })` returning `[{ type, id, title, subtitle, path, searchableText, sortDate }]`.
2. Call it from `buildSearchIndex()`.
3. Add label/icon + `TYPE_ORDER` entries in `GlobalSearch.jsx`.

**Gotchas.** `searchableText` is pre-built per record — case-insensitive substring scan, no Fuse/Lunr. Date strings are baked in multiple formats so users can query "March 2025" / "2025-03" / "Mar 12". Don't move filtering into render — keep it in the index.

---

### 22. Onboarding & Tour

**Purpose.** First-run experience + ongoing feature discoverability.

**Primary surfaces.**
- `src/components/onboarding/DisclaimerModal.jsx` — first-run, must be acknowledged.
- `src/components/onboarding/FeatureTour.jsx` — the `data-tour="…"` anchor system. See the "Critical: Keep the Feature Tour Up to Date" rule above.
- `src/components/onboarding/TourModal.jsx`.
- `src/components/onboarding/TermsSetupModal.jsx` — initial term selection.
- `src/components/onboarding/StorageModeSetup.jsx` — pick encrypted vs unencrypted storage.
- `src/components/onboarding/TwaToNativeMigrationModal.jsx` — first-launch migration explainer for users coming from the TWA build (see "Build Targets" section above).
- `src/components/onboarding/{UnlockScreen,RecoveryScreen}.jsx`.

**Gotchas.** Every new `data-tour="…"` attribute MUST have a matching `buildSteps()` entry. Stale tour steps erode trust faster than missing steps.

---

## Entity Reference Table

Alphabetical. "Storage" reflects which Proxy is conventionally used in source (both resolve to IndexedDB; see App Overview).

| Entity | Storage | Purpose | Key fields | Primary readers/writers |
|---|---|---|---|---|
| Activity | base44 | Past logs + future plans | `timestamp`, `activity_name`, `parent_category_id`, `duration_minutes`, `actual_duration_minutes`, `status`, `recurrence`, `reschedule_history`, `alter_id` | ActivityTracker, planAnalytics, reports |
| ActivityCategory | base44 | Nested category tree | `name`, `parent_category_id`, `color`, `order` | categoryTreeUtils, ActivityTracker |
| ActivityGoal | base44 | Weekly per-category targets | `category_id`, `target_minutes` | ActivityGoalsPanel |
| Alter | base44 / local | Alter profile record | `name`, `pronouns`, `role`, `color`, `image_url`, `is_archived`, `origin_year`, `groups`, `alter_custom_fields` | Home, AlterProfile, AlterGrid, almost every consumer |
| AlterMessage | base44 | DM-style board messages per alter | `alter_id`, `content`, `timestamp` | AlterProfile |
| AlterNote | base44 / local | Per-alter notes | `alter_id`, `content`, `timestamp` | AlterProfile |
| AlterRelationship | base44 | Directed alter-to-alter relationships | `source_alter_id`, `target_alter_id`, `relationship_type` | AlterProfile, lineage auto-create |
| Bulletin | base44 | System-wide / friend posts | `content`, `timestamp`, `author_alter_id`, `is_pinned` | BulletinBoard, Dashboard |
| BulletinComment | base44 | Comments on bulletins | `bulletin_id`, `content`, `timestamp` | BulletinCommentThread |
| CustomEmotion | base44 | User-defined emotions for the wheel | `name`, `color`, `category` | EmotionWheelPicker, CustomEmotionsManager |
| CustomField | base44 / local | System-wide custom-field definitions | `name`, `type` | CustomFieldsManager, AlterEditModal |
| DailyProgress | base44 | Per-day daily-task completion record | `date`, `completed_template_ids` | DailyTasks, dailyTaskSystem |
| DailyTaskTemplate | base44 | Recurring task definitions | `title`, `cadence`, `time` | DailyTasks, TaskTemplateManager |
| DiaryCard | base44 | Daily diary card entries | `date`, `fields`, `alter_id` | DiaryCards |
| DiaryTemplate | base44 | User-defined diary card templates | `name`, `fields` | DiaryTemplateManager |
| EmotionCheckIn | base44 | Point-in-time emotion log | `timestamp`, `emotions`, `intensity`, `note`, `alter_id`, `is_distress` | QuickCheckInModal, CheckInLog, Timeline |
| FriendIdentity | local | Friends-server identity (device-bound) | `userId`, `secret`, `friendCode`, `displayName`, `systemName`, `terms` | friendsApi |
| FrontingSession | base44 / local | Per-alter fronting record | `alter_id`, `is_primary`, `is_active`, `start_time`, `end_time`, `note` (JSON-string), `session_emotions` (JSON-string), `session_symptoms` (JSON-string) | useSwipeActions, CurrentFronters, FrontHistory, perAlterSessionEntries |
| GroceryFavorite | local | Frequent-purchase favourites for the cover-overlay grocery list | `name`, `last_used` | GroceryListPanel |
| GroceryItem | local | Cover-overlay grocery list items | `name`, `is_purchased` | GroceryListPanel |
| GroundingPreference | base44 | User grounding config | `favorite_technique_ids` | Grounding page |
| GroundingTechnique | base44 | Grounding technique catalogue | `name`, `instructions`, `category` | groundingDefaults, CustomTechniqueForm |
| Group | base44 / local | Alter grouping | `name`, `color`, `alter_ids` | GroupsManager, FolderGroupsSection |
| InnerWorldLocation | base44 | System map locations | `name`, `description`, `coordinates` | SystemMap |
| JournalEntry | base44 | Long-form journal | `title`, `content`, `timestamp`, `alter_id`, `folder` | Journals, JournalEditorModal |
| LearningProgress | base44 | Per-topic Learn module progress | `topic_id`, `is_complete`, `reflection_id` | LearnSection, TopicView |
| Location | local | GPS / manual location log | `timestamp`, `name`, `category`, `latitude`, `longitude`, `source`, `notes` | LocationHistory, Timeline locations column |
| MentionLog | base44 | Per-user @mention tracking | `target_user_id`, `bulletin_id`, `seen` | Mentions banner, friendsApi |
| Poll | base44 / local | Bulletin polls | `question`, `options`, `votes` | Polls, BulletinComposer |
| PushSubscription | local | Per-browser web-push registration (device-bound) | `endpoint`, `keys` | pushRegistration |
| QuickAction | base44 | Dashboard quick-action buttons | `label`, `icon`, `target` | QuickActionsMenu, QuickActionsConfig |
| RelationshipType | base44 | Catalogue of relationship labels | `name`, `inverse_name`, `is_symmetric` | RelationshipTypesManager |
| Reminder | base44 | User-defined reminders | `title`, `trigger_config`, `cadence`, `is_enabled` | RemindersManage, nativeReminderScheduler |
| ReminderInstance | base44 | Materialised reminder firings | `reminder_id`, `fire_time`, `is_acknowledged` | RemindersInbox |
| ReportExport | base44 / local | Append-only audit log of generated therapy reports | `date_from`, `date_to`, `mode`, `sections_included` | TherapyReport (write-only on generate) |
| ReportTemplate | base44 / local | Saved therapy-report builder presets | `name`, `period_type`, `mode`, `sections_config`, `noteworthy_thresholds`, `include_alter_info`, `show_cover_page`, `cover_note`, `system_name`, `therapist_name`, `confidentiality_notice`, `journal_detail`, `section_options` | ReportBuilder Templates panel |
| Sleep | base44 | Sleep records | `start_time`, `end_time`, `quality`, `notes` | SleepTracker |
| StatusNote | local | System-wide custom status notes (immutable log) | `timestamp`, `note` | Dashboard, Timeline, DailyTallyPanel |
| SupportJournalEntry | base44 | Reflections from Learn prompts | `topic_id`, `responses`, `timestamp` | MyReflections, LearnSection |
| Symptom | base44 | Symptom record (legacy) | `name`, `intensity`, `timestamp`, `alter_id` | SystemCheckIn |
| SymptomCheckIn | base44 | Symptom check-in row | `symptom_id`, `intensity`, `timestamp`, `alter_id` | SystemCheckIn, Timeline symptoms column |
| SymptomDefinition | base44 | Symptom catalogue | `name`, `category` | symptomDefaults, SystemCheckIn |
| SymptomSession | base44 | Grouped symptom session | `symptom_id`, `start_time`, `end_time` | SymptomSessionPopup |
| SystemChangeEvent | local | Lineage events (fusion/split/etc.) | `type`, `date`, `year_only`, `source_alter_ids`, `result_alter_ids`, `fusion_type`, `cause` | RecordSystemChangeModal, SystemHistory |
| SystemCheckIn | base44 | System-wide check-in record | `timestamp`, `alters_present`, `notes` | SystemCheckIn page |
| SystemSettings | base44 / local | Singleton settings record | `terms`, `theme`, `nav_layout`, `accessibility`, `quick_actions_config` | useTerms, useAccessibility, every settings page |
| Task | base44 | Ad-hoc to-do | `title`, `due_date`, `is_complete`, `activity_link` | ToDoList, TaskWidget |
| TriggerType | base44 | Switch trigger catalogue | `name`, `category` | TriggerEditModal |

---

## Common Patterns

- **Always go through `useTerms()`** for any user-facing text touching system/alter/fronting/switch/headmate words. Static configs that can't call hooks (e.g. `src/utils/navigationConfig.js`'s `ALL_PAGES`) defer label resolution to the consuming component (`resolveLabel` pattern in `NavigationSettings.jsx`).
- **Refetch before write** for any FrontingSession primary-state mutation. Canonical: `togglePrimaryFor` and `toggleFrontFor` in `src/hooks/useSwipeActions.js` — `const fresh = await base44.entities.FrontingSession.filter({ is_active: true })`, demote every existing primary not equal to the target, then update. Closure-captured snapshots are stale after 500ms long-press timeouts. The `ActivityLifecyclePopover` should follow the same pattern for any plan-status mutation.
- **`getRootCategories()` for every ActivityCategory tree walk.** Never inline `.filter(c => !c.parent_category_id)`. The helper handles orphans, self-parents, and ordering consistently. Same lesson generalises: when there's a shared helper, use it — drift between call sites is how cycle-bricks happen.
- **`MedicalDisclaimer` on every clinical-adjacent surface.** Use the full component for landing surfaces and the compact `<details>` variant inline for technique cards / topic pages. The app is not medical advice — protect users and the project.
- **Cycle guards + `MAX_RENDER_DEPTH` clamp on every recursive renderer.** `ActivityTreeRow` is the reference. Without these, one bad row bricks the whole page indefinitely (the user can't get back in to delete the bad row).
- **No `setState` inside render. No synchronous IDB reads inside render.** Use `useEffect` + `useQuery`. The bricked-activities bug came partly from race-y in-render mutations.
- **Phase-1-tower pattern for new lifecycle-style features:** persisted status enum (e.g. `activityStatus.js`) → status-aware queries → distinct visual treatment per status → lifecycle popover with terminal-state guards → recovery card surfaced from an error boundary when the data model gets weird. Activity Planner is the worked example; Plans Phase 1 → 3 followed this arc.
- **JSON-stringified array payloads on FrontingSession (`note`, `session_emotions`, `session_symptoms`) must be parsed via the `perAlterSessionEntries.js` helpers**, not inline `JSON.parse`. Treat parse failures as empty arrays. Never write a single-string value into these fields — they're always arrays.
- **Always create, never update, immutable log entries** (StatusNote, Location, EmotionCheckIn outside the explicit edit flow, JournalEntry outside the edit modal). When in doubt, create — the user-data invariant is "never silently lose / overwrite".
- **New entity → backup wiring in the same commit.** Add to `ENTITY_NAMES` AND `EXPORT_CATEGORIES` in `DataBackupRestore.jsx`. If it's device-bound, document the exclusion instead.
- **New feature surface → tour step in the same commit.** Add the `data-tour="…"` anchor and the matching `buildSteps()` entry.

### Alter selection menus

When building a UI that lets the user pick one or more alters, follow the existing pattern in `SetFrontModal.jsx` (the cleanest current implementation — look there first before building from scratch). Specifically: refetch the current-fronters list when the menu opens (`base44.entities.FrontingSession.filter({ is_active: true })` — don't trust a closure-captured prop or the stale `["activeFront"]` query), pre-select current fronters when the menu is for "filter by who's fronting"-style flows, render the alter rows with the same chip/list shape so the UI feels consistent across features, and route every "alter" / "fronter" / "fronting" label through `useTerms()`. The Fronter-view filter dropdown in `Journals.jsx` is another reference implementation (lighter weight — just a popover, no full-screen dialog).

### Running multiple agents in parallel (Claude Code on the web specifically)

Cloud Claude Code sessions share a single working tree between the main agent and any sub-agents dispatched with `run_in_background: true`. When two or more agents touch files that are near each other in the tree (or any agent races with inline `Edit`/`Write` calls from the main agent), the working tree gets yanked between sibling branches mid-edit and unstaged changes silently disappear. This bit several agents in the May 17 burst — see PR #108's environment note.

Mitigations, in order of preference:

1. **Queue agents serially** when their scopes touch overlapping files. Wait for the merge webhook of agent N before dispatching N+1. Slower wall-clock, zero friction.
2. **Dispatch in parallel only when scopes are clearly disjoint** (different feature folders, no shared release-checklist files in flight at the same time). Even then, each agent must `git add` + `git commit` IMMEDIATELY after each `Write`/`Edit` — don't leave unstaged changes lying around for another agent to step on. Spec this explicitly in the prompt.
3. **The main agent should NOT do inline Edits while sub-agents are in flight** unless you're certain the file is outside every active agent's working set. If you need to fix something while agents are running, either wait, or dispatch a fresh agent for it. (Trying to weave inline edits through active agent branches is the exact pattern that produced the most friction.)
4. **When a release-checklist file collision happens anyway**, each agent's "conflict handling" block in its prompt should instruct it to pick the next-available `APP_VERSION` slot above main's current value, mirror `versionCode` + `versionName`, and keep ALL changelog entries during rebase.

If you're dispatching three or more agents and any of them touch shared/release files, default to serial. The wall-clock savings of parallel aren't worth the cleanup time when they collide.

---

## Architectural Why-Explanations

- **Why `/Home` isn't the home page.** Legacy base44 route id. Renaming would touch hundreds of references; users have explicitly rejected the rename. See "Routing Gotcha" above.
- **Why activities use `parent_category_id` instead of flat tags.** The user wanted nested categories (Self-care → Hygiene → Shower) rather than flat tag soup. The nesting model invites the cycle-bricking class of bug, so every walk is cycle-guarded.
- **Why both `base44.entities.X` and `localEntities.X` exist.** Post-base44, `base44.entities` is an alias for `localEntities` — both go to IndexedDB. The dual naming is historical and stylistic; treat them as equivalent. New code should prefer `localEntities`, but don't churn existing `base44.entities` references.
- **Why `SystemSettings.list()[0]` was a real bug.** Singleton entities, when imported in merge mode, would have their existing row clobbered by the first imported row instead of being merged field-by-field. PR #91 fixed this — any new singleton needs the same treatment.
- **Why the storage layer has the seven-scenarios contract.** Android cleaners regularly wipe localStorage while leaving IndexedDB intact. Previously, "no localStorage → first run → empty DB → overwrite real data on next save" bricked encrypted users overnight. See "Storage Layer Invariants" above.
- **Why every category-tree walk has cycle guards.** A single bad parent_category_id (self-parent or cycle) used to throw `<ActivityTreeRow>` into infinite recursion → page blank → user can't open the page to fix the bad row. The guards are non-negotiable defence in depth.
- **Why plans are first-class with a `status` enum rather than `is_planned: boolean`.** Old model derived `is_planned` from `timestamp > Date.now()` — when the scheduled time passed, the plan silently became a "logged activity" that the user never actually did. Tally counts were lying. Phase 1 introduced the lifecycle enum so plans persist past their scheduled time and the user explicitly resolves them (`done | partial | skipped | cancelled`).
- **Why the FeatureTour gets updated on every PR.** Stale tour steps erode user trust faster than missing steps — a step that points at a button that moved is worse than no step at all.
- **Why the Capacitor native build ships as an UPDATE to the existing TWA listing.** See "Build Targets" above — testers auto-update rather than installing a second co-installable app. Implication: data lives in Chrome's IDB scope for `oceans-symphony.app`, not inside the TWA package; the migration modal explains the export-from-Chrome-and-import-here path.
- **Why every release commit bumps three files together.** `appVersion.js`, `changelog.js`, `android/app/build.gradle` (versionCode + versionName) are an inseparable triple. Skipping the gradle bump → Play rejects upload (duplicate versionCode) OR ships a versionName that lies. See "Critical: Keep the Changelog and Version Up to Date" above.

---

## Release Process Summary

1. Make the user-visible change.
2. Bump `src/lib/appVersion.js` `APP_VERSION` (PATCH for most, MINOR for a feature block, MAJOR for direction shifts).
3. Add a `src/lib/changelog.js` entry under the current date block (or new date block at the top if starting a new session's work). Bug fixes always get an entry.
4. Bump `android/app/build.gradle` `versionCode` (strictly > last Play release) AND set `versionName` to exactly match `APP_VERSION`.
5. If a new UI surface was added, add a `FeatureTour` step (and matching `data-tour="…"` anchor).
6. If a new entity was added, add it to BOTH `ENTITY_NAMES` and `EXPORT_CATEGORIES` in `src/components/settings/DataBackupRestore.jsx` (or document the device-bound exclusion).
