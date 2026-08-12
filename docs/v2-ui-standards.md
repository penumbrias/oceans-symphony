# UI v2 — standards

The rules a new v2 surface must satisfy. If a rule here and a habit from the
classic UI disagree, this document wins.

## 0. What the rebuild is

**Rebuild functions, not pages.** The classic UI is the reference for what a
feature needs — its inputs, its configuration, its edge cases — and NOT for
how those are arranged, named, or drawn.

The app's features grew up separately, each without knowledge of the others,
so they duplicated concepts and disagreed about shared data. v2 has the whole
picture. So the unit of work is "render this function well", not "port this
page". One function may end up as a widget, a page, and a sheet — all three
built from the same component, not three lookalikes.

Corollary: when two classic surfaces do the same job differently, v2 picks
one and both use it. Never carry a disagreement forward.

---

## 1. Language and text

1. **Every user-visible string goes through `useT()`** with its key in
   `src/locales/en.js`. No literal English in a component. i18n interpolation
   is SINGLE braces — `"Search {members}…"` — passed as `tr(key, { members })`.
2. **Terminology follows the user's own words.** Anything meaning
   system / alter / fronting / fronter / switch / headmate resolves through
   `useTerms()`. "headmate" and "headmates" are banned literals — always
   `t.alter` / `t.alters`. Compound words count (`${t.system}-wide`).
   Locale strings may carry a `{term}` var filled from `useTerms()`.
   Static configs that can't call hooks defer label resolution to the
   consumer (the `resolveLabel` pattern).
3. **Member names render through `useAlterLabel()`**, never raw
   `alter.name` / `alter.alias` — the user chooses name / alias / both.
4. **Tone: minimal, direct, as needed.** Not cold, not chatty, not
   personified. No explanatory asides in the interface; explanation belongs
   in the tour, the docs, or nowhere. Exceptions: Quick Support and the
   Learn modules, which are allowed to be warm.
5. **Changelog entries are 1–2 short sentences**, user-facing only, no
   internal names.

## 2. Data

6. **One data structure. A change anywhere is a change everywhere.** No
   feature keeps a private copy of shared state. Where data is unavoidably
   stored twice (historical shapes), there is exactly ONE write path that
   maintains both, and reads go through one shared helper. See
   `src/lib/groupMembership.js` for the worked example — three editors each
   writing a different subset is what made group membership unreliable.
7. **Never silently lose or overwrite.** Immutable logs (StatusNote,
   Location, check-ins) always `create`, never `update`. Schema additions
   default gracefully. Removing a data source requires proving the new one is
   fully populated.
8. **New entity ships with backup wiring in the same commit** — both
   `ENTITY_NAMES` and `EXPORT_CATEGORIES` in `DataBackupRestore.jsx`. Only in
   one = silently dropped from exports. Device-bound entities are excluded
   AND documented.
9. **Sync conflicts are shown, never resolved silently.** If two devices
   disagree, surface both and let the user choose. Merge-import must not
   clobber singletons. Deletions only propagate when the user opts in.
10. **Storage-layer invariants** (see CLAUDE.md) are non-negotiable: never
    return an empty DB when data exists on disk, never trust localStorage to
    decide "first run", salt lives inside the encrypted envelope, destructive
    recovery writes a raw backup first.
11. **Query keys: one key, one fetcher shape.** A bare key (`["alters"]`) is
    the standard full list. Narrower variants get a suffix
    (`["frontHistory", "recent50"]`). Two different fetchers under one key
    poison each other's cache.

## 3. Actions that change data

12. **Destructive or bulk actions are previewable and configurable.** "Copy
    last week" must show what it will copy and let the user narrow it before
    it runs. Deletes state what else is affected. Nothing bulk happens on a
    single unconfirmed tap.
13. **Prefer archive over delete.** Anything a user builds (groups,
    subsystems, alters, categories) should be archivable — recoverable,
    hidden from lists, still in backups. Deletion is a separate, explicit act.
14. **The user decides; the app doesn't.** When there's ambiguity, present
    it. Don't pick for them and don't hide that a choice was made.

## 4. Components and reuse

15. **Reuse the established v2 element; never import classic UI.** The reuse
    rule is about ELEMENT CLASSES, not files. When a surface needs an alter
    picker, a tree select, a multi-list, a sheet — v2 has an established one;
    use it. Rebuilding that element from scratch is a violation. Forking it
    is a violation. Both mean fixing the same bug in N places forever.

    The other direction is equally binding: **classic (v1) components do not
    get imported into v2 surfaces.** The classic UI is a reference for what a
    function needs — never a source of parts. A v2 surface that opens a v1
    modal (the planner's "Open" → old popout) is broken under this rule, even
    if it works: it drags the old structure, styling and gaps into the new
    UI. If no v2 equivalent exists yet, build one under v2 structure (i18n,
    terms, look variables, portaled overlays, tap-first) — and that component
    becomes the established one everything after it reuses.
16. **One implementation across surfaces.** A function that appears as both a
    page and a widget is ONE component rendered twice with different props
    (see `PlannerSurface`: `dayCount`, `chrome`). Never a page version and a
    widget version.
17. **Recursive renderers are cycle-guarded and depth-clamped.** Every tree
    walk uses the shared, guarded helper (`categoryTreeUtils`, `groupTree`,
    `subsystemUtils`). One bad parent pointer must never be able to hang a
    render — the user would have no way back in to fix the row.
18. **No `setState` in render. No synchronous IDB reads in render.**

## 5. Lists and pickers

19. **Never a bare or unsearchable list of members.** Systems can have
    dozens. Single-select → `AlterSearchSelect`. Multi-select →
    `SearchableMultiList` / the `GroupMembersModal` pattern. Requirements:
    search box, scrollable with `overscroll-contain`, fixed/portaled
    positioning that escapes parent overflow and never hides behind the
    keyboard, terms-aware labels, avatars via `useResolvedAvatarUrl`.
20. **Presence outranks arrangement.** Whoever is fronting sorts first in
    every list that names members — including after a reverse.
    `useAlterSorter` where a sort toggle fits, `useFrontersFirst` where it
    doesn't. Both start from the same ordering.
21. **Hierarchies get a nesting-aware picker, never a flat `<select>`.**
    Groups, subsystems, activity categories, relationship types, inner-world
    maps. Feed depth-tagged options from the matching cycle-guarded
    flattener and indent by `_depth`.
22. **No pill/chip rows for unbounded lists.** Chips are fine for a bounded
    set (weekdays, 5 options). The moment a list can grow with the user's
    data, it needs the searchable picker.
23. **Long lists offer a display toggle** — flat vs grouped/nested — for
    systems with many groups and subsystems.

## 6. Widgets

24. **Follow `docs/widget-contract.md`.** The load-bearing parts:
    - Exactly ONE visible box per widget (`Section`, or `boxStyle()` on a
      tile root). That box consumes the per-widget look variables; a
      hand-rolled container silently ignores the user's settings.
    - Text uses `em`, never bracketed `rem`, so per-widget text size works.
    - Look values arrive as CSS variables via `lookToStyle()`. Never read
      look fields off `settings` directly.
    - Chrome colours use `var(--v2-accent)`. **No theme tokens
      (`bg-background`, `bg-card`, `text-foreground`, `border-border`) in a
      widget's own chrome** — opaque chrome reads `--v2-widget-bg`, with the
      theme token only as the CSS fallback. (The hour gutter shipped as an
      unstyleable slab because of this.)
    - **Compliance test:** set border width, background, text size, text
      colour and accent in the widget's options — all five must visibly
      change.
25. **A widget's full configuration lives in its options sheet**, not only in
    in-widget controls, because widgets are inert in edit mode.
26. **Widgets are cheap to mount.** Scope queries to the visible window;
    don't load an entire history to render one day.

## 7. Platform and layout

27. **One codebase, four targets: web, desktop, iOS, Android, tablet.**
    Branch at runtime via `isNative()`, never at build time. Native-only
    imports go inside an `isNative()` guard so they tree-shake out of web.
28. **Every interaction must work by tap.** Drag may be an accelerator, never
    the only route — it is unusable on touch and for many motor
    accessibility needs. (Groups and the planner both had to be fixed for
    this.)
29. **Reserve the chrome.** Bottom-anchored sheets and fixed elements must
    account for `var(--bottom-nav-height)` (user-configurable — never
    hardcode) plus `env(safe-area-inset-bottom)`.
30. **Overlays portal to `document.body`.** v2 boards are framer-transformed,
    which re-anchors `position: fixed` to the page. Also: React portals
    propagate events through the REACT tree, so a backdrop dismiss handler
    must check `e.target === e.currentTarget` or a portaled dropdown will
    close the dialog that owns it.
31. **Responsive by content, not breakpoint guesses.** If a column can't hold
    its content at a given width, scroll the container rather than shrinking
    to slivers — and keep the structure the user expects (the week stays
    Mon–Sun at every width).

## 8. Gestures

32. **Hold-to-arm, then act.** Press-and-hold is the house gesture for "act
    on this". Moving before the hold completes is a scroll and must cancel.
33. **`pointercancel` ABORTS. Only `pointerup` commits.** Wiring cancel to
    the commit path means the browser stealing the gesture for a scroll fires
    the action.
34. **An armed gesture takes pointer capture** plus a non-passive `touchmove`
    blocker — React attaches touch listeners passively, so `preventDefault`
    in a pointer handler cannot stop a scroll on its own.
35. **Gesture grammar is consistent app-wide.** Tap = open the thing.
    Press-and-hold = act on the thing (level rail, action menu). Don't invent
    per-surface variants.
36. **A surface that owns a hold gesture declares it** (`data-own-hold`), and
    every container hold-gesture (widget options, board edit mode) excludes
    declared surfaces. Two timers arming on one press is how the options
    sheet opened mid-drag.

## 9. Accessibility

36. **Accessibility is the foundation, not a pass at the end.** Real labels
    (`aria-label`, `aria-pressed`, `aria-expanded`), keyboard paths for
    everything (Escape closes overlays), focus that doesn't escape modals,
    and a non-gesture route to every action.
37. **Respect the user's settings** — font size, contrast halo, reduced
    motion, nav height, large touch targets. Minimum 44px for primary touch
    targets.
38. **Never rely on colour alone** to carry meaning.
39. **Content is not clipped by the interface** at any supported size.

## 10. Scale and performance

40. **Design for large systems.** Hundreds of members, thousands of entries.
    Filter before you render, memoise derived work, and never scan a full
    history inside a render loop.
41. **Fetch what's on screen.** Window queries by the visible range; gate
    optional data behind the toggle that reveals it.
42. **Heavy or optional modules load lazily** so they stay out of the main
    bundle.

## 11. Registration checklist

A new v2 surface isn't done until:

- [ ] Strings in `src/locales/en.js`, terms via `useTerms()`
- [ ] Reachable: `navigationConfig` ALL_PAGES + `navCatalogue` + `SidebarNav`
- [ ] `FeatureTour` step, with its `data-tour` anchor
- [ ] Findable in `src/lib/globalSearch.js` if it holds user text
- [ ] New entities in BOTH `ENTITY_NAMES` and `EXPORT_CATEGORIES`
- [ ] Release triple: `changelog.js` + `appVersion.js` +
      `build.gradle` (versionCode AND versionName)
- [ ] `npx vite build` clean, `npx cap sync android`
- [ ] Widget contract compliance test if it's a widget

## 12. Engineering guardrails

These exist because each one shipped a bug:

43. **`no-undef` stays on.** esbuild does no scope checking — a missing
    import or a deleted variable builds perfectly clean and crashes at
    runtime. This rule has caught several.
44. **Every scripted edit asserts its match.** A silent no-op replacement
    looks like success and ships nothing.
45. **Anchor edits on the element, not the line number.** Line-indexed
    insertion has landed JSX inside the wrong element more than once.
46. **Refetch before write** for fronting-session state — closure-captured
    snapshots go stale across a hold delay.
47. **Verify against realistic data**, including the empty case, the broken
    case (cycles, dangling pointers) and the large case.
48. **A layout setting must never be able to make its own undo unreachable.**
    Any user-adjustable size/width/scale gets an apply-time floor above the
    point where the app — including the control itself — stops being usable.
    (Content width at 40px collapsed everything, Settings included, into a
    strip.)
49. **Reproduce with the data state that makes conditional chrome appear.**
    Banners, reminders and review cards render only under data conditions —
    an empty preview proves nothing about them. (The invisible tappable
    banner was unreproducible for three rounds because the preview had no
    upcoming plan.)
