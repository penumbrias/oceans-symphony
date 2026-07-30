# UI v2 — Instrument IA proposal

*How the Function Atlas's 17 domains become an instrument you operate.
Driven by the atlas §IV readout: latency-critical paths first, burial list
surfaced, redundancy clusters become one-function-many-views, dashboard
gravity redistributed into global chrome. Everything here is structure, not
appearance — the chassis renders it neutrally; skins repaint it.*

---

## 1. The two-layer model

**Layer 1 — the frame (always present, on every register):**

| Element | Function (atlas ref) |
|---|---|
| **Status line** | System name · clock · compact presence readout (who's here, primary marked) · notification LED → inbox · search. Tap presence → presence ops. (F1, F7, F10) |
| **Command strip** | The capture grammar made hardware: configurable capture keys (check-in, symptom, activity, status, task, plan, sleep, location, encounter…) — tap = capture, hold = full menu. Replaces the dashboard's quick-action gravity and absorbs the 17 quick-action types + OS launcher shortcuts. Guarantees ≤2 gestures from anywhere. (F4, F5) |
| **AID key** | One dedicated control (also hardware-adjacent: the floating bubble remains an alternative) → the crisis set: state check, breathing, techniques, safety plan, crisis resources. Latency-critical; never more than one gesture deep. (F9) |
| **Panic cover** | N-tap anywhere → grocery cover. Unchanged, global. (F14) |

**Layer 2 — eight registers** (the instrument's tabs; a dense, swipeable
strip — ALL visible, none buried; order user-configurable):

The first three are a temporal split — now / past / future — which is the
instrument's core reading:

| Register | Holds (atlas domains) |
|---|---|
| **STATUS** *(now)* | Presence panel with full session ops; running timers (activities, symptom episodes, sleep, encounters); today's commitments + unresolved (nagging until resolved); alerts (early-warning match, reconnection, critical-pin ladder); today's tally. (F1, F5-today, F10-live) |
| **LOG** *(past)* | The day record as ONE surface with views — chronological day view (today's check-in log), stream views (emotions / symptoms / sleep / locations / encounters / statuses / meetings / diary cards), and full after-the-fact editing. Resolves redundancy cluster (b): check-in log, diary cards, and tally become views of the same register. (F4-history) |
| **PLAN** *(future)* | Commitments as ONE function with views: calendar (range-drag logging + planning), to-do list, routines (XP/streaks/review), goals, recurrence management. Resolves cluster (a) at the structural level; the data-layer consolidation proposal complements it. (F5) |
| **ROSTER** *(who)* | Members directory + profiles; groups & subsystems; relationships; lineage; inner-world maps; unidentified presences; the identification tools (unblend, get-to-know-me) — unburied, since "who is fronting?" is a core purpose; **Outside** sub-view: contacts, boundaries, encounters, emergency dial. (F2, F3, F8) |
| **COMMS** *(talk)* | Chat (channels/categories/private); bulletins + polls; member boards & DMs; the notification inbox archive; Friends (sharing circle). Unburies chat and bulletins. (F7, F12-friends) |
| **ARCHIVE** *(words & media)* | Journals + folders; reflections/support journal; diary templates; the asset library (unburied). (F6, F15-media) |
| **DATA** *(understand)* | Timeline; analytics (fronting / wellbeing / life / fingerprints); insight cards; reports (builder, templates, audit); search as a full query surface. (F10) |
| **CONFIG** *(fit & keep)* | The wardrobe (terms, appearance, layout, catalogues) and stewardship (backup, encryption, multi-system, rescue, data transparency, interop) and guidance (tour, tutorials, previews, what's new). Deliberately last: rarely daily, never buried. (F13, F14, F15, F16) |

## 2. Register anatomy (uniform, so the instrument is learnable)

Every register renders the same skeleton: a **readout** (dense summary strip
at top — counts, states, alerts for that register), **views** (its sub-tabs),
**the work surface**, and **register actions** (the 1–3 primary operations,
always in the same position). Widgets from the experimental homescreen
generalize: any register readout is composed of the same widget primitives,
and STATUS is fully user-composable (the homescreen work survives as
STATUS's edit mode).

## 3. What redistributes (dashboard gravity)

The current `/` page's residents relocate: quick-action engine → command
strip; system switcher → status line (long-press system name); guide/tour →
CONFIG > Guidance (plus first-run); notification history → status-line LED;
the 15 dashboard widgets → STATUS readout composition; critical/unresolved
plans → STATUS alerts (they already nag correctly).

## 4. Route continuity

Every v1 route 301s into a register view — nothing breaks, nothing is lost:
`/` → STATUS · `/checkin-log`, `/location-history`, `/sleep` → LOG views ·
`/activities`, `/todo`, `/tasks` → PLAN views · `/Home`, `/alter/:id`,
`/groups`, `/group/:id`, `/system-map`, `/system-history`, `/presences`,
`/unblend`, `/get-to-know-me`, `/contacts` → ROSTER · `/chat`, `/bulletins`,
`/polls`, `/friends` → COMMS · `/journals`, `/assets` → ARCHIVE ·
`/timeline`, `/analytics`, `/therapy-report` → DATA · `/settings`,
`/manage-checkin` → CONFIG · `/grounding`, `/safety-plan` → AID overlay ·
`/system-checkin` → LOG > Meetings (capture via command strip). Deep-link
params and the `?highlight=` contract carry over verbatim.

## 5. What stays global regardless of register

Boot/lock/recovery surfaces; the background loops (reminders, friend sync,
sweeps); fronter-linked reskinning; a11y mode (registers collapse to
single-column lists; the register strip becomes a plain list); preview
banners; the orientation contract.

## 6. Open questions for the owner to tear apart

1. **Eight registers, all visible** — right count? Merge candidates:
   ARCHIVE into LOG (words as records)? Contacts under ROSTER vs its own?
2. **STATUS vs LOG vs PLAN temporal split** — does now/past/future match how
   you actually reach for things, or should LOG+PLAN fold into one
   "records" register with a time axis?
3. **Meetings** live in LOG (as records) with capture via the command strip
   — or do they belong to ROSTER (a system ritual)?
4. **Friends** under COMMS — or under CONFIG as an integration?
5. **Command strip defaults** — which capture keys ship enabled?
6. Naming: registers are working labels (STATUS/LOG/…) — user-renameable
   like everything else, but the defaults set the tone. Keep the instrument
   register names, or plainer words (Now/Record/Plan/People/Talk/Files/
   Data/Setup)?

*Next after teardown: chassis primitives spec (the neutral component set:
readout strip, register tabs, list/row/cell, capture sheet, command strip)
and the v2 shell + STATUS register as the vertical slice, behind the
`ui_v2` toggle.*
