# Oceans Symphony — Low-Vision Accessibility Audit & Plan

**Role:** Disability-accommodations / digital-accessibility inspection.
**Scope:** Low-vision users specifically (the lived-experience target: people who
enlarge UI and currently hit overlapping, broken layouts). Branch:
`claude/accessibility-mode`. Status: **research + audit (no app behaviour changed
yet)**.

> TL;DR — Today's accessibility is *additive scaling*: a single root
> `font-size` knob (50–200%) bolted onto a layout designed for one size. Best
> practice is a mode that **reflows to a single column, condenses chrome,
> guarantees real contrast and target sizes, and (ideally) respects the OS
> text-size setting** — it *reconfigures* the layout instead of enlarging it.
> The overlap the user reports is the predictable result of rem-scaling a
> non-reflowing layout.

---

## 1. Executive summary

Oceans Symphony has a *better-than-average set of accessibility levers* for a
hobby app (adjustable text 50–200%, reduce-motion, a contrast boost, adjustable
nav height, a hyperlegible font option, an anonymise/blur mode). But the levers
are **scaling levers, not layout levers**, and they are applied to a layout that
assumes a fixed size. The result:

- **At ≥ ~137%, elements overlap** because components use fixed pixel sizes,
  absolute positioning, fixed-column grids, a fixed-height bottom nav, and an
  SVG map that doesn't reflow.
- **"High contrast" is a 15% CSS `filter`**, which neither *guarantees* WCAG
  ratios nor addresses non-text contrast — and `filter` on `<html>` can break
  `position:fixed` descendants.
- **Landscape is poor** because the header is a fixed, tall, decorative block
  that eats vertical space.
- **Screen-reader support is "best effort"** — no audited focus order, skip
  links, live regions, or systematic labelling.

**The fix is not "scale harder."** It is a dedicated **Accessibility Mode** that
switches the app into a single-column, large-target, high-contrast, condensed-
chrome configuration — i.e. the documented low-vision pattern of *reflowing to a
single column* ([W3C Low Vision TF](https://www.w3.org/WAI/GL/low-vision-a11y-tf/wiki/Reflow_to_Single_Column)).

---

## 2. The standards we're measuring against

### 2.1 WCAG 2.2 success criteria most relevant to low vision

| SC | Level | What it requires (plain) | Source |
|---|---|---|---|
| **1.4.3 Contrast (Minimum)** | AA | Text ≥ **4.5:1** (≥ **3:1** for large text ≥ 18.66px bold / 24px). | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html), [WebAIM](https://webaim.org/articles/contrast/) |
| **1.4.6 Contrast (Enhanced)** | AAA | Text ≥ **7:1** (≥ 4.5:1 large). The target for a *high-contrast mode*. | [WebAIM](https://webaim.org/articles/contrast/) |
| **1.4.4 Resize Text** | AA | Text resizable to **200%** with no loss of content/function. | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html) |
| **1.4.10 Reflow** | AA | Content usable at **320 CSS px width** (≈ 1280px @ 400% zoom) with **no two-dimensional scrolling** — i.e. reflow to a single column. | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html), [Deque](https://dequeuniversity.com/resources/wcag2.1/1.4.10-reflow) |
| **1.4.11 Non-text Contrast** | AA | UI components & meaningful graphics ≥ **3:1** vs adjacent colours (borders, icons, focus rings, form fields). | [Silktide](https://silktide.com/accessibility-guide/the-wcag-standard/1-4/distinguishable/1-4-11-non-text-contrast/) |
| **1.4.12 Text Spacing** | AA | No loss when users set line-height 1.5×, paragraph spacing 2×, letter 0.12em, word 0.16em. | [DigitalA11Y](https://www.digitala11y.com/understanding-sc-1-4-12-text-spacing/) |
| **1.4.8 Visual Presentation** | AAA | Single-column option, ≤ 80 chars/line, no justified text, line-height ≥ 1.5, user-selectable colours. The blueprint for a low-vision reading mode. | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html) |
| **2.5.8 Target Size (Minimum)** | AA (2.2) | Targets ≥ **24×24 CSS px**, or spaced so a 24px circle doesn't overlap a neighbour. | [Deque](https://dequeuniversity.com/resources/wcag2.1/1.4.10-reflow) |
| **2.5.5 Target Size (Enhanced)** | AAA | Targets ≥ **44×44 CSS px** — the iOS HIG / accessibility-mode target. | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html) |
| **1.3.4 Orientation** | AA | Don't *restrict* to one orientation — landscape must work (so the header-eats-landscape issue must be fixed, not by locking portrait). | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/orientation.html) |
| **2.4.7 Focus Visible** | AA | Keyboard/switch focus must be clearly visible (≥ 3:1, 1.4.11). | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html) |
| **1.4.13 Content on Hover/Focus** | AA | Hover/focus popovers must be dismissable, hoverable, persistent. | [W3C](https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html) |

### 2.2 Mobile-specific guidance

- **Respect the OS text-size setting, don't reinvent it.** Apple **Dynamic
  Type** and Android **`sp` font scaling** are the canonical mechanisms; users
  expect *one* system slider to enlarge *every* app. Apps that ship their own
  in-app scaler and ignore the OS setting force double configuration and tend to
  break. ([Apple Dynamic Type](https://developer.apple.com/documentation/uikit/scaling-fonts-automatically),
  [Android text scaling](https://support.google.com/accessibility/android/answer/12159181),
  [Deque mobile text scaling](https://docs.deque.com/devtools-mobile/2025.7.2/en/text-scaling/))
  - For our **web/PWA** target, this means honouring the browser/OS font-size
    via `rem` *and* `prefers-*` media queries; for the **Capacitor native**
    target, a WebView honours the system WebView text-zoom — both point to "size
    everything in `rem`, don't fight the OS."
- **Android caveat:** font scaling is **non-linear** above ~AX sizes; don't
  hardcode maths off `scaledDensity` — let CSS `rem` + reflow handle it.
  ([Android dev](https://developer.android.com/develop/ui/compose/accessibility/scalable-content))
- **BBC Mobile Accessibility Standards** codify text-resize, reflow, target
  size, and orientation for exactly this kind of cross-platform app.
  ([BBC standards](https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/BBC_Mobile_Accessibility_Standards_and_Guidelines))

### 2.3 The core low-vision pattern: **reflow to a single column**

> "The intent … is to support people with low vision who need to enlarge text to
> a point where the responsive layout should *reflow into a single column*."
> — [W3C Low Vision Task Force](https://www.w3.org/WAI/GL/low-vision-a11y-tf/wiki/Reflow_to_Single_Column)

As the user enlarges, line length shrinks; at a threshold the layout should
**collapse to one column** and only scroll vertically. The mechanism: **size in
relative units, use `em`-based breakpoints / container queries, set
`min`/`max-width` constraints, let text wrap, and avoid fixed heights & absolute
positioning** ([dev.to: responsive design for low vision](https://dev.to/yuridevat/responsive-design-for-users-with-low-vision-18ib)).

---

## 3. Current-state inventory (what the code actually does)

| Capability | Where | Mechanism |
|---|---|---|
| Text size 50–200% | `src/lib/useAccessibility.js`, `src/index.css` (`html.a11y-text-* { font-size: % }`) | **Root `font-size` rem-scale.** No reflow, no breakpoints keyed to it. |
| High contrast | `index.css` `html.a11y-high-contrast { filter: contrast(1.15) saturate(1.1) }` | Global CSS filter — *approximate*, not a contrast-guaranteed theme; `filter` on `<html>` can break `position:fixed`. |
| Touch target | `index.css` `a11y-touch-{comfortable,large}` | `min-height: 44/52px` only (not width); excludes `role=switch`. |
| Reduce motion | `index.css` `a11y-reduce-motion *` | Good — zeroes animation/transition durations. (Doesn't yet also honour `@media (prefers-reduced-motion)`.) |
| Bottom-nav height | `--bottom-nav-height` (44–80px) | Good lever; `app-content-main` reserves space for it. |
| Fonts | `useAccessibility` font-family + heading-font; **Atkinson Hyperlegible** offered | Strong — hyperlegible option is a genuine low-vision win. |
| Anonymise/blur | `useAnonymizeMode` | Screenshot privacy, not vision (orthogonal). |
| Settings home | `AccessibilitySettings.jsx` (UI-size/touch/nav moved to Appearance) | The levers are scattered between *Accessibility* and *Appearance*. |
| Screen reader | "relies on OS + labels" | No audited focus order / skip links / live regions. |
| Header / landscape | `AppLayout.jsx`, `HeaderWaveBlock.jsx` | Fixed, tall, decorative header (wave block + system banner) — dominates landscape. |

---

## 4. Gap analysis (app vs. standard)

| SC / guideline | Status | Why |
|---|---|---|
| 1.4.4 Resize 200% | ⚠️ Partial | Text *does* scale to 200%, but **content is lost to overlap** → fails the "no loss of content/functionality" clause at large sizes. |
| **1.4.10 Reflow** | ❌ **Fails at large sizes** | No single-column reflow; fixed grids/absolute layouts/SVG map produce 2-D scrolling & overlap. **The headline gap.** |
| 1.4.3 Contrast | ⚠️ Unknown/partial | User-chosen alter/group colours + tints are *not* contrast-checked (there's a `needsHalo` helper, but it's spot-applied). Muted-text styles risk < 4.5:1. |
| 1.4.6 Enhanced (7:1) | ❌ Missing | The contrast "mode" is a filter, not a 7:1-guaranteed theme. |
| 1.4.11 Non-text contrast | ⚠️ Partial | Many 1px hairline borders / faint icons at `/40`–`/50` opacity likely < 3:1. |
| 1.4.12 Text spacing | ⚠️ Untested | Tight line-heights in dense lists; no "comfortable spacing" option. |
| 1.4.8 Visual presentation (AAA) | ❌ Missing | No single-column reading mode, no max line length, no user-selectable text/bg. |
| 2.5.8 Target 24px | ⚠️ Partial | Many icon buttons are `w-7 h-7` (28px — ok) but some `w-3.5`/icon-only hit areas and dense toolbars are < 24px or < 24px-spaced. |
| 2.5.5 Target 44px (AAA) | ❌ Off by default | Only when "large touch" is on, and it's `min-height` not `min-size`. |
| 1.3.4 Orientation | ⚠️ Not restricted but poor | Landscape works but is unusable-tall-header. |
| 2.4.7 Focus visible | ⚠️ Untested | Custom controls (SVG nodes, divs-as-buttons) likely lack visible focus. |
| Screen reader | ⚠️ Partial | Divs-as-buttons (e.g. SVG map nodes, some list rows) lack roles/names/focus. |
| Respect OS text size | ❌ Custom scaler only | App ships its own 50–200% scaler; doesn't surface "use your device's text-size setting." |

---

## 5. Why "max it out" overlaps — and the right model

**Failure mode (today):** `html { font-size: 200% }` makes every `rem` twice as
big, but a `w-44` panel, a `grid-cols-3`, a `320px` SVG, an `absolute bottom-2`
popover, and a `h-14` nav **don't reflow** — they're either fixed px or fixed
column counts, so doubled text spills out of fixed boxes and fixed boxes collide.

**Right model (Accessibility Mode):** treat large text as a *trigger to change
the layout*, not just the type scale:

1. **Single column.** Collapse multi-column grids (alters grid, dashboard tiles,
   settings rows, report sections) to one column.
2. **Relative everything.** `rem`/`em` sizes, `clamp()` fluid type, `min`/`max-width`,
   `em`-based breakpoints / container queries — never fixed heights on text
   containers.
3. **Let it wrap, never truncate.** Replace `truncate`/fixed-height chips with
   wrapping text in this mode.
4. **Bigger targets + spacing.** ≥ 44px targets, ≥ 24px gaps (2.5.5/2.5.8).
5. **Condense chrome.** Replace the decorative wave header with a slim text bar;
   simplify the bottom nav to large labelled icons.
6. **Real contrast theme.** A token-swapped high-contrast palette hitting 7:1
   body / 3:1 non-text — not a filter.
7. **Reading mode for long content** (bios, journal, reports): one column,
   ≤ 70ch, line-height ≥ 1.6, user-selectable colours (1.4.8).
8. **Respect/surface the OS setting**: keep sizing in `rem` so the WebView/OS
   zoom works, and add a "Use your device's text-size setting" explainer.

---

## 6. Landscape & header (the specific pain point)

- **1.3.4** says don't lock orientation — so the goal is a *good* landscape, not
  a forced portrait.
- The header (`HeaderWaveBlock` + system banner) is a tall decorative block.
  **In Accessibility Mode and/or landscape, replace it with a single-row slim
  bar** (title + back + the 2 essential actions), reclaiming vertical space.
- Make the header **`position: sticky` and auto-condense** on scroll/landscape
  rather than a fixed tall block.
- Optionally, **prompt** the user (once) to rotate to landscape when text is very
  large, since a single column at huge type uses landscape width well — but only
  as a suggestion (never a requirement, per 1.3.4).

---

## 7. Screen-reader & motor (adjacent wins)

- **Replace divs-as-buttons** (SVG map nodes, list rows, custom toggles) with
  real `<button>`s or `role`+`tabindex`+key handlers; give every control an
  accessible **name**.
- **Skip link** to main content; **focus management** on route change & modal
  open/close (move focus in, trap, restore on close).
- **`aria-live`** for the toasts/status messages already in the app.
- Honour **`@media (prefers-reduced-motion)`** in addition to the manual toggle.
- Ensure **focus-visible** rings (≥ 3:1) on all custom controls.

---

## 8. Proposed build — phased, by effort

### Phase 0 — Foundations (this branch, low risk)
- [ ] Add an **`a11y-mode` master toggle** (a `<html class="a11y-mode">` flag +
      `useAccessibilityMode()` hook) that gates all of the below.
- [ ] Define **design tokens** for the high-contrast palette + spacing scale.
- [ ] Audit & document the worst fixed-px / absolute / fixed-grid offenders
      (alters grid, dashboard tiles, system map, popovers, header, bottom nav).

### Phase 1 — Quick wins (high value, contained)
- [ ] **Single-column override** in `a11y-mode`: `grid-cols-*` → 1 col for the
      alters grid, dashboard tiles, settings, report sections.
- [ ] **Bigger targets**: default 44px min target **size** (width+height) + 24px
      gaps in `a11y-mode`.
- [ ] **No-truncate** override (`a11y-mode .truncate { white-space: normal }`,
      remove fixed heights on text rows).
- [ ] **Real high-contrast theme** via token swap (replace the `filter`).
- [ ] **Honour `prefers-reduced-motion`**; add **focus-visible** rings globally.
- [ ] **Slim header** in `a11y-mode` (+ in landscape): drop the wave block.
- [ ] Consolidate every accessibility lever back into one **Accessibility**
      panel and add a "Use your device's text-size setting" explainer.

### Phase 2 — Structural reflow
- [ ] Convert the worst offenders to **fluid `clamp()` type + `em` breakpoints /
      container queries** so they reflow to one column at large text.
- [ ] **Reading mode** for bio / journal / therapy-report (1.4.8: one column,
      ≤ 70ch, line-height ≥ 1.6, user colours).
- [ ] **System map**: an accessible **list view** alternative (the SVG canvas is
      inherently inaccessible to SR + low-vision; offer a reflowing list of
      layers → locations → alters, which we already have data for).
- [ ] Landscape-optimised layout (slim sticky header, sidebar nav option).

### Phase 3 — Screen reader & polish
- [ ] Replace divs-as-buttons with real controls + names across the app.
- [ ] Skip link, focus management on route/modal, `aria-live` toasts.
- [ ] Contrast-check every user-colour surface (extend `needsHalo`/`contrast.js`
      to enforce 4.5:1 / 3:1 system-wide in `a11y-mode`).
- [ ] Test pass: 320px reflow, 200% zoom, TalkBack/VoiceOver, target-size, and a
      WCAG 2.2 AA conformance sweep (aim AAA on 1.4.6/1.4.8 in `a11y-mode`).

---

## 9. Guiding principles (the durable base)

1. **Reconfigure, don't enlarge.** Large text triggers a *layout change*.
2. **Relative units + reflow** beat a global scaler. Size in `rem`/`clamp()`;
   reflow at `em` breakpoints; never fix the height of a text box.
3. **Respect the platform.** Honour the OS text-size & reduced-motion settings;
   don't fight them.
4. **Contrast is a theme, not a filter.** Swap tokens to guaranteed ratios.
5. **One column, big targets, wrap not truncate, condense chrome** — the
   low-vision quartet.
6. **It's a *mode*, opt-in, fully reversible** — never silently change a normal
   user's layout.

---

### Sources
- W3C WCAG 2.1/2.2 Understanding: [Reflow 1.4.10](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html) · [Contrast Min 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) · [Visual Presentation 1.4.8](https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html) · [Target Size 2.5.5](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html) · [Orientation 1.3.4](https://www.w3.org/WAI/WCAG21/Understanding/orientation.html) · [Focus Visible 2.4.7](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html)
- W3C Low Vision Task Force — [Reflow to Single Column](https://www.w3.org/WAI/GL/low-vision-a11y-tf/wiki/Reflow_to_Single_Column)
- [WebAIM — Contrast & Color](https://webaim.org/articles/contrast/)
- [Deque — Reflow guide](https://dequeuniversity.com/resources/wcag2.1/1.4.10-reflow) · [Deque — Mobile text scaling](https://docs.deque.com/devtools-mobile/2025.7.2/en/text-scaling/)
- [Silktide — Non-text Contrast 1.4.11](https://silktide.com/accessibility-guide/the-wcag-standard/1-4/distinguishable/1-4-11-non-text-contrast/) · [DigitalA11Y — Text Spacing 1.4.12](https://www.digitala11y.com/understanding-sc-1-4-12-text-spacing/)
- [BBC Mobile Accessibility Standards](https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/BBC_Mobile_Accessibility_Standards_and_Guidelines)
- [Apple — Scaling fonts automatically (Dynamic Type)](https://developer.apple.com/documentation/uikit/scaling-fonts-automatically)
- [Android — Text scaling](https://support.google.com/accessibility/android/answer/12159181) · [Android — Scalable content](https://developer.android.com/develop/ui/compose/accessibility/scalable-content)
- [Responsive design for users with low vision (dev.to)](https://dev.to/yuridevat/responsive-design-for-users-with-low-vision-18ib)
