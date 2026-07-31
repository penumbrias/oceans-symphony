// UI v2 frame — the app-wide chrome behind the ui_v2 toggle.
//
// V2StatusLine: system name · who's fronting · clock · notification dot ·
// search · display options. V2BottomChrome: quick-action keys (+ the
// always-present Support key) above the section tabs (all eight visible,
// icons over labels). Existing pages render inside the frame via the
// section route mapping until their rebuilt views land.
//
// LANGUAGE POLICY (owner mandate): plain, accurate, non-thematic,
// non-personified wording in every user-facing string. No metaphors.
//
// CUSTOMIZATION CONTRACT: nothing visual is hardcoded — every size /
// color / width reads a --v2-* CSS var from the token catalogue
// (src/lib/uiV2.js, applied on the AppLayout root). The display-options
// sheet edits tokens live; app-wide text size is driven through the
// existing accessibility engine so it genuinely applies everywhere.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Heart, Zap, Activity as ActivityIcon, CheckSquare, CalendarDays, Users,
  LifeBuoy, SlidersHorizontal, Bell, Search, PenLine, StickyNote, BookOpen,
  Megaphone,
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
import { getAccessibilitySettings, setAccessibilityFontSize } from "@/lib/useAccessibility";

const KEY_ICONS = {
  quick_checkin: Heart, quick_note: PenLine, start_activity: Zap,
  start_symptom: ActivityIcon, quick_task: CheckSquare,
  quick_plan: CalendarDays, set_front: Users,
};

// The app-wide text-size ladder (matches the accessibility engine's
// class set — "default" sits in the middle).
const FONT_STEPS = ["xs3", "xs2", "xs", "sm", "default", "lg", "xl", "xl2", "xl3", "xl4", "xl5"];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Display options sheet ──────────────────────────────────────────
const BAR_TOGGLES = [
  { id: "top",     label: "Top bar (name, time, notifications)" },
  { id: "actions", label: "Quick-action row" },
  { id: "tabs",    label: "Section tabs" },
];

function OptionsSheet({ open, onClose, uiV2, onToken, onBar }) {
  const [fontIdx, setFontIdx] = useState(() =>
    Math.max(0, FONT_STEPS.indexOf(getAccessibilitySettings().fontSize || "default"))
  );

  const renderToken = (def) => {
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
          <input type="range" min={def.min} max={def.max} step={def.step} value={val}
            onChange={(e) => onToken(def.id, parseInt(e.target.value, 10))}
            className="w-full" aria-label={def.label} />
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
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">Display options</DrawerTitle>
          <DrawerDescription className="text-xs">
            Changes apply instantly and save. Themes, fonts, and more are in Settings → Appearance.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 space-y-4 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>

          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Show / hide</p>
          {BAR_TOGGLES.map((b) => (
            <label key={b.id} className="flex items-center justify-between gap-3 text-xs font-medium cursor-pointer">
              <span>{b.label}</span>
              <input type="checkbox" checked={uiV2.bars[b.id]} onChange={(e) => onBar(b.id, e.target.checked)}
                className="w-4 h-4 rounded accent-primary" aria-label={b.label} />
            </label>
          ))}
          {!uiV2.bars.top && (
            <p className="text-[0.6875rem] text-muted-foreground">With the top bar hidden, a small ⚙ button stays in the corner so you can always get back here.</p>
          )}

          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground pt-1">App-wide</p>
          <div>
            <label className="flex items-center justify-between text-xs font-medium mb-1">
              <span>Text size</span>
              <span className="text-muted-foreground">{FONT_STEPS[fontIdx] === "default" ? "normal" : FONT_STEPS[fontIdx]}</span>
            </label>
            <input
              type="range" min={0} max={FONT_STEPS.length - 1} step={1} value={fontIdx}
              onChange={(e) => {
                const i = parseInt(e.target.value, 10);
                setFontIdx(i);
                setAccessibilityFontSize(FONT_STEPS[i]);
              }}
              className="w-full" aria-label="Text size"
            />
          </div>
          {V2_TOKEN_DEFS.filter((d) => d.group === "app").map(renderToken)}

          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Top & bottom bars</p>
          {V2_TOKEN_DEFS.filter((d) => d.group === "bars").map(renderToken)}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Quick note sheet ───────────────────────────────────────────────
// One key, three destinations: a status note saved right here, a new
// journal entry, or a new board post.
function QuickNoteSheet({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const saveStatus = async () => {
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await base44.entities.StatusNote.create({ timestamp: new Date().toISOString(), note: text });
      qc.invalidateQueries({ queryKey: ["statusNotes"] });
      toast.success("Status note saved");
      setNote("");
      onClose();
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent>
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">Quick note</DrawerTitle>
          <DrawerDescription className="text-xs">Save a status note here, or start a longer entry.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 space-y-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
          <div className="flex items-start gap-2">
            <StickyNote className="w-4 h-4 mt-2.5 text-muted-foreground flex-shrink-0" />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Status note…"
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button type="button" onClick={saveStatus} disabled={!note.trim() || saving}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
              Save
            </button>
          </div>
          <button type="button"
            onClick={() => { onClose(); navigate("/journals?compose=1"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/50 text-left text-sm hover:border-primary/50">
            <BookOpen className="w-4 h-4 text-muted-foreground" /> New journal entry
          </button>
          <button type="button"
            onClick={() => { onClose(); navigate("/bulletins"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/50 text-left text-sm hover:border-primary/50">
            <Megaphone className="w-4 h-4 text-muted-foreground" /> New board post
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function usePersistUiV2(settingsRow) {
  const qc = useQueryClient();
  const write = async (patch) => {
    try {
      if (!settingsRow?.id) return;
      const next = { ...(settingsRow.ui_v2 || {}), enabled: true, ...patch };
      await base44.entities.SystemSettings.update(settingsRow.id, { ui_v2: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* best-effort live */ }
  };
  return {
    setToken: (id, value) => write({ tokens: { ...(settingsRow?.ui_v2?.tokens || {}), [id]: value } }),
    setBar: (bar, visible) => write({ bars: { ...(settingsRow?.ui_v2?.bars || {}), [bar]: visible } }),
  };
}

// ── Top bar ────────────────────────────────────────────────────────
export function V2StatusLine({ settingsRow, uiV2 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const clock = useClock();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { setToken, setBar } = usePersistUiV2(settingsRow);

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
    ? `no ${t.fronter} set`
    : fronters.length === 1
      ? formatAlter(fronters[0].alter)
      : `${formatAlter(fronters[0].alter)} +${fronters.length - 1}`;
  const hasUnread = mentionLogs.some((m) => m.is_active !== false && !m.seen && !m.read);

  if (!uiV2.bars.top) {
    // Bar hidden — keep Display options reachable via a small corner
    // button so no visibility combination can strand the user.
    return (
      <>
        <button type="button" aria-label="Display options" onClick={() => setOptionsOpen(true)}
          className="fixed z-50 flex items-center justify-center text-muted-foreground/70 hover:text-foreground bg-background/60 backdrop-blur rounded-full"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 6px)", right: "6px", width: 28, height: 28 }}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
        <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} uiV2={uiV2} onToken={setToken} onBar={setBar} />
      </>
    );
  }

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
      <button type="button" aria-label="Display options" onClick={() => setOptionsOpen(true)}
        className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
        <SlidersHorizontal className="w-4 h-4" />
      </button>
      <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} uiV2={uiV2} onToken={setToken} onBar={setBar} />
    </header>
  );
}

// ── Bottom bars: quick actions above section tabs ──────────────────
export function V2BottomChrome({ uiV2 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTerms();
  const [noteOpen, setNoteOpen] = useState(false);
  const activeRegister = registerForPath(location.pathname);
  if (!uiV2.bars.actions && !uiV2.bars.tabs) return null;
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
      aria-label="App navigation and quick actions"
    >
      {/* Quick actions */}
      {uiV2.bars.actions && (
      <div className="flex items-center justify-center overflow-x-auto px-2"
        style={{ gap: "calc(var(--v2-space) * 1.5)", paddingTop: "var(--v2-space)", paddingBottom: "var(--v2-space)" }}>
        {keys.map((k) => {
          const Icon = KEY_ICONS[k.id] || Heart;
          return (
            <button key={k.id} type="button"
              onClick={() => (k.id === "quick_note" ? setNoteOpen(true) : navigate(k.target))}
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
        {/* Support — always present, one tap from anywhere */}
        <button type="button" onClick={() => navigate("/grounding")}
          aria-label="Support — grounding and crisis help" title="Support"
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
      )}

      {/* Section tabs — icon above label, all visible */}
      {uiV2.bars.tabs && (
      <div className="flex items-stretch overflow-x-auto" style={{ height: "var(--v2-strip-h)" }} role="tablist" aria-label="Sections">
        {registers.map((reg) => {
          const on = activeRegister === reg.id;
          const Icon = reg.icon;
          const label = reg.labelTermKey ? (t[reg.labelTermKey] || reg.label || reg.labelTermKey) : reg.label;
          return (
            <button key={reg.id} type="button" role="tab" aria-selected={on}
              onClick={() => navigate(reg.path)}
              className="flex-1 min-w-[56px] flex flex-col items-center justify-center gap-0.5 px-1"
              style={{
                color: on ? "var(--v2-accent)" : "hsl(var(--muted-foreground))",
                boxShadow: on ? "inset 0 calc(var(--v2-border-w) + 1px) 0 var(--v2-accent)" : "none",
              }}>
              {Icon && <Icon style={{ width: 18, height: 18 }} />}
              <span className="text-[0.625rem] font-medium leading-tight whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </div>
      )}

      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </nav>
  );
}
