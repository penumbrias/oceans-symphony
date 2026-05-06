# Oceans Symphony — Architecture Notes for Claude

## Critical: Always Respect User Terminology

Users can customise the words used for their system, alters, fronting, and switching. **Every piece of new UI must use these terms — never hardcode "system", "alter", "alters", "fronting", "fronter", etc.**

- **Hook:** `useTerms()` from `@/lib/useTerms` — use this in any component that surfaces these words.
- **Available terms:** `terms.system`, `terms.System`, `terms.alter`, `terms.Alter`, `terms.alters`, `terms.Alters`, `terms.front`, `terms.Front`, `terms.fronting`, `terms.Fronting`, `terms.fronter`, `terms.Fronter`, `terms.fronters`, `terms.Fronters`, `terms.switch`, `terms.Switch`, etc.
- **Static configs** (like `navigationConfig.js` `ALL_PAGES`) cannot use the hook — resolve labels at the component level (see `resolveLabel` pattern in `NavigationSettings.jsx` and `termMap` in `AppLayout.jsx`).
- **Tooltips and sort labels** count too — e.g., "Most fronting time first" not "Most fronted first".
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

## Data Backup

`src/components/settings/DataBackupRestore.jsx` defines which entities are backed up. When adding new local entities that users care about, add them to the backup list.

---

## User Data Preservation — Non-Negotiable

**User data must never be silently lost or overwritten.** Specific rules:

- **Never replace/overwrite existing records** when the intent is to add new ones. If a feature is a "log" (statuses, locations, check-ins, etc.), always `create` new records — never `update` old ones.
- **Never delete user data** as part of a migration or refactor. If old storage format is being replaced (e.g., localStorage → entity), keep reading the old format as a fallback; only stop writing to it.
- **Schema changes**: When adding fields to existing entities, default existing records gracefully (optional fields, null defaults). Never make changes that would corrupt or lose existing records.
- **Before removing a data source**: Confirm the new source is fully populated and the old source has no unique data the user hasn't already migrated.
- When in doubt about a destructive operation — **ask the user first**.
