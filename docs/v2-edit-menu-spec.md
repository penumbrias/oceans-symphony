# The unified UI edit popup — spec

Source: the user's wireframe (Aug 13, 2026) plus their written clarifications.
This is THE structure for every UI edit menu in v2 — page display options,
widget options, home screen settings, profile theming. One popup, one anatomy.
Deviations from this doc are design changes and go back to the user first.

## Anatomy rules (apply to the whole popup)

- **Expandable sections** with chevron headings. Sections below in order.
- **No accidental adjustments:** every adjustment row (sliders: content width,
  spacing, border width, radius, sizes…) renders its NAME plus a clearly
  VISIBLE "set" button/icon on the edge OPPOSITE the content alignment
  (content left-aligned → button on the right). The slider itself is hidden
  until the user taps that button — the button is always on screen, the
  slider never is until asked for. (Distinct from the wireframe's `[SET n]`
  shorthand, which was only the user's notation for repeated groups.)
- **Color boxes** open the shared color picker, which includes the opacity
  toggle tied to that specific color.
- **Every image slot** offers direct upload OR the asset library, including
  asset library folders.
- **Font pickers** include the user's custom uploaded fonts.
- The wireframe's `[SET n]` labels were the user's shorthand for repeated
  component groups — build them as shared components; never surface any
  "set group" language in the UI.

## Sections

### 1. UI SIZE (every surface)

- Content width
- Touch target spacing (top | bottom | left | right | all)
- Border width
- Corner radius
- Content alignment (top/bottom · left/right)
- Font family (body + header)
- Font size & style (body + header)

### 2. BAR SIZES + LAYOUT (page-level surfaces only — never widgets)

- **Top bar:** height · arrangement/layout · icon images & labels (rename +
  per-item display toggle) · icon size · spacing · wave animation (color +
  on/off)
- **Bottom bar:** on/off + the same bar-content block
- **Side bar:** on/off · icon + header label · align left/right edge
- **Quick action bar:** on/off · placement: behind bottom bar / behind top
  bar / in side bar / floating edge (bar or bubble)
- **Alter bar:** on/off · side display · wave on/off · name/alias labels

### 3. COLORS

Eight roles, each a color box (picker + per-color opacity):

Background · Surface · Primary · Secondary · Accent · Muted · Text (body) ·
Text (header)

These come from the classic custom layout's roles and apply to the new UI
equally. The governing principle: **every visible color is user-settable.**

### 4. BACKGROUND

One of:
- **Flat:** a color OR an image.
- **Gradient:** two-plus stops (`+` adds stops); each stop is a color OR an
  image; shape linear or radial ("orbit"); transition degree/position;
  strength.
- **Image:** position mode — cover, fill, tile, stretch to fit, center…

Audio: setting an audio file as background also sets it as the **page song**,
with the same volume + autoplay controls as alter profile music.

### 5. PRESETS

- Current preset shown; actions: edit/rename · duplicate · save new.
- Saving captures **size and/or color** — separately or together.
- Optional **link to alter** — the existing behavior: the preset applies when
  that alter is set as fronting.
- Built-in and custom lists, for size presets and color presets.
- **Apply this preset to…** — the existing widget "apply this style to…"
  flow, expanded: target specific widgets, or set as the page default.
- Partial presets keep the star marker + exclusions popup behavior.

## Rollout

1. Popup shell + SIZE + COLORS + BACKGROUND + PRESETS, mounted on page-level
   Display Options as the testbed.
2. Same popup on widget options (no bars section).
3. BAR SIZES + LAYOUT section.
4. Every remaining UI edit menu migrates onto the popup.
