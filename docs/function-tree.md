# Oceans Symphony — Function Tree

Purpose of this document: the complete decomposition of the app from its
broadest purpose down to fundamental functions, as a plain tree. No page
names, no theming, no personification — functions and intentions only.
Basis: the July 30 full-code sweep (see docs/function-atlas.md for the
per-engine detail behind each leaf). This tree is the starting point for
optimizing the app's structure; nothing in the current UI layout is assumed.

Root definition: **a private, local-first life-management aid for
dissociative/plural systems — diary, tracker, organizer, and safety tool
in one.** Guiding constraints at every node: safety-forward, deeply
customizable, accessible, data never lost, user's own vocabulary.

```
OCEANS SYMPHONY — private life-management aid for dissociative systems
│
├── 1. IDENTITY — who the system is
│   ├── 1.1 Member records
│   │   ├── 1.1.1 Core identity — names, alias/display, pronouns, role, age,
│   │   │         birthday, origin year, color, emoji
│   │   ├── 1.1.2 Visual identity — avatar, banner, rotating image pools
│   │   │         (random/sequential, per purpose)
│   │   ├── 1.1.3 Self-description — rich bio pages (user CSS, sandboxed)
│   │   ├── 1.1.4 Extensible fields — system-wide custom field definitions
│   │   │         + ad-hoc per-member fields
│   │   ├── 1.1.5 Preferences & boundaries — labeled comfort scales
│   │   ├── 1.1.6 Important dates — per-member recurring dates
│   │   ├── 1.1.7 Continuity — archive (never destroy), pin, merge two
│   │   │         records (rewriting all references), duplicate detection
│   │   └── 1.1.8 Profile building prompts — guided questions that write
│   │             answers back into member fields
│   ├── 1.2 Structure
│   │   ├── 1.2.1 Groups — nested folders of members, group profile,
│   │   │         group-scoped notes and posts, re-parenting, orphan rescue
│   │   ├── 1.2.2 Subsystems — groups owned by a member, own profile
│   │   ├── 1.2.3 Relationships — typed member↔member edges, direction,
│   │   │         strength, editable type catalogue
│   │   └── 1.2.4 System-level identity — system name, bio, avatar, banner,
│   │             birth date, multiple independent systems on one device
│   ├── 1.3 History of the system's shape
│   │   ├── 1.3.1 Lineage events — fusion, split, dormancy, return,
│   │   │         emergence (year-only supported, hideable)
│   │   ├── 1.3.2 Automatic consequences — splits create relationships;
│   │   │         absorption folds history into the continuing member
│   │   └── 1.3.3 Unidentified presences — record sightings, similarity
│   │             suggestions, merge, promote to member
│   └── 1.4 Inner world
│       ├── 1.4.1 Maps and layers — multiple, orderable, lockable
│       ├── 1.4.2 Places — shapes, images, links between maps, profiles
│       ├── 1.4.3 Member placement — where each member is
│       └── 1.4.4 Accessible equivalent — list navigation of everything
│                 the canvas shows
│
├── 2. PRESENCE — who is here now
│   ├── 2.1 Fronting state
│   │   ├── 2.1.1 Concurrent sessions — multiple members, primary marker
│   │   ├── 2.1.2 Fast changes — one-gesture add/remove/replace/primary
│   │   ├── 2.1.3 Session context — per-member notes, emotions, symptoms
│   │   └── 2.1.4 Switch context — trigger categories, post-hoc journaling,
│   │             flag-as-triggered after the fact
│   ├── 2.2 Presence history — browsable, editable, repairable
│   │   ├── 2.2.1 Correction — edit past sessions and their entries
│   │   ├── 2.2.2 Hygiene — stale-open detection, duplicate/ghost cleanup
│   │   └── 2.2.3 Inference (opt-in) — derive presence from authored
│   │             content within a set window, kept distinct from tracked
│   ├── 2.3 Identification support — for "who is fronting?" uncertainty
│   │   ├── 2.3.1 Guided question flow — discriminating questions scored
│   │   │         against member data, ranked candidates, skip/shuffle
│   │   ├── 2.3.2 Question curation — write, hide, customize, restore
│   │   └── 2.3.3 Proactive seeding — answer while grounded to make later
│   │             identification work
│   └── 2.4 Optionality — front tracking can be de-emphasized; attribution
│             falls back to authorship
│
├── 3. RECORDING — capturing what happens (append-only, editable later)
│   ├── 3.1 Shared capture grammar — timestamp + payload + who + note;
│   │       reachable in ≤2 actions from anywhere; never lost once saved
│   ├── 3.2 Capture types
│   │   ├── 3.2.1 Emotions — multi-select, per-emotion attribution,
│   │   │         intensity, distress flag
│   │   ├── 3.2.2 Symptoms & habits — user-curated catalogue (yes/no,
│   │   │         0–5, bipolar −2..+2), point logs AND running episodes
│   │   ├── 3.2.3 Free-text status lines
│   │   ├── 3.2.4 Places — category, name, optional GPS
│   │   ├── 3.2.5 Sleep — start/end, quality, interruptions, dream link
│   │   ├── 3.2.6 Activities — past logs and live concurrent timers
│   │   ├── 3.2.7 Company — time with outside people (start/end)
│   │   ├── 3.2.8 Structured daily entry — user-templated card
│   │   └── 3.2.9 System meetings — stepped group check-in with
│   │             per-participant entries and an optional dialogue
│   ├── 3.3 The record — one chronological day-by-day log of everything,
│   │       filterable per stream, fully editable after the fact
│   ├── 3.4 Inline commands — typed shortcuts inside any text field that
│   │       create real records
│   └── 3.5 Vocabulary ownership — every catalogue (emotions, symptoms,
│           categories, triggers) is user-defined; presets are optional
│
├── 4. ORGANIZING TIME — plans, tasks, routines
│   ├── 4.1 Scheduled plans
│   │   ├── 4.1.1 Lifecycle — scheduled → done / partial / skipped /
│   │   │         cancelled; unresolved items keep surfacing until resolved
│   │   ├── 4.1.2 Recurrence — series with this / this-and-future / all
│   │   │         edit branches
│   │   ├── 4.1.3 Rescheduling — history kept, never silently moved
│   │   └── 4.1.4 Priority surfacing — critical pinning with lead steps
│   ├── 4.2 To-dos — priority, due dates, subtasks, quantities, pinning
│   ├── 4.3 Routines — daily/weekly/monthly/yearly templates
│   │   ├── 4.3.1 Auto-completion — derived from real recorded data
│   │   │         (36 trigger kinds), never manually double-entered
│   │   └── 4.3.2 Encouragement — points, levels, streaks, past review
│   ├── 4.4 Goals — weekly time targets per activity category
│   ├── 4.5 Category tree — nested, user-defined, cycle-safe
│   └── 4.6 KNOWN DEBT — multiple overlapping creation paths and no
│           completion sync between linked plan/to-do (consolidation
│           proposal pending owner review)
│
├── 5. WRITING — the diary
│   ├── 5.1 Journal entries — rich text, titles, tags, attribution
│   │       (single/co-authored), member mentions
│   ├── 5.2 Organization — nested folders; renames cascade; deletion never
│   │       destroys entries
│   ├── 5.3 Specialized entries — switch logs, dream entries linked to
│   │       sleep, guided-exercise reflections
│   ├── 5.4 Findability — search, author filter, live "current fronters"
│   │       filter
│   └── 5.5 Draft protection — autosave and restore on every editor
│
├── 6. TALKING INSIDE — communication between members
│   ├── 6.1 Channels — organized chat, categories, ordering
│   │   ├── 6.1.1 Authorship — multi-author messages via typed signposts
│   │   ├── 6.1.2 Selective visibility — whispers to specific members;
│   │   │         private member-gated channels
│   │   └── 6.1.3 Conversation tools — replies, threads, reactions, pins,
│   │             edit, soft delete
│   ├── 6.2 Board — posts with comments (unlimited depth), reactions,
│   │       pins, task posts
│   ├── 6.3 Decisions — polls: per-member voting or anonymous tallies,
│   │       multi-voter, option editing with vote protection
│   ├── 6.4 Direct — member-to-member messages and per-member boards
│   └── 6.5 Being findable to each other — mentions with source links,
│           one notification inbox, everything lands oriented on arrival
│
├── 7. OUTSIDE PEOPLE — contacts
│   ├── 7.1 Directory — profiles, categories, custom fields, archive
│   ├── 7.2 Safety context — user-defined safety levels, awareness levels,
│   │       boundaries and system rules per person
│   ├── 7.3 Time together — encounter start/end, last-seen
│   └── 7.4 Emergency reach — one-tap call/text/email for support people
│
├── 8. SAFETY — crisis and stabilization (latency-critical everywhere)
│   ├── 8.1 Immediate access — reachable from any screen in one action;
│   │       measured in taps, outranks all other layout concerns
│   ├── 8.2 Grounding — technique catalogue (built-in + user-authored),
│   │       guided runs, ratings, favorites, per-member attribution
│   ├── 8.3 Breathing — paced exercises with visual guide
│   ├── 8.4 State triage — "what do I need right now" flow with
│   │       suggestions and crisis resources when indicated
│   ├── 8.5 Distress pipeline — distress-flagged captures offer support
│   │       immediately; user defines which emotions count
│   ├── 8.6 Personal crisis plan — warning signs, coping cards, tolerance
│   │       window; authored in guided lessons, readable fast
│   ├── 8.7 Psychoeducation — lessons with reflections and needs checks
│   ├── 8.8 Concealment as safety
│   │   ├── 8.8.1 Panic cover — configurable quick-taps opens a real,
│   │   │         working decoy surface; usable before unlock
│   │   ├── 8.8.2 Screen privacy — blur names/avatars modes
│   │   └── 8.8.3 At-rest encryption — passphrase, recoverable, whole-vault
│   └── 8.9 Boundaries of the tool — not medical care; disclaimer on every
│           clinical-adjacent surface; crisis resources always current
│
├── 9. UNDERSTANDING — analysis of the record
│   ├── 9.1 Reconstruction — any day rebuilt across every record type,
│   │       layers toggleable, infinite backscroll
│   ├── 9.2 Personal baselines — what is usual FOR THIS SYSTEM, with
│   │       confidence gating (silence over false precision)
│   ├── 9.3 Presence analytics — time shares, co-fronting pairs/matrix,
│   │       switch timing, session texture, long-absent members,
│   │       post-switch recovery time
│   ├── 9.4 Wellbeing analytics — factor↔distress correlations (sleep,
│   │       activity, company), pre-switch signatures with live early
│   │       warning, symptom relationships
│   ├── 9.5 Life analytics — category balance, plan follow-through
│   │       patterns, goal progress, places, people
│   ├── 9.6 Per-member patterns — characteristic emotions/symptoms/
│   │       activities/times; attribution of untagged records
│   ├── 9.7 Surfaced observations — ranked, tone-controlled, dismissible,
│   │       mutable
│   ├── 9.8 Clinical sharing — period reports: selectable sections,
│   │       detail levels, per-entry pruning, anonymization, PDF/text,
│   │       saved configurations, export audit trail
│   └── 9.9 Search — every record type, custom fields included, natural
│           date phrases, oriented landing
│
├── 10. REMINDING — external memory that acts
│   ├── 10.1 Rule types — clock/day schedules, intervals, absolute events
│   │        with pre-alerts, condition-based (inactivity, matching
│   │        emotion)
│   ├── 10.2 Respectful behavior — no stacking, auto-resolve when the
│   │        nudged thing happened, quiet hours, snooze, per-member scope
│   ├── 10.3 Plan alerts — lead-time notices for scheduled plans
│   ├── 10.4 Delivery — in-app; OS-scheduled (fires with app closed,
│   │        backfilled on return); optional server push (text optional);
│   │        persistent status notifications (current state pinned)
│   └── 10.5 Follow-through — acknowledged/acted/dismissed lifecycle feeds
│            routines and analytics
│
├── 11. SHARING & PORTABILITY — on the user's terms only
│   ├── 11.1 Trusted people (opt-in network feature)
│   │   ├── 11.1.1 Mutual adds by code; per-friend removal
│   │   ├── 11.1.2 Tiered disclosure — user-defined privacy levels over
│   │   │          nine shareable member fields; per-friend thresholds
│   │   │          and per-member overrides; live preview of exactly what
│   │   │          each person sees
│   │   ├── 11.1.3 Presence sharing — names / count-only / hidden, per-
│   │   │          fronter granularity
│   │   ├── 11.1.4 Verifiable privacy — end-to-end encryption with
│   │   │          out-of-band safety numbers
│   │   └── 11.1.5 Inbound hygiene — everything received is sanitized
│   ├── 11.2 Interchange with other plural apps — import from five
│   │        ecosystems + one archive format (dedup keys, mode choices,
│   │        no invented data); export to two ecosystems
│   ├── 11.3 Human-readable exports — member roster as text/HTML/PDF with
│   │        anonymization; clinical reports (9.8)
│   └── 11.4 Whole-life portability — complete backups (11.4 ↔ 13.2)
│
├── 12. PERSONALIZATION — the app fits the user
│   ├── 12.1 Vocabulary — core terms with full derived-form control
│   │        (plurals, verb forms, agent nouns, compounds), every
│   │        catalogue renameable, label modes
│   ├── 12.2 Appearance — themes (built-in, generated, user-saved),
│   │        light/dark/system, fonts (curated + installable + user
│   │        uploads), corners, decorative accents, contrast auto-
│   │        corrected for readability
│   ├── 12.3 Layout — which surfaces exist, where, in what order; every
│   │        navigation surface independently configurable; granular
│   │        display tokens (sizes, densities, widths, radii, colors)
│   ├── 12.4 Behavior — quick actions, gesture sensitivities, notification
│   │        presentation, per-surface view preferences
│   ├── 12.5 Per-member expression — profile styling, linked themes that
│   │        follow who is fronting, image pools, owned asset folders
│   ├── 12.6 Whole-look portability — presets capturing vocabulary +
│   │        appearance + layout together
│   └── 12.7 Accessibility floor — text scale, motion reduction, high
│            contrast, touch target size, simplified single-column mode,
│            screen-reader semantics; never gated behind customization
│
├── 13. CUSTODY — the user's data is theirs, forever
│   ├── 13.1 Local-first storage — on-device, no account required,
│   │        schema-tolerant, change-observable
│   ├── 13.2 Backups — manual and automatic, category-selectable,
│   │        compressed and chunked forms, silent-to-device or share,
│   │        images/fonts/preferences included, safe merge on restore
│   │        (newer wins, nothing clobbered, forced pre-delete backup)
│   ├── 13.3 Multi-system custody — independent systems, shared network
│   │        identity, cross-system reads, one-password re-encryption
│   ├── 13.4 Failure honesty — typed boot errors route to recovery, never
│   │        a silently empty database; orphaned data discoverable and
│   │        adoptable
│   ├── 13.5 Transparency — per-category counts and sizes, single-category
│   │        export/delete, raw inspection
│   └── 13.6 Media custody — local image/font stores, recompression,
│            offline caching of remote references, legacy migrations
│
└── 14. ORIENTATION — learning and staying oriented (amnesia-aware)
    ├── 14.1 First run — storage choice, honest disclaimer, vocabulary
    │        setup, choose-what-to-track with optional presets, resumable
    │        checklist
    ├── 14.2 Ongoing discovery — guided tour, per-surface first-visit
    │        walkthroughs (resettable), demo datasets, browsable feature
    │        reference, typed changelog
    ├── 14.3 Cross-navigation orientation — every jump to a specific item
    │        lands scrolled-to and highlighted; scroll positions remembered
    └── 14.4 Recovering context — "what was I doing": drafts restored,
             running timers surfaced, unresolved items resurface, current
             state always one glance away
```

Reading notes for the optimization work that follows:
- Branches 8 (Safety) and 3.1 (capture reach) are latency budgets, not
  sections — they override layout decisions everywhere.
- 12 (Personalization) and 13 (Custody) are cross-cutting: every leaf above
  them must remain customizable and exportable as it evolves.
- The current UI's surfaces are NOT nodes here on purpose. Mapping leaves →
  surfaces is the next design step, done fresh from this tree.
- Known structural debt is marked in place (4.6).
- The three day-views are INTENTIONAL, not redundant (owner, July 30):
  the chronological overlap view shows concurrency and cause→effect at
  specific times; the planner view is for scheduling/time-blocking
  (hobonichi-style); the day log is for going to a specific day and
  reading full detail and summaries ("what happened days 3–6"). All three
  stay as first-class views of branch 3.3/9.1. Only creation-path and
  completion-sync debt (4.6) is up for consolidation.
```
