# Oceans Symphony — Function Atlas

*What this instrument does and why. Ground-truthed by a full code sweep
(July 30 2026, v0.94.x): every route, every entity write path, every engine in
src/lib and src/hooks. Function language throughout — no layout, no aesthetic,
no page names inherited as structure. This is the source of truth for UI v2:
the UI's job is to expose THIS, densely, legibly, accessibly; personality
belongs to the user's customization layer.*

---

## I. PURPOSES — why the instrument exists

1. **External memory.** Amnesia is assumed. The instrument remembers what the
   system can't carry across switches, and every cross-reference lands
   oriented (scroll-to + highlight), never dumping the user somewhere.
2. **Know who's here.** Presence is ambient context for everything; when it's
   unclear, the instrument helps figure it out — never guesses for you.
3. **Every member is real.** Full identity records, self-expression pages,
   relationships, history, places — for each member, forever.
4. **Capture the moment cheaply.** Any log entry in ≤2 gestures from
   anywhere; edit-after is always possible; nothing captured is ever lost.
5. **Keep commitments visible.** Plans, tasks, and routines that never
   silently vanish — unresolved things persist until the user resolves them.
6. **Talk to each other.** In-system communication with real authorship,
   privacy between members, and decisions made together.
7. **Get through the hard moment.** Support reachable from anywhere in one
   gesture, calm and low-stimulation, with a personal crisis plan.
8. **See the patterns.** Reconstruct any day; compute what's usual FOR YOU
   (confidence-gated baselines, never bogus numbers); narrate what matters.
9. **Share on your terms.** Tiered, per-field, per-friend, E2E-encrypted
   sharing; clinician reports with per-entry pruning; full-fidelity exports.
10. **Belong to the user.** Vocabulary, appearance, layout, catalogues,
    gestures — all rewritable. Data is local, portable, and recoverable.

---

## II. FUNCTION INVENTORY

### F1 · Presence & switching
- Track concurrent fronters as individual sessions (start/end/primary/
  co-front), with per-session notes, emotions, symptoms, trigger metadata
  (user-defined trigger categories), and gesture source.
- One-gesture presence ops from cards anywhere: toggle front, replace front,
  toggle primary (tap / swipe right / swipe left / corner-swipe / long-press
  — a unified recognizer with optimistic writes).
- Post-hoc: flag current switch as triggered; journal a switch; edit past
  sessions; per-alter session entries (note/emotions/symptoms) editable later.
- Hygiene: stale-open-session detection (>48h) with a review flow; one-time
  broken-session cleanup; end-all-active.
- Optional presence inference: derive who was present from authored content
  (mentions, journal authorship) within a configurable window (30m–6h) —
  synthesized sessions, clearly separate from tracked ones.
- Session sweep + "merge meeting participants into the active front"
  (additive, dedup-safe).

### F2 · Identification (who is fronting?)
- **Guided unblending**: answer discriminating questions (color with distance
  matching, multiple-choice, pronouns/role/age/custom-field, dominant-feeling
  from real emotion history); time-of-day baseline from fronting history;
  score-ranked "likely fronters"; shuffle/skip/restart; grounding-break nudge
  after repeated "I don't know".
- **Question curation**: user-authored questions with per-option alter
  assignment; customize (clone+hide) or hide any built-in; restore hidden;
  per-custom-field visibility.
- **Proactive seeding**: answer questions while grounded and write the
  answers back into real member fields; optional live sync to the current
  front while answering.
- **Unidentified presences**: record a sensed presence (label/color/emoji/
  vibe/relationship), count sightings, get similarity suggestions against
  existing members, merge duplicate presences, or promote one into a member.

### F3 · Members & structure
- Member records: names/alias/display, pronouns, role, age, birthday, origin
  year, color, emoji, avatar + banner (with per-role rotating image pools:
  random or sequential), rich bio (sandboxed user CSS), tags, custom fields
  (system-wide definitions + ad-hoc per-member), archive (never delete-only),
  pin, import-dedup ids from five other apps.
- Member sub-records: notes, member-to-member direct messages, per-member
  boards, preferences/boundaries (comfort scales), important dates.
- Groups: nested tree (cycle-guarded), colors, avatars, group bios + profile
  styling, membership, per-group config flags (hide from analytics / maps /
  archived members), group-scoped board + notes, re-parent by drag, orphan
  rescue ("move all to root").
- Subsystems: any group owned by a root member; own profile surface.
- Relationships: typed directed/undirected edges with strength/label/color/
  notes; user-editable nested type catalogue with defaults.
- Lineage: fusion / split / dormancy / return / emergence events (year-only
  supported), hide/unhide, system birth date; splits auto-create "Split from"
  edges; absorption folds the absorbed member's stats into the absorber.
- Inner world: multiple maps → layers (visibility/lock/order) → locations
  (shapes, colors, images, link-to-map/layer, position lock) + free image
  props + member placements; location profiles with styling; accessible
  list-view equivalent of the canvas.
- Merging: merge one member into another rewriting every reference;
  duplicate finder for imports.

### F4 · Capture (the moment log)
Shared grammar: timestamp + payload + attribution (member(s)/system) +
optional note; all append-only; all editable after the fact from the
chronological log; all reachable in ≤2 gestures (quick actions, action bar,
command strip, OS launcher shortcuts).
- Emotions: multi-emotion check-in with per-emotion member attribution,
  severity, distress flag (→ support handoff), category vocabulary
  (renameable roots + custom emotions).
- Symptoms/habits/context: user-curated catalogue (yes-no or 0–5 rating,
  polarity ↑good/↑bad, bipolar −2..+2 scales with anchors, colors, ordering,
  archive; preset bundles installable; legacy-catalogue migration with
  overlap detection). Point check-ins AND running episodes
  (start/stop/severity snapshots).
- Status notes: immutable system-wide statuses.
- Locations: category + place + optional GPS with nearby-name autofill;
  day-grouped history; open-in-maps.
- Sleep: start-now / end-with-quality (interruptions, nightmare, dreams →
  linked dream journal entry), retroactive logging, month stats; linked
  activity record.
- Activities: log past (calendar range-drag or form), run live concurrent
  timers, per-activity members/contacts/location/notes/emotions.
- Company: contact encounters (start/end "I'm with them", elapsed,
  last-together).
- Diary cards: templated daily structured entry (user-defined sections/
  fields, completion %).
- System meetings: guided 5-step ritual (arrive/notice/greet/share/close)
  with per-participant emotions+symptoms+notes, an open dialogue (storable on
  the meeting or routed into a real chat channel), draft persistence, and
  writes that fan out to emotion check-ins + the active front.
- Inline command language: slash-commands inside any text field create real
  records (symptom/contact/activity/emotion chips), caret-aware suggestions.

### F5 · Commitments
- Scheduled plans: lifecycle scheduled → done/partial/skipped/cancelled
  (valid-transition state machine), recurrence with per-instance branch
  editing (this / this+future / all), reschedule history, per-plan reminder
  offsets, critical pinning with a lead-step ladder (dismissal-per-step),
  past-due grace, unresolved-plan surfacing that nags until resolved.
- To-dos: priority, due/scheduled dates, subtasks, goal quantities, urgency,
  pin-to-dashboard, category links; completion stamps a date (feeds
  analytics/triggers); renders as synthetic blocks on the activity calendar.
- Routine scaffolding: daily/weekly/monthly/yearly templates; manual or
  auto-completing via 36 derivation triggers (pure re-evaluation from live
  data — capture, system-life, social, creation, customization, care,
  hygiene, meta categories); XP → levels; streaks with milestones;
  retroactive period review grid.
- Weekly per-category activity goals with progress.
- KNOWN DEBT (consolidation proposal pending): five task-creation paths, no
  completion sync across the plan↔to-do link, no carry-over affordance.

### F6 · Writing
- Journals: rich text, folders as nested paths (rename cascades, delete
  never destroys entries), tags, per-member or co-authored attribution,
  switch-log entries, member mentions (navigable chips), author/fronter
  filtering (incl. live "track current fronters" mode), search.
- Long check-in notes auto-promote into linked journal entries (>50 words).
- Guided-exercise responses (Learn reflections) stored with history;
  three of them ARE the safety plan's sections.
- Drafts autosave per-form and restore (meetings, journals, bulletins,
  check-ins).

### F7 · Communication (in-system)
- Chat: channels in a nested category tree (colors, collapse, drag-reorder),
  private channels (member-gated, blurred name, fronter-gate with explicit
  override), multi-author messages via customizable signpost characters,
  replies, threads, reactions, pins, @mentions, whispers (`/w`, member-
  scoped visibility), soft delete, edit, deep-link to message.
- Bulletins: board posts with multi-author attribution frozen at post time,
  reactions, unlimited-depth comment threads, pins, task-bulletins,
  spoiler/whisper rich content.
- Polls: 2–8 options, per-member voting or anonymous tally mode (with
  decrement), multi-voter "voting as" defaulting to current front, option
  editing with vote migration warnings, pin to board, close, delete.
- Mentions/notifications: every mention writes a log row with source type +
  navigate path + preview; authored-by logs make "who wrote this" queryable;
  one notification inbox + live toasts, all deep-linking with orientation.

### F8 · Contacts (outside people)
- Directory with safety levels (renameable, recolorable), awareness
  categories, pinning, archive; emergency-support quick-dial (call/text/
  email).
- Per-contact: boundaries & system-rules, notes, relationships to members,
  custom fields, encounter history (time-together).

### F9 · Support & safety
- Grounding: technique catalogue (defaults + user-authored), guided runs
  with rating/favorites/notes/member attribution, breathing exercises
  (patterns, round counts, animation), state-check flow ("help me figure out
  what I need" → suggestions with reshuffle; crisis resources when crisis
  selected).
- Distress pipeline: distress-flagged emotions offer grounding immediately;
  emotion→grounding-state mapping is user-configurable.
- Floating access: draggable bubble on every screen (hideable/re-enable);
  triple-tap panic → privacy cover.
- Safety plan: warning signs / coping cards / window-of-tolerance, authored
  in Learn lessons, readable fast; crisis resources always reachable.
- Learn: psychoeducation modules with reflections, needs check-ins, and
  "try this technique now" handoffs; progress tracking.
- Medical disclaimer on every clinical-adjacent surface.

### F10 · Insight
- **Timeline**: infinite day-by-day reconstruction across 20+ record types,
  six toggleable layers, date jump, annual important-date markers.
- **Baselines engine**: personal means (optionally per-weekday), ±15% "about
  usual" dead band, trend direction, confidence gating (insufficient data →
  "not enough yet", never a fake number).
- **Fronting math**: front share (flat/weighted), co-front pairs + matrix,
  switch-timing heatmaps, session texture buckets, reconnection lists
  ("hasn't fronted in N days"), recovery-time-after-switch, absorption-aware.
- **Wellbeing correlations**: factor→distress (sleep, activity categories,
  contact time), what-happens-after-distress windows, pre-switch symptom
  signatures with live early-warning matching, symptom↔symptom and
  member↔symptom correlations, trigger→symptom chains.
- **Life**: activity by category vs prior period, plan follow-through
  (by category / time-of-day / weekday, 8-week trend, contrasting-pattern
  finder), goals progress, top locations, contact time.
- **Per-member fingerprints**: characteristic emotions/symptoms/activities/
  times; attribution of untagged records by who-was-fronting-at-T.
- **Narration**: ranked prose insight cards (tone-aware), a spotlight,
  weekly narratives, clinician-register summaries.
- **Group lens**: re-express any analytic at group level; hide-from-
  analytics flags respected.
- **Search**: one index over ~28 record types incl. custom-field values and
  chat with channel context; date-aware ("last tuesday", "march"); HTML-
  stripped snippets.
- **Reports**: 18 independently includable sections, thresholds, detail
  levels, per-entry pruning preview, anonymization, cover page, PDF + plain
  text, saved templates, append-only export audit log.
- **Tally & day totals**: daily counts of everything.

### F11 · Reminders
- Rule types: scheduled (clock/day), interval, event (absolute + pre-alerts),
  contextual (no-front-update-for-X, emotion-logged-matching-set).
- Behavior: anti-stacking (won't refire while unaddressed), auto-resolve
  when the nudged thing actually happened, quiet hours, snooze options,
  inline actions, per-member scoping with catch-up.
- Delivery lanes: in-app evaluation loop; OS pre-scheduling (14-day horizon,
  64-notification cap, diff-reconciled, closed-app backfill); plan-start
  lane (30-day horizon, per-plan offsets, web timer fallback); optional
  server push (with/without reminder text) that stands down when native
  covers it. Sticky "ongoing" notifications for fronters/symptoms/activity.

### F12 · Sharing & interop
- Friends (the only networked feature, opt-in): identity with display/system
  name; friend codes; requests; per-friend visibility (global override,
  privacy-level threshold slider, per-member hide); 9 shareable member
  fields gated by user-defined privacy levels; front-status sharing
  (names / count-only / hidden; per-fronter name/prefs modes); E2E
  encryption (ECDH per-recipient envelopes) with safety-number verification;
  change notifications; background polling on native; every inbound payload
  sanitized before render.
- Import: PluralKit (API, bidirectional), Simply Plural (file, granular),
  OpenPlural (.zip with media, id-stable round-trip), Octocon, Plural Star,
  Ampersand (.ampar msgpack) — each with match/dedup keys, mode choices
  (add/update/replace), range-windowed front history, and NO invented
  primary flags where the source has no such concept.
- Export: Symphony backup (25 selectable categories, plain/compressed,
  save/share/clipboard-chunked `PART:i:n`, single-category, multi-system
  active/separate/merged-as-groups); Simply Plural-shaped JSON; OpenPlural
  .zip with media; member roster as text/HTML/PDF (detail levels, anonymize,
  group sectioning).

### F13 · Customization (the wardrobe)
- Vocabulary: four base terms → ~24 auto-derived forms (plurals, gerunds
  with CVC doubling and silent-e rules, agent nouns, co-compounds) with
  manual overrides for every derived form; signpost characters; emotion
  category names; relationship/safety/trigger/emotion/symptom catalogues;
  alter-label mode (name/alias/emoji).
- Appearance: 16 shipped palettes + user-saved presets; dark/light/system
  cycle; custom colors with auto-generated dark variants; app + heading
  fonts (curated catalogue, installable extra pack, user-uploaded font
  files); corner mode; wave color (+ per-page override); WCAG contrast
  correction applied to user-picked colors; whole-look presets that capture/
  apply terms + layout + nav + banner together; per-member theme links that
  re-skin the app when they front (theme, fonts, terms, layout, nav).
- Layout: classic dashboard element order/visibility; experimental
  multi-page widget homescreen (registry, spans, display modes, styles,
  wallpaper, drawer folders, action/alters bars, grid density); top bar /
  bottom bar / dashboard grid each independently configurable from a
  30-destination catalogue; upcoming-plans surface selection (6 slots);
  quick actions (17 types) mirrored onto OS launcher shortcuts.
- Per-member expression: profile styling (backgrounds, header themes,
  fonts, opacity, palette override), sandboxed bio CSS, rotating image
  pools, per-member asset folders.
- Per-surface display prefs: ~40 persisted view preferences (grid columns,
  view modes, week start, time format, tally modes, batch sizes…).

### F14 · Privacy & concealment
- At-rest encryption: PBKDF2-600k + AES-GCM, salt embedded with ciphertext,
  session-only password, legacy-iteration fallback, per-item content
  encryption; enabling/disabling re-encrypts every system's vault.
- Panic cover: N-quick-taps anywhere (configurable/off, multi-touch-safe)
  → a REAL working grocery-list app over everything; usable from the lock
  screen (plaintext store); lock-on-close option.
- Anonymize mode: off → names → avatars → all, respected at render sites —
  for screenshots and shoulder-surfing.
- Privacy levels: user-defined tiers gating the 9 shareable fields per
  member, with bulk assignment by group.
- The pre-unlock surface set is minimal by design: unlock, recovery,
  grocery cover, privacy policy.

### F15 · Data stewardship
- Storage: IndexedDB entity store with schemaless CRUD, change subscription,
  typed boot-failure errors routed to recovery (never a silent empty DB);
  persistent-storage requests first; seven boot scenarios honored.
- Multi-system: independent systems in one install (create/rename/reorder/
  delete/switch), shared friend identity across them, cross-system reads
  without switching, whole-registry re-encryption, per-system localStorage
  namespacing with single-system legacy fallback, orphan-blob adoption.
- Rescue: scan every storage location for orphaned/encrypted/empty blobs
  with record counts; adopt or export them.
- Backups: manual + auto (off/auto/reminder; interval; silent-to-Documents
  or share-sheet), one-tap backup, restore modes add/replace with merge
  rules (newer-wins, content-key dedup, closed-session protection),
  pre-delete category backups forced, image + font + preference bundles
  ride along.
- Media: local blob store with SW-served URLs, downscale/recompress on
  upload + bulk recompress, remote-image offline caching, legacy migrations
  (base64→blob, URL schemes, remote→local) with progress.
- Data transparency: per-category counts/sizes, per-category export/delete,
  raw debug dump, device-bound entities listed read-only.

### F16 · Guidance
- First-run: storage choice → disclaimer → trust-first welcome → terms →
  express-vs-custom tracking setup (preset bundles) → resumable setup
  checklist; replayable anytime.
- Feature tour (anchored steps) + per-page first-visit tutorials (toggle,
  reset, per-route seen markers).
- Preview modes: guided demo system (theme-preserving enter/exit) and a
  browsable wiki-as-a-system whose staleness vs the app version is honestly
  surfaced.
- What's-new: typed changelog (feature/improve/fix/hotfix) grouped by date,
  surfaced in-app; version + alpha chip.

### F17 · Ambient & platform
- Orientation: `?highlight=` contract (scroll + halo + param cleanup),
  mention highlights, per-route scroll memory, skip-links + route announcer.
- Gestures: unified card swipes, long-press with click-swallowing, edge
  resize, swipe-back with indicator, undo/redo stacks (50 steps) on profile
  editors.
- Rich content: spoilers, whispers, mentions, internal-link chips — parsed
  and interactive anywhere content renders.
- Background loops (always-on): timezone sync, reminder evaluation + OS
  reconciliation, plan reminders, friends front sync + change notifications,
  daily check-in on open, persistent notifications, resume refresh, front
  session sweep, page-visit decay tracking, fronter-linked theming.
- Platform: web PWA / Android / iOS from one codebase; native adds OS
  notification channels + action buttons, FCM, background friend polling,
  silent Downloads writes, CORS-bypassing HTTP, launcher shortcuts, deep-
  link + notification-tap routing; web falls back gracefully everywhere.
- A11y: font size, app + heading font, reduce motion, high contrast, large
  touch targets, nav-bar height, aggregate a11y mode (single-column,
  list-not-canvas alternatives), contrast halos.

---

## III. CROSS-CUTTING GRAMMARS (what every v2 surface must obey)

1. **Attribution grammar** — any record can carry member attribution
   (single, multi, or system-wide); when untagged, attribution is derivable
   from who-was-fronting-at-T. The UI always offers it and never demands it.
2. **Three lifecycle classes** — append-only logs (capture, sessions,
   mentions, audits), editable records (profiles, plans, posts), config
   catalogues (vocabularies, templates, types). Logs are never overwritten;
   catalogues archive rather than delete.
3. **The orientation contract** — anything that navigates to a specific
   record must land scrolled-to and highlighted, then clean its URL.
4. **Terminology tokens** — every user-facing string containing system/
   member/front/switch vocabulary resolves through the terms engine.
5. **Cycle-guarded trees** — groups, categories, chat categories,
   relationship types, folders: all nested, all guarded, all with orphan
   recovery.
6. **Derivation over firing** — auto-completion, inferred presence, early
   warnings: recomputed from live data, idempotent, never a stored "event
   fired" flag that can drift.
7. **≤2 gestures to capture** — from any screen, any capture type.
8. **Confidence-gated numbers** — analytics show "not enough data yet"
   instead of statistically meaningless output.
9. **Everything findable** — new record types join the search index, the
   backup categories, and (if user-authored) the mention/attribution web.

---

## IV. READOUT — facts the new IA must answer to

- Scale: ~31 routes, ~60 entities, ~28 searchable types, 36 auto-triggers,
  18 report sections, 17 quick-action types, 6 import formats, 4 export
  shapes, ~40 per-surface view prefs, ~30 nav destinations.
- **Burial list** (today reachable ONLY via one sidebar drawer): system
  chat, image assets, contacts, bulletin board, unblending, get-to-know-me.
  A function's reachability should follow its importance, not its history.
- **Dashboard gravity**: the current home page hosts the quick-action
  engine, 10+ modals, the guide, and the system switcher — v2 must
  distribute these into the always-available command layer instead of one
  overloaded surface.
- **Redundancy clusters** to design as single functions with multiple
  views: (a) plans/to-dos/daily-tasks (five creation paths, unsynced
  completion); (b) check-in log vs diary cards vs day tally (three views of
  the day's record); (c) six "upcoming plans" surfaces.
- **The lock-screen set** (unlock, recovery, grocery cover, privacy policy)
  and the **crisis set** (grounding, breathing, safety plan, crisis
  resources, panic cover) are latency-critical paths — measured in taps and
  milliseconds, they outrank everything else in the IA.
- Boot states are surfaces too: firstrun, unlock, recovery, orphan-adopt.

---

*Companion documents: `docs/ui-v2-functional-spec.md` (pillars + delivery
architecture; its §5 aesthetic directions are superseded — the default UI is
a neutral chassis, personality comes from F13), and the three raw sweep
reports this atlas compresses. Next: instrument-model IA proposal built on
§II–§IV, then the chassis.*
