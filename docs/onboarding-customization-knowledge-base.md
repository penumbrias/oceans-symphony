# Onboarding & Customization Initiative — Research Knowledge Base

*Compiled July 2026. Synthesizes four deep-research streams (onboarding/tracker UX; accessibility, COGA & trauma-informed design; symptom taxonomy & measurement science; deep-customization architecture) plus a code audit of the current onboarding, symptom, and emotion systems. This is a design input document — no decisions here are final until the design says so.*

---

## Part 0 — Current-state code audit (ground truth)

### The first-run chain today
1. **`StorageModeSetup`** (App.jsx `firstrun`) — encrypted vs plain storage
2. **`DisclaimerModal`** (Dashboard mount) — not-medical acknowledgement
3. **`TermsSetupModal`** — one screen, 4 presets (DID/OSDD, Headmates, Parts/IFS, Collective) + custom, live conjugation preview
4. **`TourModal`** — ~13 slides of page descriptions
5. **`FeatureTour`** — in-place walkthrough with `data-tour` anchors, launchable from Dashboard

Chained via localStorage flags (`DISCLAIMER_ACK_KEY`, `terms_setup_done`, `tour_seen`).

### The silent seeding gap
All 32 symptom/habit presets are auto-created the first time Quick Check-In opens (`seedSymptomDefaults()` in `src/utils/symptomDefaults.js`). The user never sees or chooses them. **The "pick your presets" vision replaces a silent bulk-import, not an existing chooser** — it slots into a genuine gap.

### The "Anxiety = 0" semantics (the owner's question, answered from code)
`SymptomsSection.jsx` renders `["—","0","1","2","3","4","5"]` per rating symptom:
- **"—"** → unchecks the row, severity `null`, **nothing saved**. Not-answered = no record.
- **"0"** → checks the box, saves a `SymptomCheckIn` with `severity: 0`. A real record.
- **Checkbox alone** (no rating tap) → saved with `severity: null` = "present, intensity unspecified".

Downstream fork:
- **Intensity analytics handle 0 correctly** — report averages include it (`reportSections.js` pushes `severity != null`), noteworthy flags only fire at ≥4.
- **Presence surfaces treat 0 as "it happened"** — Timeline lists "Anxiety · severity 0" as an anxiety event; tallies count it like a 5.

So the model has only two of the three needed states. It cannot express **"I checked, and it was absent"** distinctly from **"present at level 0"** — and both are visually indistinguishable from a real symptom log on the timeline. See Part 2 for the fix.

Additional smells found in code:
- Same 0–5 widget serves higher-is-worse (Anxiety) and higher-is-better (Overall mood, Energy) with no visual direction cue (`is_positive` exists on the entity; reports invert it; the check-in UI doesn't show it).
- The four switch booleans (Triggered/Random/Rapid/Lots of switching) overlap incoherently and are redundant with `FrontingSession`, the app's real switch record.

### The distress-emotion defaults (the owner's instinct, confirmed)
`emotionDistress.js` `DEFAULT_DISTRESS` is a flat 20-word lowercase list in localStorage. Compared with the wheel (`WHEEL` in `EmotionWheelPicker.jsx`):
- Misses the **entire Angry core** (Furious, Betrayed, Humiliated…), most of **Sad** (Depressed, Grieving, Helpless, Lonely, Hurt…), and most **body Freeze/Collapse** states (Shut down, Despair, Powerless, Stuck, Dread…) — striking for a dissociation-focused app.
- Contains words not on the wheel at all ("crisis", "unsafe", "terrified", "scared", "desperate") — those defaults can never match unless the user creates the emotion.
- The wheel itself is a **hardcoded export**; custom emotions can join existing categories but new *root* categories require making the wheel data-driven (a real structural change).

---

## Part 1 — Onboarding: what the research says

### The five convergent findings
1. **Kill the big upfront wizard.** Onboarding abandonment runs 60–80%; each step raises drop-off; time-to-first-value >30min triples abandonment. Daylio leads its category with the *shortest* onboarding (11 screens vs a norm of 40+) and opens with "your data stays on your device / no account needed" — OS has an even stronger trust story and should open with it.
2. **Preset pickers, not blank managers.** Bearable's onboarding: pick your symptoms/factors from ~10 **expandable categories**, pre-checked recommended set, editable forever after. Daylio: preset moods + a 15-second "you can change these" preview. Notion: 5 recommended templates, not the full gallery. This is the exact shape for the OS symptoms/emotions step.
3. **Skip must be safe.** 63% of users skip ≥3 of 7 steps; skippers churn 2.4× — *unless* defaults keep the app fully usable and skipped setup re-surfaces contextually later (empty-state prompts, first-open tips). Every optional step needs "skip / set up later" + a comprehensive default.
4. **Personalization questions must visibly change something** (Headspace's goal intake: +7.6pp course starts; the "when will you check in?" implementation-intention prompt: +7.5% opens). The terms step is OS's superpower here — it's *real* personalization that reshapes the whole app. Anti-pattern: Reflectly's "give us data, get nothing" theater.
5. **Demote the tour from push to pull.** NN/g: coach-mark overlays are skipped, instantly forgotten, and can't be acted on while shown. Tour = excellent, accurate, *opt-in, replayable* reference — not the front door. First-run teaching happens via defaults + empty states + single contextual first-open tips. *(Note: this contradicts CLAUDE.md's "the tour is the user's primary onboarding resource" — the accuracy rule stays, the front-door framing should change.)*

### Tracker-fatigue science (Li/Dey/Forlizzi; Epstein)
- Stage model: **preparation → collection → integration → reflection → action**; friction in *preparation* (setup) poisons everything downstream. **Defaults are the real onboarding.**
- Lapses (forgetting, upkeep, skipping, suspending) cascade into abandonment; guilt turns tracking into a stressor; 5+/day logging *reduces* accuracy and retention.
- Design lapses and re-entry as first-class states: "Welcome back — quick catch-up or start fresh?" — never scold, never render a gap as failure.
- Check-in budget: **15–30 seconds** or users start skipping. Two-tier structure: pinned favourites as quick taps + a "more" expander for the full catalog/intensity/notes.

### Empty states (NN/g's three rules)
Say *why* it's empty · teach the feature in place · one primary CTA. **Seed the catalog, never the log** — no fake entries in a personal-data app.

### Progressive disclosure beats a global simple/advanced mode
NN/g: modes cause mode-errors, go undiscovered, or make "simple" feel crippled. Per-surface disclosure instead ("+ more" expanders, Advanced `<details>`), with everything frequently needed in the primary layer. The Obsidian empty-vault problem is the cautionary tale for maximally-configurable apps: OS must never hand a new user a blank canvas.

### App-pattern steal list
| App | Steal |
|---|---|
| Daylio | Privacy-first opening; shortest-possible core; preset catalog + customization *preview* |
| Bearable | Expandable-category preset picker at onboarding; correlations as delayed payoff (~7 days) |
| Finch | Starter goals so lists are never empty; quiz via large tappable cards; forgiving ~every-3-days rewards |
| How We Feel | Check-in = emotion + contextual sub-taps (who/what/where) — context by tapping, not typing |
| Headspace | Intake that routes content; implementation-intention micro-step |
| Exist.io | Custom tracking off by default; per-item fidelity choice (tag/scale/quantity/%) |
| Todoist/Notion | Onboarding as replayable *data* (template/Getting Started page), re-runnable from Settings |

---

## Part 2 — Measurement model & the new symptom taxonomy

### The 0-vs-blank answer (the initiative's data-model cornerstone)
`0` and "no answer" are categorically different and must never be coerced (structural-zero vs missing-data literature; EMA "informative presence" research — the *missing* days are the non-random, high-symptom days, so blank→0 coercion makes bad weeks read artificially calm).

**Recommended storage per item per check-in:**
| Stored value | Meaning | In means/trends? | In streak/coverage logic? |
|---|---|---|---|
| *(no record)* | not offered / never engaged | no | no |
| `null` — explicit skip / "can't tell" | offered, declined | **no** (count as "skipped") | no |
| `0` | observed absent | **yes** | yes (a real good-day data point) |
| `1..5` | observed intensity | yes | yes |

Rules: never coerce blank→0 anywhere (storage, aggregation, export, timeline); expose coverage ("answered 4 of 7 days"); for **events**, absence-of-record ≠ 0 events (amnesia!) — only hard-zero via an affirmative "nothing to log today".

### Scale design
- **Labelled anchors** on every scale (none/mild/moderate/strong/severe, or never/rarely/sometimes/often/constantly) — unanchored numbers drift across days *and across alters*.
- `0` as an explicit labelled "none" endpoint for unipolar symptom intensity.
- **Bipolar constructs get bipolar scales** — Overall mood and energy/arousal need a labelled neutral midpoint (−2…0…+2), not a unipolar ramp. Mixing the two shapes under one widget is the current design's confusion source.
- Per-item **`direction` metadata** (`higher_worse | higher_better | bipolar`) shown visually.
- Frequency anchors for episodic symptoms (fatigue, intrusions); "same as last time" relative anchor lowers burden.
- A genuine **"can't tell" option** is a validity *and* kindness requirement — ~74% of autistic adults report interoceptive confusion; alexithymia makes fine-grained rating unanswerable, and demanding it produces junk data and distress.

### Four data kinds, not one flat list
| Kind | Measure | Examples |
|---|---|---|
| **State** | anchored rating (uni/bipolar) | anxiety, fog, mood, sensory overload, social battery |
| **Event** | count / timestamped log + attributes | switch, flashback, functional seizure, meltdown, panic attack |
| **Behaviour** | boolean/done (+ optional duration) | therapy, coping skill, meds, movement |
| **Context** | boolean/tag — **never in symptom means** | work stress, routine break, poor sleep, anniversary |

The four switch booleans collapse into one **switch event** (attrs: triggered/spontaneous/unknown) cross-linked to `FrontingSession`; stress items move to the context bucket (they're predictors — keeping them separate is what makes "does X predict Y" analytics possible).

### The proposed 9-bundle preset catalogue (opt-in packs for onboarding)
1. **Mood & feelings** *(default-on)* — mood R±, energy R±, anxiety, low, irritable, overwhelmed, numb, wired, shame; calm + content as positive states
2. **Dissociation** *(default-on)* — detached-from-self, world-unreal, time loss (event, count+unknown), memory gaps, spacey/greyout, switch (event), co-conscious, blending/blurring, passive influence, internal noise, fronting exhausting, identity confusion — grounded in DES-II/SCID-D/MID-60 domain structure + community vocabulary (Pluralpedia)
3. **Trauma responses** — bipolar arousal (shut-down↔regulated↔wired; window-of-tolerance as *metaphor*, not asserted mechanism), emotional vs sensory flashbacks (distinct events), hypervigilance, startle, nightmares, avoidance, disconnection
4. **Focus & getting things done** — task initiation, time blindness, thread-holding, hyperfocus, restlessness, RSD, motivation
5. **Sensory & environment** — sensory overload (single rating + optional modality tags, not 8 items), seeking, masking, **meltdown / shutdown / burnout as three distinct items**, social battery, routine-held, alexithymia
6. **Body, sleep & energy** — sleep, fatigue (frequency-anchored), post-exertion crash (distinct from fatigue), pain (presence→intensity), **functional seizure** (never "pseudoseizure"/"PNES"), functional movement symptoms, headache, ate-regularly, hydration, meds
7. **Daily care & coping** *(default-on; relabelled from "habits" — protective actions, never scored as symptoms)*
8. **Context & triggers** *(never in symptom means)*
9. **Safety & risk** *(opt-in, special handling — below)*

### Safety constraints
- **Self-harm/SI:** logging allowed (naming urges is protective) but never gamified/streaked; pair logging with safety-plan surfacing (hook the existing Grounding/Crisis Resources); safe-messaging rules (Samaritans/SPRC/#chatsafe): no method detail, no means fields, co-located help.
- **OCD:** coarse once-daily interference rating only — fine-grained per-event compulsion counters can *become* the compulsion and contradict ERP. The one cluster where more granular tracking is worse.
- **Eating:** behavioural and gentle only ("ate regularly") — never calories/macros/weight (documented disordered-eating risk vector).
- **Substances:** neutral, opt-in, no broken-streak shame.

### Framing
Presets are **"things some people track," never "your symptoms"** (avoid implicit diagnosis assertion). Plain descriptions that survive custom-term substitution; no plurality-origin-model assertions; identity-first-friendly defaults with the custom-terms system as the universal escape valve.

---

## Part 3 — Emotions & distress redesign inputs

- Current default distress list is confirmed too thin (Part 0). Design direction the research supports: **distress defaults derived from category + severity tier, with per-emotion override**, not a disconnected hand-list. Not *all* "bad" emotions warrant the grounding prompt (Annoyed, Disappointed are mild) — a "distress tier" within categories (e.g., core vs intense subs) is more defensible than category-wide blanket, but blanket-with-easy-removal is simpler to explain. Both beat today's list. The Freeze/Collapse body states are the clearest missing defaults.
- New root categories require the wheel to become **data-driven** (currently a hardcoded export). That migration should preserve the existing four categories as seeded defaults, keep custom emotions attached, and keep the distress set keyed robustly (today it's name-string matching in localStorage — fragile against renames and Android localStorage wipes).
- Onboarding should *show* the distress→grounding link at emotion-setup time ("when you log one of these, we'll offer a quick support check") — it's currently an invisible mechanic users discover by accident.
- How We Feel's contextual sub-taps (who/what/where) are the pattern for enriching emotion check-ins without typing.

---

## Part 4 — Accessibility, COGA & trauma-informed requirements

**Priority inversion:** OS's median user is a trauma/dissociation/neurodivergent population — so COGA, anti-shame mechanics, memory support, and calm defaults are *core requirements*, ranked above the conventional screen-reader checklist (which still applies).

### P0 items
1. **Automatic contrast correction** on all user colours (keep hue, nudge lightness/chroma minimally — APCA/OKLCH internally, WCAG 2 AA verified; *show* the adjustment). Never colour-as-only-signal.
2. **Biometric unlock** alternative to the passphrase (WCAG 2.2 3.3.8 — a passphrase is a "cognitive function test"; amnesia + passphrase-only = locked out of "your data forever").
3. **De-shame the tracking layer:** gamification (streaks/points/LevelBar) opt-in and removable; gaps rendered neutrally; recovery-first streak design if streaks exist at all.
4. **Global reduced-motion + forced-colors/high-contrast respect** — including *over* author CSS.
5. **Screen-reader pass** on every modal/sheet/popover (focus trap/return, `role=dialog`, Escape) + `aria-live` announcements for async saves (the whole app is "save a record" — silent saves are invisible to SR users).
6. **Targets ≥24px (aim 44)** + tap alternatives to every drag/swipe (WCAG 2.2 2.5.7/2.5.8).
7. **Sandbox + viewer "Plain view / reader mode"** for custom-CSS profiles (see Part 5).

### COGA highlights mapped to OS
- `useHighlightScroll` is textbook COGA memory support — extend everywhere; never rely on the user remembering a previous session/state.
- Undo (not just confirm) for destructive actions; persistent drafts; no timeouts, ever.
- Literal language, one instruction per line, descriptive buttons; no idioms (autistic users; also unlocks machine translation).
- ADHD reminders: **habituation is the failure mode** — identical reminders become wallpaper; vary wording/placement; gentle optional nudges.
- Onboarding must be **replayable** (dissociative users may genuinely need to re-onboard; different alters may want to re-run setup) — the strongest population-specific argument for "onboarding as data, not a one-shot."

### i18n (relevant to terms + future translation)
- English auto-conjugation of user terms (`pluralize`, `gerund`, `agent`) is the biggest i18n landmine — CLDR plural categories go to 6; Finnish has ~15 cases. Long-term: users supply the forms they need (explicit overrides); terms as opaque tokens in localized templates; ICU MessageFormat for app strings.
- Plain grade-8 language + correct `lang` attributes = the cheap path to machine-translation usability before real translations exist.

---

## Part 5 — Customization architecture (the Geocities pillar, done safely)

### The three governing findings
1. **Depth is adopted through preset galleries, not editors.** Every beloved era (Geocities → MySpace → Tumblr → SpaceHey) paired "here's a layout someone made" with "tweak one value." A **theme gallery** is the single highest-leverage feature.
2. **The proven "toggles for beginners, code for experts, same artifact" pattern:** typed settings declared *inside* the code layer — Tumblr `<meta name="color:…">` tags, Obsidian Style Settings' `/* @settings */` YAML-in-CSS, WordPress `theme.json`. Controls write CSS custom properties; power users hand-edit the same file. Keep both surfaces live simultaneously (VS Code model), never either/or (Home Assistant's cautionary split).
3. **Shared profiles are a Samy-worm threat model.** Local-only = low risk; a profile rendered in a *friend's* client = hostile input. Sanitization alone is insufficient (the Samy worm was built entirely from filter bypasses).

### Customization tiers (one artifact, four depths)
- **Tier 0 "Just works"** — no decisions; curated calm AA-passing default.
- **Tier 1 "Pick a look"** — 5–8 curated themes + one seed-colour picker driving a full accessible palette. Where ~80% of users land.
- **Tier 2 "Tinker"** — typed options panel (colours/fonts/toggles/sliders/sticker/cursor/background pickers). Safe by construction.
- **Tier 3 "Full control"** — raw HTML/CSS, sandboxed, with "fork this theme's code" (the Neopets learn-by-tweaking loop) and "reset to preset" as the safety net.

Onboarding asks one low-stakes, reversible question ("How much do you want to make this yours?") to self-segment.

### Security rails
- **Local-only profiles:** Shadow DOM (layout isolation — a bad `position:fixed` can't brick the app chrome) + CSS allowlist parsing (postcss-sanitize: strip `@import`, non-self `url()`, `position:fixed/sticky`, extreme z-index) + DOMPurify for HTML + app-wide CSP blocking remote origins.
- **Shared-to-friend profiles:** sandboxed iframe, **no** `allow-scripts`, **no** `allow-same-origin`, frame CSP `default-src 'none'; img-src 'self' data:` — scoping stops style leakage but **only CSP stops CSS exfiltration** (`background:url(evil)` beacons, `:has()` attribute leaks). No JS ever; curated embed allowlist (SpaceHey model).
- Never place authenticated actions (unfriend/export/delete) in the same stacking context as user CSS. **Viewer "Plain view" always available** — global user overrides (motion, contrast, plain view, hide-gamification) beat author intent.

### Colour & font architecture
- Compute in **OKLCH** (via `culori`); generate a **Radix-style 12-step semantic scale** from one seed (each step has a fixed job; text steps guaranteed readable); **solve-for-tone** rather than audit (Material HCT / Adobe Leonardo model); dark mode = re-derived from seed, never inverted; target WCAG 2 AA for compliance with APCA as perceptual cross-check (APCA is *not* an adopted standard).
- Fonts: `system-ui` default; bundled self-hosted WOFF2 only (**never** Google Fonts CDN — GDPR ruling LG München 2022); OpenDyslexic offered honestly as "a preference some people like" (peer-reviewed evidence shows no reading benefit; what helps is sans-serif, 12–14pt+, spacing, left-align — already AccessibilitySettings levers).
- **Stable theming API before Tier 3 ships:** published CSS custom-property names (`--os-color-*`) as the contract (never internal class names — the BetterDiscord anti-pattern); theme files carry a `version` field (theme.json model); deprecate-don't-delete with var aliasing. Maps onto the User Data Preservation invariant: a saved theme never silently breaks.

### Plural-community profile conventions (out-of-box field targets)
- **PluralKit:** per-field privacy (name/avatar/pronouns/birthday/banner each individually), year-hidden birthdays, banner, colour.
- **Simply Plural/Apparyllis:** typed custom fields with per-field visibility; custom fronts ("blurry", "asleep"); **privacy buckets** (tag content and friends into buckets). *Simply Plural announced discontinuation March 2026 — a migration opportunity.*
- **Carrd/Toyhouse conventions:** signature quote/lyric, likes & dislikes, source/origin, playlist/theme song, aesthetic/moodboard, boundaries/DNI, kin, tabbed layouts.
- Early-web affordances worth reviving: "still figuring themselves out" (under-construction) status, "last tended" dates, guestbook (surface existing `AlterMessage`), bundled blinkies/stickers/cursors, per-alter theme song, systems webring on Friends, "recently tended" row on the alters directory.

---

## Part 6 — Convergences, tensions, and open decisions

### Where all four streams independently agree
1. **Curated preset bundles/galleries with pre-checked recommendations** — for symptoms (Bearable), themes (Tumblr/Notion), and onboarding generally. The single most repeated finding.
2. **Opt-in gamification / anti-shame** — trauma-informed design, tracker-fatigue science, and safe-messaging literature all land here independently.
3. **Skip-safe defaults + progressive disclosure** over global modes and mandatory wizards.
4. **"Authors free, viewers final say, app owns the floor"** — resolves customization-vs-accessibility cleanly.
5. **Amnesia as a first-class design constraint** — replayable onboarding, "can't tell" options, unknown attribution, memory-support patterns, biometric unlock.
6. **Tour demoted from push to pull.**

### Tensions the design must resolve
| Tension | Proposed resolution (from research) |
|---|---|
| Geocities maximalism vs sensory-calm defaults | Calm AA default; loud = author opt-in; viewer can always strip (Plain view) |
| Deep terminology customization vs i18n | Near-term fine (English); long-term: explicit user-supplied forms, no mechanical conjugation |
| COGA "consistent navigation" vs user-reorderable nav | User-initiated change is fine (it's *unexpected* change that harms); defaults stay stable |
| Richer tracking vs burden + OCD hazard | Small default sets, opt-in bundles, coarse OCD items, 30s check-in budget |
| CLAUDE.md "tour = primary onboarding" vs research | Keep tour accuracy rules; change front-door framing to defaults + empty states + contextual tips |
| Streak triggers already shipped (`streak_milestone_hit` etc.) vs anti-shame findings | Make gamification globally hideable; recovery-first streaks; never render gaps as failure |

### Decisions log (owner, July 2026)
1. **Distress config keeps the existing tap-to-toggle pattern** (`CustomEmotionsManager.jsx` — tap an emotion to toggle distressing, per-group counts, custom emotions carry `is_distressing`). Onboarding's emotion step reuses this same interaction, plus explains the distress→grounding-prompt link.
2. **Root emotion categories: no new roots — but user-renamable** (e.g. "Good" → "Positive"). Much smaller scope than a data-driven wheel: name overrides in settings, structure stays.
3. **Checked-but-unrated survives**: it means "the symptom occurred", severity treated as **"average"** in analytics. Implementation nuance still open: keep stored as `severity: null` (data honesty — never fabricate a number) and impute at analytics time; imputation source = scale midpoint (deterministic, simple) vs the user's personal mean for that symptom (more accurate, but drifts over time and makes historic charts non-reproducible). Leaning midpoint.
4. **Biometric unlock must ship with a recovery-code backup** (fingerprint unavailable / hardware changes). Standard pattern: one-time recovery code generated at encryption setup.
5. **Onboarding shape**: keep the current guided section and walkthrough; refine the flow *after the welcome screen*. Trust/local-first messaging up front ("no servers, no syncing, no data sold — and no cloud copy: if it's lost from the device it's lost for good"). **Backups + the existing auto-backup toggle as the final onboarding section.** A "configure quick check-in" step offering **Express** (curated defaults) vs **Customize** (full preset-picker walk) — the installer express/custom pattern, which is exactly the research's self-segmentation finding.
6. Check-in explainer covers: enter as much or little as you like; any data is useful (fills amnesia gaps); emotions general→specific to aid alexithymia; body/nervous-system section; custom emotions addable right there; distressing emotions → quick-support modal explained at this step.

### Decisions round 2 (owner, July 2026)
7. **Security hardening happens NOW, not later** — position:fixed blocking, url() filtering, CSP. Build on a solid foundation rather than deferring.
8. **Profile sharing will ship via user self-hosted servers**, not a developer-hosted service — the app must outlive its creator. This makes the shared-profile (Context B) threat model real and permanent: a friend's server is *never* a trusted party, so rendered shared content must be sandboxed client-side regardless of server behaviour.
9. **Opt-in packs approved** as described in Part 2.
10. **Checked-but-unrated = midpoint imputation** approach approved.
11. **Onboarding sequence decided:** basics first → introduce Quick Check-In → set up profile → custom terminology → emotions/symptoms/habits/diary card config ("the entire quick check-in can be customized!") → transition to the alters page → explain that **front tracking is optional and togglable**, and analytics fall back to **authored-content attribution** (emotions/symptoms/journals etc. associate with alters via authorship) for users who don't actively track front.
12. **Green light to compose/construct the designs** discussed, then owner tests → refine/bugfix cycles. Prerequisite: granular scan of the app's existing state first.

### New feature requirement surfaced: passive front attribution
Front tracking must be optional. When off (or simply unused), analytics should still associate emotions/symptoms/entries with alters based on **who authored the content** (existing `alter_id` fields on EmotionCheckIn, SymptomCheckIn, JournalEntry, DiaryCard, Bulletin author, chat speakers…) rather than who was fronting. Needs: a front-tracking toggle, attribution-source abstraction in analytics, and onboarding copy explaining it.

### Existing-infrastructure addendum (audit round 2 — much already built)
- **Auto-backup already exists and is sophisticated** — `src/lib/autoBackup.js`: modes `off | auto | reminder`, user-pickable interval, native silent-write to Documents vs share-sheet, web fallback; plus `nativeBackupScheduler.js`. Onboarding only needs to *surface* the toggle, not build it.
- **Distress toggle UI already exists** — `CustomEmotionsManager.jsx` (see decision 1).
- **Alter-bio custom CSS already exists** — `src/lib/scopedBioStyle.js`: extracts `<style>` blocks, prefixes every selector with a per-profile scope class, renames `@keyframes` (incl. inline `style=""` animation refs), drops `@import`, strips `javascript:`/`expression(`, never-throws fallback strips styles entirely. **Gaps vs the research's hardening list:** `position:fixed/sticky` not blocked (scoping does NOT neutralize fixed positioning — a bio can still overlay app chrome), `url()` values untouched (remote images/fonts can load → IP leak; app has **no CSP** in index.html/vercel.json), `@font-face` kept verbatim, z-index unconstrained. Bios do **not** appear to be shared via friendsApi today → threat model is Context A (local-only), so severity is moderate — but harden before any profile-sharing feature ships.
- **Bio template gallery already exists** — `src/lib/bioTemplates.js` + `BioTemplatePicker`: full-page designs AND stackable modules (header/about/likes-dislikes/divider), theme-aware via CSS vars, `data-edit` fillable spans, lazy-loaded, offline-only rule, animations via scoped keyframes. This IS the research's Tier-1 "theme gallery" and the module system in embryo.
- **Custom font uploads already exist** — `localFontStorage.js` (data-URLs in IDB) + `CustomFont` entity — matches the self-hosted/no-CDN recommendation out of the box.
- **Importers from other plural apps already exist** (Simply Plural, Octocon, PluralSpace, OpenPlural, Ampersand — `DataBackupRestore.jsx`), relevant to the Simply Plural-discontinuation migration opportunity.
- Net effect on the customization roadmap: Tier 1 (gallery) and Tier 3 (raw HTML/CSS, scoped) exist; the missing middle is **Tier 2 typed theme-options**, the **seed-colour → accessible palette engine**, **viewer plain-view/reader mode**, **per-field privacy**, and **hardening (CSP, position:fixed, url() allowlist)**.

---

## Appendix — Full research reports
The four full reports (with all citations) are preserved in the session scratchpad under `research/01–04*.md`; key citations are inlined above. Major sources: NN/g (progressive disclosure, modes, empty states, overlays), Smashing 2026 "Designing for Distressed Users", W3C COGA "Making Content Usable", WCAG 2.2, UK Home Office accessibility posters, Stimpunks, Epstein lapse/abandonment papers, Li/Dey/Forlizzi stage model, DES-II/SCID-D/MID-60/Cambridge DP Scale domain structures, ICD-11 CPTSD/DSO, Grossman polyvagal critique, STAR Institute sensory patterns, arXiv 2501.13308 (OCD tracking hazard), Samaritans/SPRC/#chatsafe safe messaging, structural-zero and informative-presence statistics literature, Obsidian Style Settings, Tumblr theme docs, WordPress theme.json, PluralKit/Apparyllis docs, Samy worm, PortSwigger CSS exfiltration, Radix Colors, Material Color Utilities, Adobe Leonardo, culori, LG München Google Fonts ruling, OpenDyslexic studies (Rello & Baeza-Yates 2013; Wery & Diliberto 2017), BDA Style Guide 2023.
