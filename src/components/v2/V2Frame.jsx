// UI v2 instrument frame (docs/ui-v2-instrument-ia.md, vertical slice).
//
// Layer 1 of the instrument: V2StatusLine (system · presence · clock ·
// notification LED · tuning) and V2BottomChrome (command strip with
// capture keys + AID, above the all-visible register strip). Rendered by
// AppLayout in place of the classic headers/bottom-nav when
// SystemSettings.ui_v2.enabled — the ambient layer (grocery cover, tours,
// swipe-back, background sync) stays untouched, and existing pages render
// inside the frame via the register route mapping until their register-
// native interiors are built.
//
// CHASSIS RULE (the granular-customization contract): nothing visual here
// is hardcoded — every size/color/width/radius reads a --v2-* CSS var
// emitted from the token catalogue (src/lib/uiV2.js, applied on the
// AppLayout root), and the tuning sheet edits those tokens live. The
// chassis carries no personality of its own; it inherits the user's theme
// and amplifies whatever they tune.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Heart, Zap, Activity as ActivityIcon, CheckSquare, CalendarDays, Users,
  LifeBuoy, SlidersHorizontal, Bell, Search,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  V2_COMMAND_KEYS, V2_TOKEN_DEFS,
  registerForPath, orderedRegisters,
} from "@/lib/uiV2";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";

const KEY_ICONS = {
  quick_checkin: Heart, start_activity: Zap, start_symptom: ActivityIcon,
  quick_task: CheckSquare, quick_plan: CalendarDays, set_front: Users,
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TuningSheet({ open, onClose, uiV2, onToken }) {
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">Instrument tuning</DrawerTitle>
          <DrawerDescription className="text-xs">
            Every knob applies instantly and saves with your settings.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 space-y-4 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
          {V2_TOKEN_DEFS.map((def) => {
            const val = uiV2.tokens[def.id] ?? def.default;
            return (
              <div key={def.id}>
                <label className="flex items-center justify-between text-xs font-medium mb-1">
                  <span>{def.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {def.type === "range" ? (def.id === "contentW" && !val ? "full" : `${val}${def.unit || ""}`) : ""}
                  </span>
                </label>
                {def.type === "range" && (
                  <input
                    type="range" min={def.min} max={def.max} step={def.step} value={val}
                    onChange={(e) => onToken(def.id, parseInt(e.target.value, 10))}
                    className="w-full" aria-label={def.label}
                  />
                )}
                {def.type === "select" && (
                  <div className="flex gap-1.5">
                    {def.options.map((o) => (
                      <button key={o.v} type="button" onClick={() => onToken(def.id, o.v)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          val === o.v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {def.type === "color" && (
                  <div className="flex items-center gap-2">
                    <input type="color" value={val || "#3b82f6"}
                      onChange={(e) => onToken(def.id, e.target.value)}
                      aria-label={def.label} className="w-9 h-9 rounded border border-border bg-transparent" />
                    <button type="button" onClick={() => onToken(def.id, "")}
                      className={`text-xs px-2.5 py-1 rounded-full border ${!val ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                      Use theme color
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function usePersistToken(settingsRow) {
  const qc = useQueryClient();
  return async (id, value) => {
    try {
      if (!settingsRow?.id) return;
      const next = {
        ...(settingsRow.ui_v2 || {}),
        enabled: true,
        tokens: { ...(settingsRow.ui_v2?.tokens || {}), [id]: value },
      };
      await base44.entities.SystemSettings.update(settingsRow.id, { ui_v2: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* tuning is best-effort live */ }
  };
}

// ── Status line (replaces both classic headers) ────────────────────
export function V2StatusLine({ settingsRow, uiV2 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const clock = useClock();
  const [tuneOpen, setTuneOpen] = useState(false);
  const persistToken = usePersistToken(settingsRow);

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list(),
  });

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const fronters = activeSessions
    .map((s) => ({ s, alter: altersById[s.alter_id || s.primary_alter_id] }))
    .filter((x) => x.alter)
    .sort((a, b) => (b.s.is_primary === true) - (a.s.is_primary === true));
  const presenceText = fronters.length === 0
    ? `no ${t.fronter}`
    : fronters.length === 1
      ? formatAlter(fronters[0].alter)
      : `${formatAlter(fronters[0].alter)} +${fronters.length - 1}`;
  const hasUnread = mentionLogs.some((m) => m.is_active !== false && !m.seen && !m.read);

  return (
    <header
      className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl flex items-center gap-1.5 px-2 border-b"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "max(env(safe-area-inset-left, 0px), 8px)",
        paddingRight: "max(env(safe-area-inset-right, 0px), 8px)",
        minHeight: "calc(var(--v2-status-h) + env(safe-area-inset-top, 0px))",
        borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)",
        borderBottomWidth: "var(--v2-border-w)",
      }}
    >
      <button type="button" onClick={() => navigate("/")}
        className="font-semibold text-sm truncate max-w-[34%] text-left"
        title={settingsRow?.system_name || t.System}>
        {settingsRow?.system_name || t.System}
      </button>
      <button type="button" onClick={() => navigate("/")}
        className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground"
        aria-label={`Currently ${t.fronting}: ${presenceText}`}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: fronters.length ? "var(--v2-accent)" : "hsl(var(--muted-foreground))" }} />
        <span className="truncate">{presenceText}</span>
      </button>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{clock}</span>
      <button type="button" onClick={() => navigate("/")} aria-label="Search"
        className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
        <Search className="w-4 h-4" />
      </button>
      <button type="button" aria-label="Notifications"
        onClick={() => {
          if (location.pathname === "/") window.dispatchEvent(new CustomEvent("open-notification-history"));
          else navigate("/?action=notifications");
        }}
        className="relative min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
        <Bell className="w-4 h-4" />
        {hasUnread && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--v2-accent)" }} />}
      </button>
      <button type="button" aria-label="Instrument tuning" onClick={() => setTuneOpen(true)}
        className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
        <SlidersHorizontal className="w-4 h-4" />
      </button>
      <TuningSheet open={tuneOpen} onClose={() => setTuneOpen(false)} uiV2={uiV2} onToken={persistToken} />
    </header>
  );
}

// ── Bottom chrome: command strip + register strip ──────────────────
export function V2BottomChrome({ uiV2 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeRegister = registerForPath(location.pathname);
  const registers = orderedRegisters(uiV2);
  const keys = uiV2.commandKeys
    .map((id) => V2_COMMAND_KEYS.find((k) => k.id === id))
    .filter(Boolean);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)",
        borderTopWidth: "var(--v2-border-w)",
      }}
      aria-label="Instrument controls"
    >
      {/* Command strip — the capture grammar as hardware keys + AID */}
      <div className="flex items-center justify-center overflow-x-auto px-2"
        style={{ gap: "calc(var(--v2-space) * 1.5)", paddingTop: "var(--v2-space)", paddingBottom: "var(--v2-space)" }}>
        {keys.map((k) => {
          const Icon = KEY_ICONS[k.id] || Heart;
          return (
            <button key={k.id} type="button" onClick={() => navigate(k.target)}
              aria-label={k.label} title={k.label}
              className="flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
              style={{
                width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
                borderRadius: "var(--v2-radius)",
                border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
              }}>
              <Icon style={{ width: "45%", height: "45%" }} />
            </button>
          );
        })}
        <button type="button" onClick={() => navigate("/grounding")}
          aria-label="Aid — grounding and crisis support" title="Aid"
          className="flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
          style={{
            width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
            borderRadius: "var(--v2-radius)",
            border: "var(--v2-border-w) solid var(--v2-accent)",
            color: "var(--v2-accent)",
            background: activeRegister === "aid" ? "color-mix(in srgb, var(--v2-accent) 15%, transparent)" : "transparent",
          }}>
          <LifeBuoy style={{ width: "45%", height: "45%" }} />
        </button>
      </div>
      {/* Register strip — all eight visible, none buried */}
      <div className="flex items-stretch overflow-x-auto" style={{ height: "var(--v2-strip-h)" }} role="tablist" aria-label="Registers">
        {registers.map((reg) => {
          const on = activeRegister === reg.id;
          return (
            <button key={reg.id} type="button" role="tab" aria-selected={on}
              onClick={() => navigate(reg.path)}
              className="flex-1 min-w-[64px] text-[0.7rem] font-medium tracking-wide uppercase whitespace-nowrap px-1"
              style={{
                color: on ? "var(--v2-accent)" : "hsl(var(--muted-foreground))",
                boxShadow: on ? "inset 0 calc(var(--v2-border-w) + 1px) 0 var(--v2-accent)" : "none",
              }}>
              {reg.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
