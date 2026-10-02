import React from "react";
import { useAlterHoldRail } from "@/components/alters/AlterHoldRail";
import { useFrontGesture } from "@/components/fronting/FrontLevelRail";
import { useFrontLook } from "@/lib/frontLook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Pin, Star, Zap, Settings as SettingsIcon } from "lucide-react";
import { openBarsEditor } from "@/lib/barsModel";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import useAnonymizeMode, { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import { shapeLayerStyles } from "@/lib/avatarShapes";

// Self-contained horizontal gallery of pinned alters. Used on the
// alters directory (above groups) AND as a Dashboard element, so it
// fetches its own data and renders nothing when no alter is pinned.
//
// Per-chip gestures — the app-standard grammar (v0.122.0):
//   - tap             → open the alter's profile
//   - press-and-hold  → the fronting-level rail (Remove stop included;
//                       holding a non-fronter adds them at the level
//                       released on)
// The old vertical swipes are gone: hold-to-trigger can't misfire while
// the strip scrolls, so no hint labels or recovery choreography needed.
//
// A settings gear (top-right of the header) opens per-user options:
//   - Rearrange: drag/drop the pin order (persisted to
//     SystemSettings.pinned_alters_config.order).
//   - Width / align: narrow the strip and tuck it to one side for
//     bar height + icon size (config.barHeight / config.chipSize).
//   - (Scroll block — a no-vertical-gesture grab bar — is a later phase.)

const V_SWIPE_THRESHOLD = 40;      // px up/down to trigger an action
const V_TAP_THRESHOLD = 10;        // px below which a release counts as a tap
const CORNER_LEFT_THRESHOLD = 35;  // px LEFT after the up leg to arm sole-front

// Module-level recent-touch deadline so the synthetic click after a
// touch gesture doesn't double-fire onTap. Scoped to this gallery.
let galleryRecentTouchUntil = 0;
// Timestamp of the most recent REAL touch — lets the mouse path ignore the
// synthetic mouse events mobile browsers fire after a touch (mirrors
// globalLastTouchAt in useSwipeActions). On desktop no touch ever happens, so
// real mouse drags are never suppressed.
let galleryLastTouchAt = 0;

// showGear: hosts that hide the header still need a way into the
// size/pins settings.
// onGear: the host can take over the cog (the v2 bar opens its own
// options sheet, which carries size AND look — one cog, not two).
// `valign`: where the chips sit inside a bar taller than them (top /
// center / bottom) — the bar's "Down" option. Only meaningful once a bar
// height is set; a bar that hugs its icons has nowhere to move them.
// `orientation`: "horizontal" (a row that scrolls sideways — the bar) or
// "vertical" (a column that scrolls up/down — the bubble docked to a side).
export default function PinnedAltersGallery({ showHeader = true, showGear = false, onGear = null, className = "", valign = "center", orientation = "horizontal" }) {
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();
  const { mode: anonymize } = useAnonymizeMode();
  const emptyTerms = useTerms();
  const emptyHint = `No pinned ${emptyTerms.alters} yet — press and hold an ${emptyTerms.alter} to pin them.`;

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  // NB: shared ["systemSettings"] cache MUST stay an array — fetch the list,
  // derive [0] locally (see shared-query-key-cache-pollution memory).
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;
  const config = (settings && settings.pinned_alters_config) || {};
  const savedOrder = Array.isArray(config.order) ? config.order : [];
  // Bar height in px (0 = fit the icons). Independent of icon size, so a
  // roomy bar with small icons — or the reverse — is possible.
  const barHeight = Number.isFinite(config.barHeight) ? config.barHeight : 0;
  // Avatar diameter in px — the icons inside the bar, independent of how
  // tall the bar itself is.
  const chipSize = Number.isFinite(config.chipSize) ? config.chipSize : 48;
  // How chips are captioned (the wireframe's SET A "labels" toggle):
  // auto = the app-wide alter-label setting; name/alias force one;
  // off = avatars only.
  const labelMode = ["name", "alias", "off"].includes(config.labelMode) ? config.labelMode : "auto";
  // What a chip shows (both / avatars only / names only) and how a
  // FRONTING chip stands out: grow (bigger, the old look), shape (same
  // size, rounded square instead of a circle), ring (thick coloured ring),
  // none. frontingScale = how much "grow" grows (percent, default 133).
  const display = ["both", "avatars", "names"].includes(config.display) ? config.display : "both";
  const emphasis = ["grow", "shape", "ring", "none"].includes(config.frontingEmphasis) ? config.frontingEmphasis : "grow";
  const frontingScale = Number.isFinite(config.frontingScale) ? Math.max(100, Math.min(200, config.frontingScale)) : 133;
  // The chips' rendered shape (circle/squircle/diamond/star/heart/…) and,
  // when the fronting emphasis is "shape", the shape a FRONTING chip takes.
  const iconShape = typeof config.iconShape === "string" ? config.iconShape : "circle";
  const frontingShape = typeof config.frontingShape === "string" ? config.frontingShape : "square";
  // Per-alter avatar override for the bar only (saved in the alter's own
  // asset folder by the config panel).
  const pinnedAvatars = (config.pinnedAvatars && typeof config.pinnedAvatars === "object") ? config.pinnedAvatars : {};
  const levelStyles = (config.levelStyles && typeof config.levelStyles === "object") ? config.levelStyles : {};

  const pinnedSettingsLabel = `Pinned ${emptyTerms.alters} settings`;

  const pinnedRaw = alters.filter((a) => a.is_pinned && !a.is_archived);
  // Custom order first (ids in saved order), then any not-yet-ordered pins
  // alphabetically. New pins land at the end until reordered.
  const orderIndex = new Map(savedOrder.map((id, i) => [id, i]));
  const pinned = [...pinnedRaw].sort((a, b) => {
    const ia = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
    const ib = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
    if (ia !== ib) return ia - ib;
    return (a.name || "").localeCompare(b.name || "");
  });

  // Nothing pinned yet → say so instead of vanishing. The bar's Show
  // toggle looked broken when this returned null ("the alter bar can not
  // be displayed"); the hint carries the gear so pins can be added right
  // here. Headerless mounts (the home-board strip) get the hint; the
  // profile-page mount keeps its old hidden behavior via showHeader.
  if (pinned.length === 0) {
    if (!showHeader) {
      return (
        <div className="flex items-center gap-2 py-1.5 px-2 text-xs text-muted-foreground">
          <span className="flex-1 min-w-0">{emptyHint}</span>
        </div>
      );
    }
    return null;
  }

  const vertical = orientation === "vertical";
  const stripWrapStyle = barHeight > 0 && !vertical
    ? {
        height: barHeight,
        display: "flex",
        alignItems: valign === "top" ? "flex-start" : valign === "bottom" ? "flex-end" : "center",
        overflowY: "hidden",
      }
    : undefined;

  return (
    <div data-tour="pinned-alters" className={`relative ${showHeader ? "mb-3" : ""} ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Pin className="w-3 h-3 fill-primary text-primary" /> Pinned
          </p>
          <div className="flex-1 h-px bg-border/50" />
          {/* The ONE pinned editor: Display options → Bars → pinned bar
              (pins, order, names, size — shared with the bar). */}
          <button type="button" onClick={() => openBarsEditor("alters")} aria-label={pinnedSettingsLabel} title={pinnedSettingsLabel} className="text-muted-foreground hover:text-foreground p-0.5">
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* The headerless (bar/widget) gear is RETIRED (owner) — options live
          in Display options → Bars → pinned bar. */}

      <div style={stripWrapStyle}>
        {(() => {
          const chips = pinned.map((a) => (
            <PinnedAlterChip
              key={a.id}
              alter={a}
              activeSessions={activeSessions}
              anonymize={anonymize}
              formatAlter={formatAlter}
              queryClient={queryClient}
              size={chipSize}
              labelMode={labelMode}
              display={display}
              emphasis={emphasis}
              frontingScale={frontingScale}
              iconShape={iconShape}
              frontingShape={frontingShape}
              levelStyles={levelStyles}
              avatarOverride={pinnedAvatars[a.id]}
            />
          ));
          const rowChildren = chips;
          // The old pt-5/pb-5 gutters existed for swipe-hint labels that the
          // gesture rework retired — pure wasted height now.
          return (
            // alignItems here is what the bar's vertical alignment really
            // controls when one chip is bigger than the rest (a fronting
            // alter on "grow"): the row used to stretch, so everyone sat at
            // the top whatever the setting said.
            <div className={vertical
                ? "flex flex-col gap-2 overflow-y-auto scrollbar-none min-h-0 items-center"
                : "flex gap-2 overflow-x-auto scrollbar-none min-w-0 w-full"}
              style={vertical
                ? { WebkitOverflowScrolling: "touch", maxHeight: "min(60vh, 420px)" }
                : { WebkitOverflowScrolling: "touch", alignItems: valign === "top" ? "flex-start" : valign === "bottom" ? "flex-end" : "center" }}>
              {rowChildren}
            </div>
          );
        })()}
      </div>

    </div>
  );
}

// the chips and scrolls with them; in "fixed" mode the gallery places it in a
// reserved side gutter (a flex sibling of the scroll area), so chips scroll
// BESIDE it rather than behind it.
// One searchable row in the "Add alters" picker — its own component so the
// avatar can resolve via the hook (can't call hooks in a map).
export function PinPickerRow({ alter, pinned, onToggle }) {
  const avatar = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <button
      type="button"
      onClick={() => onToggle(alter.id, !pinned)}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-colors ${pinned ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}
    >
      <div
        className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ border: `2px solid ${alter.color || "var(--color-muted)"}`, backgroundColor: alter.color ? `${alter.color}22` : "var(--color-muted)" }}
      >
        {avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-foreground">{(alter.name || "?").charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="flex-1 min-w-0 text-sm truncate">{alter.name}</span>
      <Pin className={`w-4 h-4 flex-shrink-0 ${pinned ? "fill-primary text-primary" : "text-muted-foreground"}`} />
    </button>
  );
}

// Vertical swipe handler — mirrors useSwipeActions' structure (drag
// offset + hint + tap suppression) but on the Y axis, so it coexists
// with the gallery's horizontal scroll.
const LONG_PRESS_MS = 450;


// `size` is the base avatar diameter in px (config.chipSize). Fronting
// chips render 4/3 of it, keeping the old 48/64 look at the default.
function PinnedAlterChip({ alter, activeSessions, anonymize, formatAlter, queryClient, size = 48, labelMode = "auto", display = "both", emphasis = "grow", frontingScale = 133, avatarOverride = "", iconShape = "circle", frontingShape = "square", levelStyles = {} }) {
  const resolvedAvatar = useResolvedAvatarUrl(avatarOverride || alter.avatar_url);
  const mySession = activeSessions.find((s) => s.alter_id === alter.id);
  const fronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;
  const blurNames = anonymizeBlurNames(anonymize);
  const blurAvatar = anonymizeBlurAvatars(anonymize);
  const label = labelMode === "name" ? (alter.name || "?")
    : labelMode === "alias" ? (alter.alias || alter.name || "?")
    : formatAlter(alter);

  // Owner, 2026-10-01: press-and-hold opens the FRONT LEVEL RAIL straight
  // away (slide to a level, or Remove, and lift); a tap opens the alter's
  // options menu (profile is one entry in it). With front levels turned
  // off there's no rail to show, so hold falls back to the two-option
  // rail (front button + options).
  const gesture = useFrontGesture();
  const holdRail = useAlterHoldRail({ activeSessions });
  const levelsOn = !!gesture.cfg?.enabled;
  const holdProps = levelsOn
    ? {
        ...gesture.getHoldProps(alter, mySession?.front_level),
        onContextMenu: (e) => e.preventDefault(),
      }
    : holdRail.bind(alter);
  const look = useFrontLook();

  // A level's own colour (when set) marks who's fronting; otherwise the
  // alter's colour. No gold "primary" — front levels replaced that split.
  const ringColor = fronting
    ? look.activeColor(alter, mySession)
    : (alter.color || "var(--color-muted)");

  return (
    <>
    {gesture.node}
    {holdRail.node}
    <button
      type="button"
      {...holdProps}
      onClick={() => { if (!gesture.suppressed() && !holdRail.suppressed()) gesture.openMenu(alter); }}
      title={label}
      className="relative flex flex-col items-center gap-1 flex-shrink-0 select-none"
      style={{ width: Math.round(size * Math.max(1, frontingScale / 100)), WebkitTouchCallout: "none" }}
    >
      {display !== "names" && (() => {
        // The RENDERED shape: the bar's icon shape, swapped for the
        // fronting shape when that emphasis is on. Clip shapes draw their
        // ring as a padded backing layer (a border would be clipped off).
        // A specific front level's own styling wins over the general
        // "when fronting" behaviour (shape / size / ring per level).
        const ls = (fronting && (levelStyles[mySession?.front_level] || look.styleFor(mySession))) || {};
        const shape = ls.shape || (fronting && emphasis === "shape" ? frontingShape : iconShape);
        const layers = shapeLayerStyles(shape);
        const scale = Number.isFinite(ls.scale) ? ls.scale : (fronting && emphasis === "grow" ? frontingScale : 100);
        const dim = Math.round(size * scale / 100);
        const ringW = Number.isFinite(ls.ringW) ? ls.ringW : (fronting && emphasis === "ring" ? 4 : 2);
        return (
      <div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{
          width: dim, height: dim,
          padding: ringW,
          backgroundColor: fronting && emphasis !== "none" ? ringColor : "var(--color-muted)",
          transition: "width .18s, height .18s",
          ...layers.ring,
        }}
      >
        <span className="w-full h-full overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: alter.color ? `${alter.color}44` : "var(--color-surface)", ...layers.inner }}>
        {resolvedAvatar ? (
          <img src={resolvedAvatar} alt={label} className={`w-full h-full object-cover ${blurAvatar ? "blur-md" : ""}`} />
        ) : (
          <span className="text-lg font-semibold text-foreground">
            {(alter.name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        </span>
        {fronting && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-card"
            style={{ backgroundColor: ringColor }}
          >
            {isPrimary ? <Star className="w-2.5 h-2.5 text-white" fill="white" /> : <Zap className="w-2.5 h-2.5 text-white" fill="white" />}
          </span>
        )}
      </div>
        );
      })()}
      {labelMode !== "off" && display !== "avatars" && (
        <span className={`text-[0.6875em] text-foreground text-center leading-tight truncate w-full ${blurNames ? "blur-sm" : ""} ${
          display === "names" && fronting ? "font-semibold" : ""}`}
          style={display === "names" ? { color: fronting && emphasis !== "none" ? ringColor : undefined } : undefined}>
          {label}
        </span>
      )}
    </button>
    </>
  );
}
