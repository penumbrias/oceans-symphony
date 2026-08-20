// "Active now" (v0.190.3): one place to SEE what's running — activity
// timers, symptom episodes, in-progress sleep — without hunting the widgets
// for it. Three doors, one popover:
//   • a top-bar item ("active") that only draws while something is active;
//   • a quick-action key (active_now) with a count badge;
//   • a floating bubble (EdgeDock, token activeBubble: off / when-active /
//     always) with the same badge.
// Data = useCurrentFocus (the home notice's aggregator), minus fronting
// and status (those have their own homes). Tap a row → its page.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon, Moon, Zap, X, Timer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useCurrentFocus } from "@/lib/currentFocus";
import { useT } from "@/lib/i18n";
import { EdgeDock } from "@/components/v2/EdgeDock";
import { barLookStyle } from "@/lib/widgetLook";
import { ActivityActionMenu } from "@/components/activities/CurrentActivities";
import { getActiveActivities } from "@/lib/activitySession";

const TYPE_ICON = { activity: Zap, sleep: Moon, symptom: ActivityIcon };

export function useActiveNow() {
  const { items } = useCurrentFocus();
  // Re-read the localStorage activity store when it changes (the focus
  // hook reads it synchronously; this nudges a re-render).
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener("active-activity-changed", on);
    return () => window.removeEventListener("active-activity-changed", on);
  }, []);
  return items.filter((i) => i.type === "activity" || i.type === "sleep" || i.type === "symptom");
}

// Anchored popover (portaled, viewport-clamped) listing what's active.
export function ActiveNowPopover({ anchorRef, open, onClose }) {
  const tr = useT();
  const navigate = useNavigate();
  const items = useActiveNow();
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const popRef = useRef(null);
  const [activityMenu, setActivityMenu] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = anchorRef?.current?.getBoundingClientRect();
      const W = 260, H = 56 + items.length * 44;
      if (!r) {
        // No anchor (the quick-action keys don't expose a ref): sit just
        // above the bottom chrome, centred.
        const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--v2-bottom-chrome-h")) || 56;
        setPos({ top: Math.max(8, window.innerHeight - chrome - H - 72), left: Math.max(8, (window.innerWidth - W) / 2) });
        return;
      }
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      const below = r.bottom + 6;
      const top = below + H > window.innerHeight - 8 ? Math.max(8, r.top - H - 6) : below;
      setPos({ top, left });
    };
    place();
    const out = (e) => { if (!popRef.current?.contains(e.target) && !anchorRef?.current?.contains(e.target)) onClose?.(); };
    document.addEventListener("pointerdown", out);
    window.addEventListener("resize", place);
    return () => { document.removeEventListener("pointerdown", out); window.removeEventListener("resize", place); };
  }, [open, anchorRef, items.length, onClose]);
  if (!open) return null;
  return createPortal(
    <div ref={popRef} role="dialog" aria-label={tr("active.title")}
      className="fixed z-[95] w-[260px] rounded-xl border border-border/60 bg-card shadow-xl p-2"
      style={{ top: pos.top, left: pos.left }}>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{tr("active.title")}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground px-1 py-2">{tr("active.none")}</p>}
      {items.map((it, i) => {
        const Icon = TYPE_ICON[it.type] || Timer;
        return (
          <button key={`${it.type}-${i}`} type="button"
            onClick={() => {
              // A running activity opens its end/edit menu right here.
              if (it.type === "activity") {
                const act = getActiveActivities().find((a) => a.id === it.id) || getActiveActivities()[0];
                if (act) { setActivityMenu(act); return; }
              }
              onClose?.(); navigate(it.path);
            }}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm hover:bg-muted/40">
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--v2-accent)" }} />
            <span className="truncate flex-1">{it.label}</span>
          </button>
        );
      })}
      {activityMenu && <ActivityActionMenu activity={activityMenu} onClose={() => { setActivityMenu(null); onClose?.(); }} />}
    </div>,
    document.body
  );
}

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[0.625rem] font-bold text-white flex items-center justify-center"
      style={{ background: "var(--v2-accent)" }}>{n}</span>
  );
}

// Top-bar item: nothing when idle; dot + count when something runs.
export function ActiveNowChip() {
  const items = useActiveNow();
  const tr = useT();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open} aria-label={`${tr("active.title")}: ${items.length}`}
        title={items.map((i) => i.label).join(" · ")}
        className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 px-1.5 h-6 rounded-full border"
        style={{ borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)" }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--v2-accent)" }} />
        <span className="tabular-nums">{items.length}</span>
      </button>
      <ActiveNowPopover anchorRef={ref} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// Quick-action key body (the strip/dock render the button chrome; this is
// the icon + badge + popover).
export function ActiveNowKeyFace({ size = "45%" }) {
  const items = useActiveNow();
  return (
    <span className="relative flex items-center justify-center w-full h-full">
      <Timer style={{ width: size, height: size }} />
      <Badge n={items.length} />
    </span>
  );
}

// Floating bubble on EdgeDock — Display options → Active-now bubble.
export function ActiveNowBubble({ uiV2, settingsRow }) {
  const qc = useQueryClient();
  const tr = useT();
  const items = useActiveNow();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const mode = uiV2.tokens.activeBubble || "off";
  if (mode === "off" || (mode === "when-active" && items.length === 0)) return null;
  const side = uiV2.activeDockPos?.side || "left";
  const topPct = uiV2.activeDockPos?.topPct ?? 70;
  const savePos = async (pos) => {
    try {
      if (!settingsRow?.id) return;
      await base44.entities.SystemSettings.update(settingsRow.id, { ui_v2: { ...(settingsRow.ui_v2 || {}), activeDockPos: pos } });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* best-effort */ }
  };
  return (
    <>
      <EdgeDock side={side} topPct={topPct} onSavePos={savePos}
        renderHandle={(bind) => (
          <button ref={ref} type="button"
            onPointerDown={bind.onPointerDown} onContextMenu={bind.onContextMenu}
            onClick={() => { if (bind.suppressTap.current) { bind.suppressTap.current = false; return; } setOpen((v) => !v); }}
            aria-haspopup="dialog" aria-expanded={open} aria-label={`${tr("active.title")}: ${items.length}`}
            title={`${tr("active.title")} · hold and drag to move`}
            className="relative flex items-center justify-center active:scale-95 transition-transform backdrop-blur"
            // Per-bar look ("active" in Display options) rides the same
            // variables every other bar uses.
            style={{
              ...barLookStyle(uiV2, "active", { veil: false }),
              background: "var(--v2-widget-bg, var(--color-bg))",
              width: "calc(var(--v2-cmd-size, 44px) + 6px)", height: "calc(var(--v2-cmd-size, 44px) + 6px)",
              borderRadius: "9999px",
              border: "var(--v2-border-w, 1px) var(--v2-border-style, solid) var(--v2-border-color, var(--v2-accent))",
              color: "var(--v2-text, var(--v2-accent))",
              boxShadow: "var(--v2-shadow, 0 2px 10px rgb(0 0 0 / 0.3))",
              touchAction: "none",
            }}>
            <Timer style={{ width: "42%", height: "42%" }} />
            <Badge n={items.length} />
          </button>
        )} />
      <ActiveNowPopover anchorRef={ref} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
