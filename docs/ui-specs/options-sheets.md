# Options sheets — shell spec

The ONE sheet shell used by all three live-adjust surfaces:

| Sheet | Component | Opens from |
|---|---|---|
| Display options | `V2Frame.jsx` → `OptionsSheet` (body = `UiEditSheet`) | Top bar → page menu → Display options (any page except `/`) |
| Home screen settings | `ExperimentalDashboard.jsx` home-settings drawer (board pills + `UiEditSheet` body) | On `/`: the same menu entry, the board cog, `os-v2-home-settings` |
| Widget options | `WidgetConfigSheet.jsx` | A widget's Configure button; the pinned-bar gear (any page → routes home with `bar-options`) |

**Same surface, one route rule:** "Display options" on the home page IS the
Home-screen-settings drawer (`requestHomeAction(…, "home-settings")`) — the
two must never fork into lookalikes.

## Shell anatomy (top → bottom for a bottom-docked sheet)

1. **Resize grab bar** — `PeekHandle` from `components/v2/PeekResize.jsx`.
   Always present; drag sets the sheet height 15–90vh, stored in
   `localStorage.symphony_options_peek_h` (ONE key — all three sheets share
   the remembered height; default 85). `data-vaul-no-drag` +
   `stopPropagation`: the drawer's swipe-to-dismiss never sees it. vaul's
   decorative pill is hidden (`DrawerContent hideHandle`). No label.
2. **Header row** — close chevron (left), title, actions (right).
   - Close: bare icon button, `ChevronDown` when bottom-docked /
     `ChevronUp` when top-docked (points the way the sheet leaves),
     `aria-label="Close"`, `p-1 -ml-1`.
   - Title: `text-base truncate`; `DrawerDescription` is `sr-only`.
   - Dock flip: `w-8 h-8` bordered icon button, `ArrowUpToLine`/`ArrowDownToLine`.
3. **Body** — `px-4 overflow-y-auto overscroll-contain`, bottom padding
   `calc(env(safe-area-inset-bottom) + 24px)`.

## Behaviour

- `Drawer modal={false}`; while open, `html[data-v2-peek="1"]` keeps the
  overlay transparent — the app stays visible and interactive because
  every control applies instantly (there is no Save).
- There is **no Peek/Full-panel mode** (removed v0.194.0). Resizing the
  sheet IS the peek.
- Dock top/bottom is remembered (`DOCK_KEY`), shared across the sheets.
- Widget options extra: on open, scrolls its widget into view; carries
  the per-widget sections (Widget config / UI & text / Colors & background
  / Presets / Icon for shortcuts) — see display-options-content.md for the
  shared section grammar.

## Don'ts

- No second close control (the dialog shell's X vs an in-header X — one
  only; for these drawers it's the chevron).
- No visible explainer text anywhere in the shell.
- Don't introduce a new sheet for an existing surface — extend the one
  that exists.
