// UI v2 frame — the app-wide chrome behind the ui_v2 toggle.
//
// V2StatusLine: the animated wave block (reused from the classic header),
// system name, who's fronting, clock, notification dot, search, display
// options. V2BottomChrome: the user's own bottom buttons (the SAME
// navigation_config.bottomBar the classic bar uses, so one setting drives
// both) with the quick-action row tucked behind a pull handle above them —
// tap or swipe up to reveal.
//
// LANGUAGE: plain, accurate, non-personified wording; and every string
// goes through t() from lib/i18n so a locale file can translate it later.
// Terminology placeholders ({{fronter}} etc.) survive translation and are
// resolved afterwards by applyTerms — translation handles the sentence,
// the user's own vocabulary handles the nouns.
//
// CUSTOMIZATION: nothing visual is hardcoded — sizes/colors read --v2-*
// tokens from uiV2.js, edited live in Display options.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, Zap, Activity as ActivityIcon, CheckSquare, CalendarDays, Users,
  LifeBuoy, SlidersHorizontal, Bell, Search, PenLine, StickyNote, BookOpen,
  Megaphone, ChevronUp,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { V2_COMMAND_KEYS, V2_TOKEN_DEFS } from "@/lib/uiV2";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getAccessibilitySettings, setAccessibilityFontSize } from "@/lib/useAccessibility";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useT, LOCALES, getLocale, setLocale, localeCoverage } from "@/lib/i18n";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import HeaderWaveBlock from "@/components/layout/HeaderWaveBlock";

const KEY_ICONS = {
  quick_checkin: Heart, quick_note: PenLine, start_activity: Zap,
  start_symptom: ActivityIcon, quick_task: CheckSquare,
  quick_plan: CalendarDays, set_front: Users,
};
const KEY_LABEL_KEYS = {
  quick_checkin: "capture.checkIn", quick_note: "capture.note",
  start_activity: "capture.activity", start_symptom: "capture.symptom",
  quick_task: "capture.task", quick_plan: "capture.plan", set_front: "capture.front",
};

const FONT_STEPS = ["xs3", "xs2", "xs", "sm", "default", "lg", "xl", "xl2", "xl3", "xl4", "xl5"];
const QA_OPEN_KEY = "symphony_v2_quickactions_open";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Display options ────────────────────────────────────────────────
function OptionsSheet({ open, onClose, uiV2, onToken, onBar }) {
  const t = useT();
  const [fontIdx, setFontIdx] = useState(() =>
    Math.max(0, FONT_STEPS.indexOf(getAccessibilitySettings().fontSize || "default"))
  );
  const [locale, setLocaleState] = useState(getLocale());

  const BAR_TOGGLES = [
    { id: "top", label: t("options.topBar") },
    { id: "actions", label: t("options.quickActionRow") },
    { id: "tabs", label: t("options.sectionTabs") },
    { id: "wave", label: t("options.waveHeader") },
  ];

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
            <input type="color" value={val || "#3b82f6"} onChange={(e) => onToken(def.id, e.target.value)}
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

  const localeCodes = Object.keys(LOCALES);

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">{t("options.title")}</DrawerTitle>
          <DrawerDescription className="text-xs">{t("options.subtitle")}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 space-y-4 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>

          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{t("options.showHide")}</p>
          {BAR_TOGGLES.map((b) => (
            <label key={b.id} className="flex items-center justify-between gap-3 text-xs font-medium cursor-pointer">
              <span>{b.label}</span>
              <input type="checkbox" checked={uiV2.bars[b.id]} onChange={(e) => onBar(b.id, e.target.checked)}
                className="w-4 h-4 rounded accent-primary" aria-label={b.label} />
            </label>
          ))}
          {!uiV2.bars.top && <p className="text-[0.6875rem] text-muted-foreground">{t("options.recoveryHint")}</p>}

          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground pt-1">{t("options.appWide")}</p>
          <div>
            <label className="flex items-center justify-between text-xs font-medium mb-1">
              <span>{t("options.textSize")}</span>
              <span className="text-muted-foreground">{FONT_STEPS[fontIdx] === "default" ? t("options.textNormal") : FONT_STEPS[fontIdx]}</span>
            </label>
            <input type="range" min={0} max={FONT_STEPS.length - 1} step={1} value={fontIdx}
              onChange={(e) => { const i = parseInt(e.target.value, 10); setFontIdx(i); setAccessibilityFontSize(FONT_STEPS[i]); }}
              className="w-full" aria-label={t("options.textSize")} />
          </div>
          {/* Language — hidden until a second locale is registered, so it
              never shows a pointless one-option control. */}
          {localeCodes.length > 1 && (
            <div>
              <label className="text-xs font-medium block mb-1">{t("options.language")}</label>
              <div className="flex flex-wrap gap-1.5">
                {localeCodes.map((code) => {
                  const cov = localeCoverage(code);
                  return (
                    <button key={code} type="button"
                      onClick={() => { setLocale(code); setLocaleState(code); }}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        locale === code ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                      }`}>
                      {LOCALES[code].name}
                      {cov.pct < 100 && <span className="opacity-60"> · {cov.pct}%</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {V2_TOKEN_DEFS.filter((d) => d.group === "app").map(renderToken)}

          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground pt-1">{t("options.bars")}</p>
          {V2_TOKEN_DEFS.filter((d) => d.group === "bars").map(renderToken)}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Quick note ─────────────────────────────────────────────────────
function QuickNoteSheet({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const saveStatus = async () => {
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await base44.entities.StatusNote.create({ timestamp: new Date().toISOString(), note: text });
      qc.invalidateQueries({ queryKey: ["statusNotes"] });
      toast.success(t("note.saved"));
      setNote("");
      onClose();
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent>
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">{t("note.title")}</DrawerTitle>
          <DrawerDescription className="text-xs">{t("note.subtitle")}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
          <div className="flex items-start gap-2">
            <StickyNote className="w-4 h-4 mt-2.5 text-muted-foreground flex-shrink-0" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t("note.placeholder")} rows={2}
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            <button type="button" onClick={saveStatus} disabled={!note.trim() || saving}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
              {t("note.save")}
            </button>
          </div>
          <button type="button" onClick={() => { onClose(); navigate("/journals?compose=1"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/50 text-left text-sm hover:border-primary/50">
            <BookOpen className="w-4 h-4 text-muted-foreground" /> {t("note.newJournal")}
          </button>
          <button type="button" onClick={() => { onClose(); navigate("/bulletins"); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/50 text-left text-sm hover:border-primary/50">
            <Megaphone className="w-4 h-4 text-muted-foreground" /> {t("note.newPost")}
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
  const t = useT();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const clock = useClock();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { setToken, setBar } = usePersistUiV2(settingsRow);

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: mentionLogs = [] } = useQuery({ queryKey: ["mentionLogs"], queryFn: () => base44.entities.MentionLog.list() });

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const fronters = activeSessions
    .map((s) => ({ s, alter: altersById[s.alter_id || s.primary_alter_id] }))
    .filter((x) => x.alter)
    .sort((a, b) => (b.s.is_primary === true) - (a.s.is_primary === true));
  const presenceText = fronters.length === 0
    ? applyTerms(t("top.noFronter"), terms)
    : fronters.length === 1
      ? formatAlter(fronters[0].alter)
      : `${formatAlter(fronters[0].alter)} +${fronters.length - 1}`;
  const hasUnread = mentionLogs.some((m) => m.is_active !== false && !m.seen && !m.read);

  const options = (
    <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} uiV2={uiV2} onToken={setToken} onBar={setBar} />
  );

  if (!uiV2.bars.top) {
    return (
      <>
        <button type="button" aria-label={t("top.displayOptions")} onClick={() => setOptionsOpen(true)}
          className="fixed z-50 flex items-center justify-center text-muted-foreground/70 hover:text-foreground bg-background/60 backdrop-blur rounded-full"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 6px)", right: "6px", width: 28, height: 28 }}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
        {options}
      </>
    );
  }

  return (
    <header
      className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b relative overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "max(env(safe-area-inset-left, 0px), 8px)",
        paddingRight: "max(env(safe-area-inset-right, 0px), 8px)",
        borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)",
        borderBottomWidth: "var(--v2-border-w)",
      }}
    >
      {/* The classic animated wave, reused as-is — same component, same
          user colour setting, so it stays in sync with the rest of the app. */}
      {uiV2.bars.wave && <HeaderWaveBlock />}
      <div className="flex items-center gap-1.5 relative" style={{ zIndex: 1, minHeight: "var(--v2-status-h)" }}>
        <button type="button" onClick={() => navigate("/")}
          className="font-semibold text-sm truncate max-w-[34%] text-left"
          title={settingsRow?.system_name || terms.System}>
          {settingsRow?.system_name || terms.System}
        </button>
        <button type="button" onClick={() => navigate("/")}
          className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground"
          aria-label={presenceText}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: fronters.length ? "var(--v2-accent)" : "hsl(var(--muted-foreground))" }} />
          <span className="truncate">{presenceText}</span>
        </button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{clock}</span>
        <button type="button" onClick={() => navigate("/")} aria-label={t("top.search")}
          className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
          <Search className="w-4 h-4" />
        </button>
        <button type="button" aria-label={t("top.notifications")}
          onClick={() => {
            if (location.pathname === "/") window.dispatchEvent(new CustomEvent("open-notification-history"));
            else navigate("/?action=notifications");
          }}
          className="relative min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
          {hasUnread && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--v2-accent)" }} />}
        </button>
        <button type="button" aria-label={t("top.displayOptions")} onClick={() => setOptionsOpen(true)}
          className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground">
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
      {options}
    </header>
  );
}

// ── Bottom chrome ──────────────────────────────────────────────────
export function V2BottomChrome({ uiV2, settingsRow }) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const terms = useTerms();
  const [noteOpen, setNoteOpen] = useState(false);
  // Quick actions live behind a pull handle; the open state is a device
  // preference so the bar opens the way you left it.
  const [qaOpen, setQaOpen] = useState(() => {
    try { return localStorage.getItem(QA_OPEN_KEY) === "1"; } catch { return false; }
  });
  const dragStart = useRef(null);
  const swiped = useRef(false);

  const toggleQa = (next) => {
    setQaOpen(next);
    try { localStorage.setItem(QA_OPEN_KEY, next ? "1" : "0"); } catch { /* storage off */ }
  };

  // The bottom buttons are the user's own choice — the SAME
  // navigation_config.bottomBar the classic bar uses, so configuring it in
  // Settings → Appearance → Navigation drives both UIs and nobody has to
  // set their tabs up twice.
  const navConfig = settingsRow?.navigation_config || DEFAULT_CONFIG;
  const termMap = useMemo(() => ({
    alters: terms.Alters,
    checkin: `${terms.System} Meeting`,
    "system-map": `${terms.System} Map`,
    "system-history": `${terms.System} History`,
  }), [terms]);
  const items = useMemo(() => (navConfig.bottomBar || DEFAULT_CONFIG.bottomBar)
    .map((id) => ALL_PAGES.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ ...p, label: termMap[p.id] || p.label })), [navConfig.bottomBar, termMap]);

  const keys = uiV2.commandKeys.map((id) => V2_COMMAND_KEYS.find((k) => k.id === id)).filter(Boolean);
  if (!uiV2.bars.actions && !uiV2.bars.tabs) return null;

  const isActive = (path) =>
    path === "/" ? location.pathname === "/"
      : path === "/Home" ? location.pathname === "/Home" || location.pathname.startsWith("/alter")
      : location.pathname.startsWith(path);

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
      aria-label={t("nav.appNav")}
    >
      {uiV2.bars.actions && (
        <>
          {/* Pull handle — tap, or swipe up/down, to reveal or hide. */}
          <button
            type="button"
            aria-expanded={qaOpen}
            aria-label={qaOpen ? t("nav.hideQuickActions") : t("nav.showQuickActions")}
            onClick={() => {
              // A swipe already decided it; don't let the trailing click undo it.
              if (swiped.current) { swiped.current = false; return; }
              toggleQa(!qaOpen);
            }}
            onPointerDown={(e) => {
              dragStart.current = e.clientY;
              // Capture so the release still counts as a swipe even when the
              // finger has travelled off the handle by then.
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
            }}
            onPointerUp={(e) => {
              const dy = dragStart.current == null ? 0 : e.clientY - dragStart.current;
              dragStart.current = null;
              try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
              if (dy < -14) { swiped.current = true; toggleQa(true); }
              else if (dy > 14) { swiped.current = true; toggleQa(false); }
            }}
            className="w-full flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
            style={{ height: 18, touchAction: "none" }}
          >
            <ChevronUp className="w-3 h-3" style={{ transform: qaOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
            <span className="w-8 h-[3px] rounded-full bg-border" aria-hidden="true" />
          </button>
          <AnimatePresence initial={false}>
            {qaOpen && (
              <motion.div
                key="qa"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-center overflow-x-auto px-2"
                  style={{ gap: "calc(var(--v2-space) * 1.5)", paddingBottom: "var(--v2-space)" }}>
                  {keys.map((k) => {
                    const Icon = KEY_ICONS[k.id] || Heart;
                    const label = applyTerms(t(KEY_LABEL_KEYS[k.id] || "capture.checkIn"), terms);
                    return (
                      <button key={k.id} type="button"
                        onClick={() => (k.id === "quick_note" ? setNoteOpen(true) : navigate(k.target))}
                        aria-label={label} title={label}
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
                    aria-label={t("capture.support")} title={t("capture.support")}
                    className="flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                    style={{
                      width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
                      borderRadius: "var(--v2-radius)",
                      border: "var(--v2-border-w) solid var(--v2-accent)",
                      color: "var(--v2-accent)",
                    }}>
                    <LifeBuoy style={{ width: "45%", height: "45%" }} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {uiV2.bars.tabs && (
        <div className="flex items-stretch overflow-x-auto" style={{ height: "var(--v2-strip-h)" }} role="tablist" aria-label={t("nav.appNav")}>
          {items.map((item) => {
            const on = isActive(item.path);
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" role="tab" aria-selected={on}
                onClick={() => navigate(item.path)}
                className="flex-1 min-w-[56px] flex flex-col items-center justify-center gap-0.5 px-1"
                style={{
                  color: on ? "var(--v2-accent)" : "hsl(var(--muted-foreground))",
                  boxShadow: on ? "inset 0 calc(var(--v2-border-w) + 1px) 0 var(--v2-accent)" : "none",
                }}>
                {Icon && <Icon style={{ width: 18, height: 18 }} />}
                <span className="text-[0.625rem] font-medium leading-tight whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </nav>
  );
}
