# Oceans Symphony — Onboarding & Customization Initiative: Design

*Composed July 2026 from the research knowledge base (`onboarding-customization-knowledge-base.md`), the codebase scan digest (`codebase-scan-digest.md`), and the owner's decisions. This is the build blueprint. Each workstream ends in a shippable, testable phase; the owner tests after each phase and we refine.*

---

## Build order (proposed)

| Phase | Workstream | Why this order |
|---|---|---|
| **A** | Security hardening + tracking data-model v2 (foundations) | Owner chose "solid foundation now"; everything later stands on these. Mostly invisible to users → low test burden. |
| **B** | Preset catalogue + emotion/distress restructure + check-in measurement UI | The content layer the new onboarding will present. Testable inside the existing app before onboarding exists. |
| **C** | Onboarding flow v2 | Presents B's content; comes after so the flow demos real, working config steps. |
| **D** | Front-tracking-optional + unified attribution | Independent of A–C; needs its own focused test pass. |
| **E** | Customization tiers (seed palette → Tier-2 typed options → theme gallery → reader mode) | Largest new-UI surface; benefits from A's rails being live. |

Every phase follows the release checklist (changelog + APP_VERSION + build.gradle together; tour updates; backup wiring for any new entity).

---

## Phase A — Foundations

### A1. Security hardening (decided: now, not later)

1. **CSP.** Add `Content-Security-Policy` via `vercel.json` headers + a `<meta>` fallback for the Capacitor build:
   - `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (inline styles are load-bearing across the app); `img-src 'self' data: blob: https:` (broad `https:` is required — avatar caching & SP/Octocon CDN fetch arbitrary hosts; tightening further would break `localImageStorage._fetchViaBrowser` and the HTTP-image migration); `connect-src 'self' https://oceans-symphony.app https://api.pluralkit.me https://api.apparyllis.com` (+ SP/Octocon CDNs); `font-src 'self' data:`; `frame-src 'self' blob:`; `object-src 'none'`; `base-uri 'self'`.
   - Also add `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera/mic/geolocation self-scoped — geolocation is used for Location capture).
   - Remove the stray `fonts.googleapis.com` reference (self-host whatever it loads; per GDPR ruling + offline-first rule).
2. **Scoper upgrades** (`scopedBioStyle.js`) — new sanitization pass in `sanitizeDecls`/`transformRule`:
   - Strip `position: fixed` and `position: sticky` declarations (scoping does not neutralize them).
   - Clamp `z-index` to a profile-safe ceiling (e.g. 10).
   - Allowlist `url()` values: `/local-image/…`, `local-image://…`, `data:image/…` only; strip remote URLs (matches the bio-templates' own "no external URLs" rule, now enforced on user-pasted HTML too).
   - Drop `@font-face` blocks whose `src` is remote (local data-URL faces stay).
   - Cap total `<style>` size per bio (e.g. 64 KB) with a graceful "style too large" fallback.
   - All still never-throws; fallback remains strip-styles-entirely.
3. **Friend-data value validation** (pre-emptive for self-hosting): validate `fronter.color` / member `color` against a `#hex` / `hsl()` / small-named-color regex before applying to inline styles (`Friends.jsx` render sites); length-cap and control-char-strip `displayName`/`systemName`/fronter names at the client boundary (`friendsApi` response mapping), since the receiver must never trust sender-side hygiene.
4. **PBKDF2 iterations bump** 100k → 600k with a versioned envelope field (`__kdf_iterations`); existing blobs keep working (read the field, default 100k), new saves upgrade transparently after successful unlock.
5. **Not in scope yet** (Phase E / self-hosting): sandboxed-iframe rendering for *shared* profiles, secrets-to-headers, CORS scoping, federation. Documented as prerequisites in the knowledge base.

**Changelog:** "Hardened profile styling and app security (stricter content rules; stronger encryption key derivation)." PATCH bump.

### A2. Tracking data-model v2 (the measurement fix)

The `Symptom` entity gains fields (schemaless → additive, no migration risk):

- `kind`: `"state" | "event" | "behaviour" | "context"` — derived for legacy rows: `category==="habit"` → `behaviour`; the four switch booleans → deprecated (see below); `Work/school stress`, `General stress`, `Relationship stress` → `context`; everything else → `state`.
- `direction`: `"higher_worse" | "higher_better" | "bipolar"` — derived from `is_positive` (`true`→`higher_better`, else `higher_worse`). `is_positive` stays (reports read it); the derivation lives in one helper.
- `scale`: `"unipolar_0_5" | "bipolar_2"` (bipolar = −2..+2 with labelled neutral midpoint). New "Overall mood"-style presets use bipolar; legacy rows stay unipolar unless the user edits them.
- `bundle_id`: which preset pack it came from (null for custom).
- `anchors`: optional label array override; default anchor sets live in code per scale type ("None / Mild / Moderate / Strong / Severe / Extreme" for 0–5).

**Answer-state semantics** (the three-state model, decided):
- No record = not asked. Explicit skip is simply "no record" at save (the current "—" behaviour is already correct at the storage layer).
- `severity: 0` = observed absent — a real data point. New: check-in UI labels the 0 button "None" (anchor tooltip) so its meaning is explicit.
- `severity: null` + checked = "occurred, intensity unspecified" — **analytics impute the scale midpoint** (2.5 on 0–5) via one shared helper `effectiveSeverity(checkIn)` used by reports/analytics; stored data never fabricates a number.
- Presence-vs-absence display fix: a `severity: 0` check-in renders distinctly on Timeline/CheckInLog (e.g. "Anxiety · none" in muted styling, not "severity 0") so recording a reassuring zero doesn't read as an anxiety event.
- Direction cue in UI: rating rows show a small ▲/▼/◆ (or color tint) from `direction`, so Anxiety-0–5 and Energy-0–5 stop looking identical.

**Switch booleans:** the four legacy switch symptoms (`Triggered switch`, `Random switch`, `Rapid switching`, `Lots of switching`) get `kind: "event"` + `deprecated: true`; they stop appearing in the default picker for new users (existing users keep them; history intact). The real switch record is `FrontingSession` (+ its trigger metadata) — the check-in fronting section already covers this.

**Events as counts:** new event-kind items (flashback, meltdown, shutdown, panic attack, functional seizure, time loss) log through the same `SymptomCheckIn` row model with `kind:"event"` semantics: the row means "happened once at this timestamp" (severity optional). Multiple taps = multiple rows = a count. No new entity needed; analytics count rows/day for events instead of averaging.

**Context items** are excluded from symptom means/noteworthy flags (`buildSymptomsSection`, analytics) and offered as correlation *factors* instead. One shared predicate `isContextItem(symptom)`.

**Coverage stat:** analytics/report helpers gain "answered N of M days" coverage lines (distinguishing skip from zero) — small additions to `buildSymptomsSection` + SymptomAnalytics.

---

## Phase B — Content layer

### B1. Preset catalogue (`src/lib/trackingPresets.js`, new)

The 9 bundles from the research taxonomy, each `{ id, label, description, defaultOn, items: [{label, kind, type, direction, scale, color, order, safety_notes?}] }`:

1. **Mood & feelings** (default-on) 2. **Dissociation** (default-on) 3. **Trauma responses** 4. **Focus & getting things done** 5. **Sensory & environment** 6. **Body, sleep & energy** 7. **Daily care & coping** (default-on; the relabelled habits) 8. **Context & triggers** 9. **Safety & risk** (opt-in, never gamified, safe-messaging copy rules).

Item wording per the research catalogue (plain, non-clinical, "things some people track"); FND items say "functional seizure"; meltdown/shutdown/burnout are three items; sensory overload = one rating + optional modality tags (tags via existing note/labels, not 8 items).

- `seedSymptomDefaults()` becomes bundle-aware: **new users** get whatever onboarding selected (Express = the three default-on bundles); **existing users** are untouched (their seeded list stays; `healDuplicateDefaults` keeps working). The onboarding picker writes `Symptom` rows with `bundle_id`.
- **BundlePickerSection** (new component, reused by onboarding AND ManageCheckIn as a new "Add from presets" affordance): expandable bundle cards → pre-checked item checklists (Bearable pattern), search, per-item type/direction visible, "add all in this pack", built on the visual language of `SymptomsSection` + `RemindersOnboarding` (the app's existing preset-picker pattern).

### B2. Emotion & distress restructure

1. **Distress storage moves to SystemSettings** (`distress_emotions`: array) — backed up, cross-device, replacing the localStorage-only set. Migration: on first read, union localStorage set (if present) into SystemSettings, keep localStorage as read-fallback (never delete — data invariant). `emotionDistress.js` becomes the single accessor for both.
2. **Expanded defaults**: add the missing Sad core + subs (Depressed, Grieving, Helpless, Lonely, Hurt, Hopeless…), the Angry high-distress subs (Furious, Betrayed, Humiliated), and the body Freeze/Collapse states (Shut down, Despair, Powerless, Stuck, Dread, Paralysed, Dissociated, Numb…). Mild negatives (Annoyed, Disappointed, Bored) stay non-distress by default. Only for **new** users / unset installs; existing users' saved sets are never overwritten.
3. **Root category renaming** (decided: rename-only, no new roots): `SystemSettings.emotion_category_names` = `{good?, bad?, neutral?, body?}` override map. `WHEEL[key].label` resolution goes through a tiny `categoryLabel(key)` helper used by EmotionWheelPicker, CustomEmotionsManager, and analytics legends.
4. **Distress → grounding handoff upgrade**: the post-save prompt carries the selected distressing emotions into `/grounding` (`?from=checkin&states=…` mapping emotion → `EMOTIONAL_STATES` id where mappable) so StateCheckFlow arrives pre-seeded instead of dumping the user at the entry screen. Still opt-in one tap — never auto-launch (research + existing behaviour agree).
5. **Onboarding emotion step** reuses `CustomEmotionsManager`'s tap-to-toggle wheel (decided) wrapped with the explainer: "some emotions are marked *distressing* — logging one offers a quick support prompt. Tap to change which."

### B3. Check-in measurement UI updates

- `SymptomCardRow`: anchor tooltips, "None" label on 0, direction cue, bipolar row variant (−2..+2) for bipolar-scale items.
- Event-kind rows: a tap-to-count control ("+1 · happened") instead of the checkbox+scale.
- Context-kind rows appear under a "Context" divider in the Symptoms section (still one list, visually separated).
- CheckInLog/Timeline: "· none" rendering for 0; events render as counts.

---

## Phase C — Onboarding flow v2

### The flow (owner's sequence, refined per research)

A single replayable `OnboardingFlow` component replacing the Dashboard-mounted Disclaimer→Terms→Tour chain (StorageModeSetup stays at boot — its IDB-peek safety logic is untouchable):

1. **Welcome + trust** — "local-based, private… no servers, no syncing, no chance of your data being sold or leaked; works fully offline." Disclaimer acknowledgement folds into this screen (one checkbox, same key) so it stops being a separate modal.
2. **Quick Check-In intro** — the owner's copy, split one-idea-per-screen: (a) "enter as much or as little as you like — any data is useful data; every entry helps fill gaps left by amnesia"; (b) emotions general→specific for alexithymia + Body & Nervous System section.
3. **Profile & terminology** — TermsSetupModal's preset grid embedded as a step (writes the same `SystemSettings` fields + `terms_setup_done`).
4. **Configure your check-in** — "the entire quick check-in can be customized!" **Express** (three default-on bundles + default emotions/distress + default diary) vs **Customize** (BundlePickerSection → emotion/distress step → section toggles). Skip-safe: Express is one tap; everything revisitable in ManageCheckIn (screen says so).
5. **Meet the alters page** — transition screen introducing `/Home` (directory), add-first-alter CTA or importer pointer (both already exist on Home's empty state).
6. **Front tracking is optional** — explains the toggle + that analytics still work from authored content ("write as yourself and the app learns who was around"). Sets the Phase-D mode if the user opts out.
7. **Backups (final)** — "local means no cloud copy: if it's lost from the device, it's lost for good — export backups." Surfaces the existing `AutoBackupSettings` mode/interval picker inline (decided: final section).

Mechanics: progress dots, per-step Skip, "Set up later" exits whole flow safely (defaults applied); one `onboarding_state_v1` JSON key replaces the scattered gate keys (legacy keys still honoured so existing users never re-onboard); wipe-consistency fix (disclaimer key joins the Delete-All clear list); **"Re-run setup" entry in Settings → About** (replayability — different alters may want to re-do it); Guide/Tour buttons unchanged (kept per owner decision, now pull-not-push).
Accessibility: AccessibilityFab stays reachable (>z-110 clearance), each screen one idea, plain grade-8 language, all copy through `useTerms()` once terms are chosen (steps after #3 use the chosen terms live — the "personalization demonstrates itself" research finding).
FeatureTour gets updated anchors/steps for the new surfaces (release rule).

---

## Phase D — Front-tracking-optional + unified attribution

1. **Master toggle** `SystemSettings.front_tracking_mode`: `"active"` (default) | `"passive"`. The existing "Infer presence" toggle + window move under it (passive implies inference on).
2. **Unified resolver adoption**: route the ~15 inline attribution implementations through `attribution.js attributeRecord` (explicit → fronters → author → inference → none, source-tagged). Keep the standing principle: **fronting *time* analytics stay real-sessions-only**; inference attributes *content* only. Co-fronting stays real-only (no phantom co-fronting from window overlaps).
3. **SymptomCheckIn gains `fronting_alter_ids`** at write time (defaulted like EmotionCheckIn) — fixes the dead `alterFingerprint` symptom branch and gives symptoms an explicit path at last.
4. **Passive mode behaviour**: hide Fronting tab, timeline alter columns, CoFronting, switch-trigger UI, `switch_logged` daily task, and CurrentFronters widget (dashboard layout flag); attribution defaults flip to inference; chat default speaker falls back to last-used speaker (not fronter); chat private-channel unlock switches to an explicit per-channel setting (it currently keys off fronter membership — a hard dependency that must not silently lock users out); friends front-sync sends nothing (with a note in Friends UI).
5. Onboarding step 6 + a Settings card explain the mode; switching modes later is lossless both ways (sessions are never deleted).

---

## Phase E — Customization tiers

1. **Seed-colour → accessible palette**: `src/lib/paletteEngine.js` (culori, OKLCH) generating the 8 ThemeContext roles (light+dark) from one seed, contrast-validated via `contrast.js` math (WCAG 2 AA floor; `adjustForContrast` generalized). Surfaces: a "Generate from one colour" control atop AdvancedAppearanceNew's palette editor + live contrast warnings on manual hex edits (advisory, not blocking — user autonomy).
2. **Tier-2 typed theme options**: extend `profileStyle.js` PS keys + `ProfileStyleEditor` into the declared-options pattern (Obsidian/Tumblr): profile templates ship `options: [{key, type: color|font|toggle|select|slider, label, default}]` that render as controls and write PS keys / CSS vars. Non-coders tune; Raw mode edits the same artifact.
3. **Theme gallery growth**: more `bioTemplates` pages/modules (incl. the early-web affordance set: under-construction status, tended date, quote/playlist/likes-dislikes/DNI modules — several already exist as modules) + "fork this template's code" into Raw mode.
4. **Profile field additions**: render `banner_url` at last (real banner primitive); likes/dislikes & boundaries/DNI as first-class optional fields (several exist as bio modules today; promoting to fields makes them shareable/searchable later).
5. **Reader mode**: per-viewer "Plain view" toggle (global + per-profile) that renders profiles with default theme, no custom CSS/backgrounds — the accessibility escape hatch. Honors reduce-motion by suppressing bio animations globally when set.
6. Stable theming API doc: the `--color-*` role names + PS keys become the published contract; theme/preset exports carry a `version` field.

---

## Cross-cutting release obligations (every phase)

- `changelog.js` + `appVersion.js` + `build.gradle` move together; entries 1–2 sentences, user-facing.
- New entities → `ENTITY_NAMES` + `EXPORT_CATEGORIES` same commit (Phase A/B add no new entities — `Symptom`/`SystemSettings` fields ride existing wiring; Phase E theme exports reuse backup channels).
- New UI → FeatureTour steps + `data-tour` anchors; stale steps updated (onboarding revamp touches many).
- All copy through `useTerms()`; presets phrased "things some people track"; safe-messaging rules on Safety bundle copy.
- Wiki preview (`previewWiki.js` + `WIKI_CONTENT_VERSION`) refreshed when phases B/C/E land.
