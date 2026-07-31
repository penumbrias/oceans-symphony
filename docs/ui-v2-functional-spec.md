# Oceans Symphony — UI v2 Functional Specification

*The app as if no UI existed: every function and pillar, written as capabilities.
This is the source document for the ground-up UI redesign (July 2026).
Nothing in here names a page, layout, or component from the current UI —
current pages are UI decisions, and UI v2 owes them nothing.*

---

## 1. What the app is

A **local-first companion for plural / dissociative systems**: it remembers what
the system can't always carry across switches — who was here, what happened,
what helped — and gives every member a presence. It is not a medical product;
it supports self-knowledge, day-to-day functioning, and (optionally) sharing
with a therapist or trusted friends.

**The user is a system, not a person.** Every design decision inherits from
this: attribution (who did/felt/wrote a thing) is a first-class dimension;
"account" ≈ system; multiple systems can share one device; the current
fronter(s) are ambient context for nearly every action.

## 2. Pillars (non-negotiable, inherited by any UI)

- **P1 — Data is forever.** Never silently lose or overwrite user data. Logs
  are append-only; destructive actions back up first; storage-layer invariants
  (seven boot scenarios) hold.
- **P2 — The user's words.** All terminology (system, alter, fronting, switch,
  …and their plurals/conjugations) is user-defined. No hardcoded terms
  anywhere, including compound words and tooltips.
- **P3 — Fits the user, not the reverse.** Deep customization: themes, colors,
  fonts, layout, navigation, custom fields/emotions/symptoms, per-alter
  everything. Equally: a user who wants minimal-and-simple gets that without
  wading through the depth.
- **P4 — Amnesia-friendly.** Context is always recoverable: what was I doing,
  who was here, where did that notification come from. Cross-surface
  navigation lands with orientation (scroll-and-highlight); nothing assumes
  the user remembers the last hour.
- **P5 — Local-first, private.** IndexedDB on device; optional passphrase
  encryption; panic-hide cover; anonymize mode for screenshots; network
  features are opt-in and clearly marked.
- **P6 — Accessible.** A11y mode (single column, big targets), adjustable
  text/fonts/nav sizes, reduced motion, screen-reader semantics, contrast
  correction for user-picked colors.
- **P7 — Not medical.** Clinical-adjacent surfaces carry the disclaimer;
  crisis surfaces are calm, low-stimulation, and fast to reach.
- **P8 — One codebase, three targets.** Web PWA, Android native, iOS native.
  Runtime branching only.

## 3. Functions (UI-agnostic inventory)

### F1 · Identity & members
- Maintain a directory of members (alters): identity (names, pronouns, roles,
  ages, colors, avatars incl. rotating pools), rich bios (near-full CSS
  mini-pages), custom fields (system-wide + ad-hoc per member), tags,
  archive state, origin year.
- Organize members: groups/folders, subsystems (nested), per-member asset
  libraries.
- Model relationships between members (typed, directional, with inverses).
- Record system lineage events: fusion, split, dormancy, return, emergence —
  splits auto-create "Split from" relationships.
- Map inner-world places and member locations within them (visual map, layers).
- Per-member boards: notes and message-board posts addressed to a member.
- Preferences/boundaries per member: labeled comfort levels (hate…love scale)
  for foods, topics, touch, etc.; shareable subset.
- "Get to know me" prompts to build out member profiles over time.

### F2 · Presence (fronting & switching)
- Track who is fronting now (multiple concurrently), who is primary, when
  each arrived/left; sessions carry per-member notes, emotions, symptoms.
- Switch metadata: triggered-by (user-defined trigger types), post-hoc switch
  journaling.
- Fast presence changes: set/end fronting in ≤2 gestures from anywhere;
  hold-gestures for power users.
- Optional-ness: front tracking can be de-emphasized for systems that don't
  track (attribution falls back to authored-content).
- Presence history: browsable, correctable (edit past sessions), analyzable.

### F3 · Capture (the moment-to-moment log)
All capture types share one grammar: *timestamp + payload + attribution
(member(s) or system-wide) + optional note* — append-only.
- Emotion check-ins (multi-emotion, intensity, distress flag → grounding
  handoff).
- Symptom tracking: point check-ins and running sessions (start/stop), 1–5 or
  boolean severities, presence-vs-intensity semantics, per-member attribution.
- Status notes (system-wide, immutable, Facebook-status-like).
- Locations (GPS or manual, categorized).
- Sleep (bedtime→wake sessions, quality, dream-journal link).
- Company ("currently with" contacts).
- Activities: past logs and running timers (multiple concurrent).
- System check-ins ("meetings"): structured multi-member check-in with
  diary-card style questions.
- Quick capture must be reachable from anywhere in ≤2 taps (the action bar
  concept), and each capture type must be editable-after via its own log.

### F4 · Commitments (plans, tasks, routines)
*(Known overlap today; v2 treats this as ONE function with three time-shapes.)*
- **Scheduled**: future activities/plans with lifecycle (scheduled → done /
  partial / skipped / cancelled), recurrence with per-instance branching,
  reschedule history, critical-plan pinning, pre-plan reminders.
- **Unscheduled**: to-dos with priority, due dates, subtasks, goal quantities,
  urgency/pinning; completion is a loggable event (feeds analytics/triggers).
- **Routine**: daily/weekly/monthly templates that materialize per period;
  auto-completion derived from actual app data (30+ trigger types); XP/streak
  reward layer.
- Carry-over: unresolved items must be one-tap movable to today/tomorrow
  (bullet-journal), never silently vanishing (the lifecycle pillar).
- Category tree (nested, cycle-guarded) + weekly goals per category.
- Cross-links: a plan may satisfy a to-do; completing either resolves both.

### F5 · Writing
- Long-form journals: rich text, titles, folders (nested paths), per-member or
  co-authored attribution, encryption flag, mentions of members.
- Diary cards: templated daily structured entries (user-defined template).
- Dream journal: sleep-linked entries.
- Switch journals: entries attached to presence changes.
- Reflections: guided prompts from the Learn module.
- (v2 addition, already approved) Journal templates: reusable prompts that
  pre-fill an entry into a target folder.

### F6 · Communication (within the system & out)
- System chat: channels (categorized, private-capable), multi-author messages,
  whispers, mentions, reactions, replies, pins, threads.
- Bulletins: system-wide posts with comments, pins, polls, task-bulletins.
- Notifications: mentions, replies, reminder firings, friend events — one
  inbox, per-item deep links that land oriented (P4).
- Friends (opt-in, networked): mutual adds via codes, share fronting status /
  bulletins / preferences at user-set privacy levels.
- Connectors: import from PluralKit / Simply Plural / Plural Star.

### F7 · Reminders
- User reminders: one-off & recurring, time- or event-based (e.g. after a
  distress emotion), with acknowledge/act lifecycle.
- Plan reminders: lead-time alerts for scheduled commitments.
- Native OS notifications on mobile; in-app fallback on web.

### F8 · Support & safety
- Grounding: technique catalogue (built-in + custom), guided runs, breathing
  exercises with animation, favorites, state-check flow.
- Distress pipeline: distress-flagged capture → offer grounding immediately.
- Learn: psychoeducation topics with reflections and needs check-ins.
- Safety plan: personal crisis plan, fast to reach.
- Crisis resources: hotlines etc., always accessible, low-stimulation.
- Floating access: support reachable from anywhere without navigation.

### F9 · Insight (memory & patterns)
- Timeline: day-by-day vertical view of everything (presence, captures,
  events) — the system's shared memory.
- Analytics: fronting time/shares, co-fronting pairs/matrices, switch timing,
  session texture, reconnection ("haven't fronted in a while"), emotion/
  symptom patterns, activity/plan completion, life-areas balance.
- Tally: daily counts of everything.
- Therapy reports: date-bounded, section-configurable, anonymizable exports
  (builder + saved templates + export audit log).
- Global search: everything findable — every entity, every date format,
  custom fields — with oriented landing (P4).
- Insight spotlights: surfaced patterns worth noticing.

### F10 · Wardrobe (customization)
- Terms (P2), themes/colors/fonts (incl. custom uploads), per-alter theme
  links, appearance presets (capture/apply whole looks), navigation layout,
  dashboard/home composition, quick actions, accessibility, per-surface
  display options, preview/demo modes (incl. the wiki walkthrough).

### F11 · Stewardship (data & device)
- Backup/restore: full & categorized export/import (merge modes that never
  clobber), copy-paste chunked backups, auto-backup, image compression &
  hibernation, "view my data" transparency.
- Encryption at rest (passphrase, recovery paths), storage health & recovery
  flows, persistent-storage requests.
- Multi-system: several systems on one device, per-system settings/storage,
  system switcher.
- Migration: TWA→native, device-to-device.
- Panic-hide (working grocery-list cover) and anonymize mode.

### F12 · Onboarding & guidance
- First-run: trust-first welcome, storage choice, disclaimer, express vs
  custom setup, preset catalogues (symptoms/emotions/bundles), terms setup
  with full pluralization control.
- Setup checklist (resumable, per-system), feature tour (anchored steps),
  wiki preview mode, "what's new" changelog surfaces.

## 4. Proposed information architecture (v2)

Functions group by *intent*, not by entity. Six spaces + two overlays:

| Space | Answers | Draws on |
|---|---|---|
| **Now** | "What's happening / do the thing" | F2 presence, F3 quick capture, F4 today's commitments, F9 spotlights, F6 notifications |
| **Track** | "Log it / see my logs" | F3 all capture types + their histories, F4 full commitments, F7 reminders |
| **System** | "Us" | F1 members/groups/map/lineage, F6 chat/bulletins/friends |
| **Write** | "Words" | F5 all writing |
| **Reflect** | "What does it mean" | F9 timeline/analytics/reports/search |
| **Care** | "Help, now or later" | F8 grounding/learn/safety plan |
| *Overlay: Quick capture* | reachable everywhere (action bar / gesture) | F3, F4 |
| *Overlay: Wardrobe & stewardship* | settings, rarely daily | F10, F11, F12 |

Principles: five-or-fewer primary destinations visible at once; every space
has one obvious primary action; old routes 301 into the new structure so
nothing breaks; search and notifications are global chrome, not space
citizens.

## 5. The default chassis (SUPERSEDES the earlier "design directions")

*Owner decision (July 30): aesthetics are the LAST priority. Because deep
customization is the core tenet, the default UI is a neutral chassis —
basic architecture in service of function, usability, and accessibility.
The reference point is an instrument (the Fallout wrist computer): a
swiss-army-knife resource guide you operate, not a personified companion
app. Personality is delivered entirely by the customization layer (Atlas
F13); the chassis itself has none.*

Chassis principles:
- **Function density over whitespace theatre.** Screens are registers of an
  instrument: summaries before detail, state encoded in form (pills, LEDs,
  counts), everything glanceable, nothing decorative.
- **Neutral by construction.** System font stacks, the user's theme tokens,
  no display typography, no mood. If a default screen has an identifiable
  "style", it's wrong.
- **Operable, not narrated.** Controls say what they do; the instrument
  never talks *at* the user. Power operations (gestures, commands, the
  inline log-command language) are first-class, with visible equivalents
  for every gesture (a11y).
- **Accessibility is the floor, not a mode.** The chassis meets WCAG at
  default; a11y mode only simplifies structure further.
- **Latency-critical paths win.** Crisis set and capture grammar are
  measured in taps; chrome exists to keep them ≤2 gestures away.
- **The atlas is the checklist.** `docs/function-atlas.md` §II–§IV is the
  authoritative inventory the chassis must expose; §III's grammars are
  non-negotiable behaviors.

## 6. Delivery architecture

- **`ui_v2.enabled` toggle** on SystemSettings (same pattern as
  `experimental_home`): app-wide parallel shell (`src/v2/`), own router
  outlet, own design system (`src/v2/ds/` tokens + primitives), consuming the
  existing data layer/hooks untouched. Old UI remains default until parity.
- **Migration ladder**: shell + Now → Capture flows → Track logs → System →
  Write → Reflect → Care → Wardrobe/Stewardship parity → default flip →
  v1 retirement. Each rung ships behind the toggle; testers opt in per rung.
- **Parity ledger**: a checklist in this doc's sibling
  (`docs/ui-v2-parity.md`, created when the shell lands) tracking every F#
  capability → v2 status, so nothing is lost in translation (P1 applies to
  features too).
- The experimental homescreen's lessons (registry, spans, styles, edit
  gestures) inform the **Console** direction and v2's home regardless of
  direction chosen; its code is a donor, not a constraint.

*Next steps: interactive 3-direction mockup → owner picks/blends a direction
→ design-system spec (tokens, primitives, motion, voice) → v2 shell + Now
space vertical slice.*
