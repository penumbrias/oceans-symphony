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
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, Zap, Activity as ActivityIcon, CheckSquare, Users,
  LifeBuoy, SlidersHorizontal, Bell, Search, PenLine, StickyNote, BookOpen,
  Megaphone, ChevronUp, Eye, EyeOff, ArrowUpToLine, ArrowDownToLine,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import useLongPress from "@/hooks/useLongPress";
import { V2_COMMAND_KEYS } from "@/lib/uiV2";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useT } from "@/lib/i18n";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { buildNavGroups } from "@/lib/navCatalogue";
import HeaderWaveBlock from "@/components/layout/HeaderWaveBlock";
import SidebarNav from "@/components/layout/SidebarNav";
import HeaderPageMenu from "@/components/layout/HeaderPageMenu";
import NewFeaturesBar from "@/components/dashboard/NewFeaturesBar";
import GlobalSearch from "@/components/dashboard/GlobalSearch";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AltersBarCard from "@/components/v2/AltersBarCard";
import AltersBarBubble from "@/components/v2/AltersBarBubble";
import { EdgeDock } from "@/components/v2/EdgeDock";
import { ActiveNowChip, ActiveNowKeyFace, ActiveNowPopover } from "@/components/v2/ActiveNow";
import { IconSlot } from "@/components/shared/LucideByName";

// The full classic Appearance body — themes, palettes, fonts, corner style,
// UI/touch/nav sizes, navigation config. Display options embeds it rather
// than re-implementing it, so v2 can never be LESS customizable than
// classic. Lazy so its colour-picker/font machinery only loads when the
// sheet is actually opened.
const UiEditSheet = React.lazy(() => import("@/components/v2/UiEditSheet"));

const KEY_ICONS = {
  quick_checkin: Heart, quick_note: PenLine, start_activity: Zap,
  start_symptom: ActivityIcon, quick_thing: CheckSquare, set_front: Users,
  active_now: null, // drawn by ActiveNowKeyFace (icon + count badge)
};
const KEY_LABEL_KEYS = {
  quick_checkin: "capture.checkIn", quick_note: "capture.note",
  start_activity: "capture.activity", start_symptom: "capture.symptom",
  quick_thing: "capture.thing", set_front: "capture.front", active_now: "capture.active",
};

const FONT_STEPS = ["xs3", "xs2", "xs", "sm", "default", "lg", "xl", "xl2", "xl3", "xl4", "xl5"];
const QA_OPEN_KEY = "symphony_v2_quickactions_open";
const DOCK_OPEN_KEY = "symphony_v2_dock_open";

// The apps drawer and home-edit mode live on the home canvas; these fire
// them from anywhere (event when already home, flag + navigate otherwise).
// The classic UI's saved Quick Actions (the press-and-hold menu) had no v2
// entry point — it's reachable now by holding the apps button or any
// quick-action key. Dashboard hosts the menu, so this either pokes it in
// place or navigates home with the param it already understands.
export function openSavedQuickActions(navigate, pathname) {
  if (pathname === "/") {
    window.dispatchEvent(new CustomEvent("open-quick-actions"));
  } else {
    navigate("/?openQuickActions=1");
  }
}

// onHold overrides the default (saved Quick Actions) for keys that have a
// more useful hold of their own — Set Fronters folds the pinned-alters bar
// in and out, so the bar can live collapsed inside the quick-action row.
export function useQuickActionsHold(onTap, onHold = null) {
  const navigate = useNavigate();
  const location = useLocation();
  return useLongPress({
    onLongPress: () => (onHold ? onHold() : openSavedQuickActions(navigate, location.pathname)),
    onClick: onTap,
    ms: 450,
  });
}

// A quick-action key: tap fires it, hold opens the saved Quick Actions
// menu (the classic press-and-hold, which v2 was missing).
export function CommandKeyButton({ onTap, label, className, style, children, onHold = null, holdHint = null }) {
  const hold = useQuickActionsHold(onTap, onHold);
  return (
    <button type="button" {...hold} aria-label={label}
      title={`${label} — hold ${holdHint || "for your quick actions"}`}
      className={className} style={style}>
      {children}
    </button>
  );
}

// Per-bar size & text (the wireframe's [SET 5] on each bar): inline CSS
// vars shadow the global tokens on this bar's subtree only, and the veil
// paints the theme Background color — WITH whatever opacity the user gave
// it in Colors (stored #rrggbbaa), so bar translucency is governed by the
// background color's own opacity rather than a hardcoded wash.
export function barLookStyle(uiV2, barId, { veil = true } = {}) {
  const look = uiV2.barLooks?.[barId] || {};
  const style = {};
  if (veil) style.background = "var(--color-bg)";
  if (look.borderW !== undefined) style["--v2-border-w"] = `${look.borderW}px`;
  if (look.radius !== undefined) { style["--v2-radius"] = `${look.radius}px`; style["--radius"] = `${look.radius}px`; }
  if (look.fontScale !== undefined) style.fontSize = `${look.fontScale}%`;
  if (look.font) style.fontFamily = look.font;
  return style;
}

export function requestHomeAction(navigate, pathname, action) {
  if (pathname === "/") {
    window.dispatchEvent(new CustomEvent(`os-v2-${action}`));
  } else {
    try { sessionStorage.setItem(`symphony_v2_${action}`, "1"); } catch { /* storage off */ }
    navigate("/");
  }
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Display options ────────────────────────────────────────────────
export const DOCK_KEY = "symphony_display_options_dock";

function OptionsSheet({ open, onClose, uiV2 }) {
  const t = useT();
  const navigate = useNavigate();
  // Dock the sheet top or bottom — a bottom sheet can sit exactly over
  // the thing being adjusted; flipping it up gets it out of the way.
  const [dock, setDock] = useState(() => {
    try { return localStorage.getItem(DOCK_KEY) === "top" ? "top" : "bottom"; } catch { return "bottom"; }
  });
  const flipDock = () => {
    const next = dock === "top" ? "bottom" : "top";
    setDock(next);
    try { localStorage.setItem(DOCK_KEY, next); } catch { /* storage off */ }
  };
  // The controls themselves live in the Appearance body (V2DisplaySettings
  // renders at its top) — ONE settings surface, embedded here so the
  // top-bar route and Settings → Appearance are the same thing. This sheet
  // only adds the Peek affordance.
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!open || !peek) return undefined;
    document.documentElement.setAttribute("data-v2-peek", "1");
    return () => document.documentElement.removeAttribute("data-v2-peek");
  }, [open, peek]);

  return (
    <Drawer key={dock} direction={dock} open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent direction={dock} className={peek ? "max-h-[40vh]" : "max-h-[85vh]"} {...sheetPortalGuards}>
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DrawerTitle className={peek ? "text-sm" : "text-base"}>{t("options.title")}</DrawerTitle>
              <DrawerDescription className="sr-only">{t("options.subtitle")}</DrawerDescription>
            </div>
            <span className="flex items-center gap-1.5 flex-shrink-0">
            {/* Flip the sheet to the other edge — a bottom sheet can sit
                right on top of the thing being adjusted. */}
            <button type="button" onClick={flipDock}
              aria-label={t("options.dockFlip")} title={t("options.dockFlip")}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
              {dock === "top" ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpToLine className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => setPeek((v) => !v)}
              title={t("options.peekHint")}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                peek ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {peek ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {peek ? t("options.fullPanel") : t("options.peek")}
            </button>
            </span>
          </div>
        </DrawerHeader>
        <div className="px-4 overflow-y-auto overscroll-contain space-y-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
          {/* The unified UI edit popup (docs/v2-edit-menu-spec.md) — the
              user's wireframed structure. Bars/layout controls stay in
              Settings → Appearance until the spec's bars section lands. */}
          {open && (
            <React.Suspense fallback={<p className="text-xs text-muted-foreground py-4">{t("common.loading")}</p>}>
              <UiEditSheet />
            </React.Suspense>
          )}
          <button type="button"
            onClick={() => { onClose(); navigate("/settings?section=appearance"); }}
            className="w-full h-9 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground">
            {t("editSheet.allSettings")}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Quick note ─────────────────────────────────────────────────────
// Exported so the quick-action widgets open the SAME note sheet the
// command bar does, rather than a second one that drifts.
export function QuickNoteSheet({ open, onClose }) {
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
      <DrawerContent {...sheetPortalGuards}>
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

// Search opens as its own sheet so the whole index is reachable from the
// top bar on every page — not just the dashboard.
function SearchSheet({ open, onClose }) {
  const t = useT();
  const terms = useTerms();
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]" {...sheetPortalGuards}>
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">{t("top.search")}</DrawerTitle>
          <DrawerDescription className="text-xs">{applyTerms(t("search.subtitle"), terms)}</DrawerDescription>
        </DrawerHeader>
        {/* The results panel hangs below the input, so the row itself must
            stay input-height — the sheet reserves the space instead. */}
        <div className="px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)", minHeight: "62vh" }}>
          <div className="flex">{open && <GlobalSearch autoFocus onNavigate={onClose} />}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Top bar ────────────────────────────────────────────────────────
export function V2StatusLine({ settingsRow, uiV2 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const clock = useClock();
  const appsIconUrl = useResolvedAvatarUrl(uiV2.appsIcon || "");
  const appsHold = useQuickActionsHold(() => (uiV2.appsView === "sidebar"
    ? setSidebarOpen(true)
    : requestHomeAction(navigate, location.pathname, "open-apps")));
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: mentionLogs = [] } = useQuery({ queryKey: ["mentionLogs"], queryFn: () => base44.entities.MentionLog.list("-created_date", 200) });

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
    <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} uiV2={uiV2} />
  );

  if (!uiV2.bars.top) {
    return (
      <>
        <button type="button" aria-label={t("top.displayOptions")} onClick={() => setOptionsOpen(true)}
          className="fixed z-50 flex items-center justify-center text-muted-foreground/70 hover:text-foreground backdrop-blur rounded-full"
          style={{ background: "var(--color-bg)", top: "calc(env(safe-area-inset-top, 0px) + 6px)", right: "6px", width: 28, height: 28 }}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
        {options}
      </>
    );
  }

  return (
    <header
      data-widget-content
      className="sticky top-0 z-50 backdrop-blur-xl border-b relative overflow-hidden"
      style={{
        ...barLookStyle(uiV2, "top"),
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
        {/* Apps — upper-left, where the classic sidebar trigger lives. The
            icon is the user's own if they've set one in Display options. */}
        <button type="button"
          {...appsHold}
          aria-label={t("top.apps")} title={`${t("top.apps")} — hold for your quick actions`}
          className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
          {appsIconUrl
            ? <img src={appsIconUrl} alt="" className="w-5 h-5 object-cover" style={{ borderRadius: "var(--v2-radius)" }} />
            : <img src="/logo.png" alt="" className="w-6 h-6 object-contain rounded-md" />}
        </button>
        {/* Arrangeable contents (Display options → Bars → Top bar): each
            item renders in the user's order, hidden ones skipped. The
            "spacer" item is the flexible gap deciding where the bar
            splits left/right. Apps (left anchor) and the page menu (the
            recovery path) stay fixed. */}
        {uiV2.topBar.order.filter((id) => !uiV2.topBar.hidden.includes(id)).map((id) => {
          if (id === "spacer") return <span key={id} className="flex-1 min-w-2" />;
          if (id === "name") return (
            <button key={id} type="button" onClick={() => navigate("/")}
              className="font-semibold text-sm truncate max-w-[34%] text-left flex-shrink"
              title={settingsRow?.system_name || terms.System}>
              {settingsRow?.system_name || terms.System}
            </button>
          );
          if (id === "presence") return (
            // Who's here → the Set Fronters window. The Dashboard hosts
            // the sheet, so away from home this navigates in with the
            // action param — same route the quick-action key takes.
            <button key={id} type="button"
              onClick={() => {
                if (location.pathname === "/") window.dispatchEvent(new CustomEvent("open-set-front"));
                else navigate("/?action=set-front");
              }}
              className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground flex-shrink"
              aria-label={`${presenceText} — ${applyTerms(t("capture.front"), terms)}`}
              title={applyTerms(t("capture.front"), terms)}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: fronters.length ? "var(--v2-accent)" : "hsl(var(--muted-foreground))" }} />
              <span className="truncate">{presenceText}</span>
            </button>
          );
          if (id === "active") return <ActiveNowChip key={id} />;
          if (id === "clock") return (
            <span key={id} className="text-xs tabular-nums text-muted-foreground flex-shrink-0">{clock}</span>
          );
          if (id === "search") return (
            <button key={id} type="button" onClick={() => setSearchOpen(true)} aria-label={t("top.search")}
              className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
              <Search className="w-4 h-4" />
            </button>
          );
          if (id === "bell") return (
            // Both notification surfaces live behind the bell: the
            // Reminders inbox (as in classic) AND mention history —
            // tapping used to reach only mentions.
            <DropdownMenu key={id}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t("top.notifications")}
                  className="relative min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
                  <Bell className="w-4 h-4" />
                  {hasUnread && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--v2-accent)" }} />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[60]">
                <DropdownMenuItem onClick={() => navigate("/reminders")}>
                  {t("top.reminders")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  if (location.pathname === "/") window.dispatchEvent(new CustomEvent("open-notification-history"));
                  else navigate("/?action=notifications");
                }}>
                  {applyTerms(t("top.mentions"), terms)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
          return null;
        })}
        {/* The classic page-aware settings menu, with v2 entries on top —
            Edit home screen and Display options are one tap away from any
            page, and "All settings" stays the catch-all. */}
        <HeaderPageMenu
          className="min-w-[34px] min-h-[34px] rounded-none"
          v2Options={{
            editHome: () => requestHomeAction(navigate, location.pathname, "edit-home"),
            // On the home board this opens the SAME sheet the board's own
            // cog opens (board pills + the unified popup) — one surface,
            // not two lookalikes. Elsewhere, the plain popup sheet.
            openDisplayOptions: () => (location.pathname === "/"
              ? requestHomeAction(navigate, location.pathname, "home-settings")
              : setOptionsOpen(true)),
            openWhatsNew: () => setWhatsNewOpen(true),
          }}
        />
      </div>
      {options}
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
      {/* What's new, as a popup — the SAME panel the classic dashboard bar
          shows (entries, older releases, bug report, the links), not a
          second copy of it. */}
      <Drawer open={whatsNewOpen} modal={false} onOpenChange={(v) => { if (!v) setWhatsNewOpen(false); }}>
        <DrawerContent className="max-h-[85vh]" {...sheetPortalGuards}>
          <DrawerHeader className="pb-1">
            <DrawerTitle className="text-base">{"What's new"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-3 pb-6 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
            <NewFeaturesBar embedded />
          </div>
        </DrawerContent>
      </Drawer>
      {/* Classic sidebar, verbatim — the appsView="sidebar" mode is exactly
          the old UI's navigation, not an imitation of it. */}
      {/* Always mounted, `open` toggles — SidebarNav closes itself when the
          route changes via an effect that ALSO runs on first mount, so
          mounting it only when open made it flash and vanish instantly.
          PORTALED to body: this header is overflow-hidden with a backdrop
          filter, which clips fixed descendants and traps them inside the
          40px strip — the drawer looked like it opened "behind" the page. */}
      {createPortal(
        // The wrapper div matters: the sidebar's backdrop is `.fixed`, and a
        // global guard rule force-enables pointer-events on body's DIRECT
        // .fixed children (the vaul-sheet fix). Portaled bare, the closed
        // backdrop became an invisible screen-wide touch eater — nothing
        // scrolled. One plain div in between and the rule can't match.
        <div data-v2-sidebar-root="">
          <SidebarNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>,
        document.body,
      )}
      {/* Quick actions can live up here instead (Display options → Quick
          action bar → Edge → Top): the same strip, row above its handle,
          swipe DOWN opens. */}
      {uiV2.bars.actions && (uiV2.tokens.actionsMode || "bar") === "bar" && (uiV2.tokens.actionsEdge || "bottom") === "top" && (
        <div className="relative" style={{ zIndex: 1 }}>
          <QuickActionsStrip uiV2={uiV2} settingsRow={settingsRow} edge="top" />
        </div>
      )}
    </header>
  );
}

// The user's own nav list, resolved once: the SAME
// navigation_config.bottomBar the classic bar uses, so configuring it in
// Settings → Appearance → Navigation drives both UIs and nobody has to set
// their tabs up twice.
function useNavItems(settingsRow) {
  const terms = useTerms();
  const navConfig = settingsRow?.navigation_config || DEFAULT_CONFIG;
  const termMap = useMemo(() => ({
    alters: terms.Alters,
    checkin: `${terms.System} Meeting`,
    "system-map": `${terms.System} Map`,
    "system-history": `${terms.System} History`,
  }), [terms]);
  const resolve = (ids) => (ids || [])
    .map((id) => ALL_PAGES.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ ...p, label: termMap[p.id] || p.label }));
  const primaryIds = navConfig.bottomBar || DEFAULT_CONFIG.bottomBar;
  const primary = useMemo(() => resolve(primaryIds), [primaryIds, termMap]);
  // The rail has room the bottom bar doesn't — everything else the user has
  // chosen for their dashboard goes underneath, so desktop isn't limited to
  // five destinations.
  // Grouped, not a flat dump: the rail reuses the app's own nav grouping
  // (System / Tracking / Journal & Content / Tools / Analytics) so a long
  // list stays scannable.
  const groups = useMemo(() => {
    const raw = buildNavGroups(terms.Alters, terms.System);
    return Object.entries(raw)
      .map(([label, items]) => ({ label, items: items.filter((i) => !primaryIds.includes(i.id)) }))
      .filter((g) => g.items.length > 0);
  }, [terms.Alters, terms.System, primaryIds]);
  return { primary, groups };
}

function useIsActive() {
  const location = useLocation();
  return (path) =>
    path === "/" ? location.pathname === "/"
      : path === "/Home" ? location.pathname === "/Home" || location.pathname.startsWith("/alter")
      : location.pathname.startsWith(path);
}

// ── Desktop side rail ──────────────────────────────────────────────
// A phone's bottom bar makes no sense on a wide screen: five destinations
// across 1400px, with the content squeezed under it. At ≥1024px the rail
// takes over — same pages, plus everything else that didn't fit, always
// visible, and the quick actions stack instead of hiding behind a handle.
export function V2SideRail({ uiV2, settingsRow }) {
  const navigate = useNavigate();
  const t = useT();
  const terms = useTerms();
  const isActive = useIsActive();
  const { primary, groups } = useNavItems(settingsRow);
  const [noteOpen, setNoteOpen] = useState(false);
  if (!uiV2.bars.rail) return null;

  const onRight = uiV2.tokens.railSide === "right";
  const iconsOnly = uiV2.tokens.railActions === "icons";
  const keys = uiV2.commandKeys.map((id) => V2_COMMAND_KEYS.find((k) => k.id === id)).filter(Boolean);

  const NavButton = ({ item, dim }) => {
    const on = isActive(item.path);
    const Icon = item.icon;
    const ov = uiV2.icons?.pages?.[item.id];
    return (
      <button type="button" onClick={() => navigate(item.path)} aria-current={on ? "page" : undefined}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left ${dim ? "text-xs" : "text-sm"} hover:bg-muted/40`}
        style={{
          borderRadius: "var(--v2-radius)",
          color: on ? "var(--v2-accent)" : "hsl(var(--muted-foreground))",
          boxShadow: on ? "inset 2px 0 0 var(--v2-accent)" : "none",
        }}>
        <IconSlot override={ov} Default={Icon} style={{ width: dim ? 14 : 16, height: dim ? 14 : 16, flexShrink: 0 }} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <nav
      aria-label={t("nav.appNav")}
      style={barLookStyle(uiV2, "rail")}
      data-widget-content
      className={`hidden lg:flex flex-col fixed bottom-0 z-40 backdrop-blur-xl overflow-y-auto overscroll-contain ${
        onRight ? "right-0 border-l" : "left-0 border-r"
      }`}
      style={{
        top: uiV2.bars.top ? "calc(var(--v2-status-h) + env(safe-area-inset-top, 0px))" : 0,
        width: "var(--v2-rail-w)",
        [onRight ? "paddingRight" : "paddingLeft"]: "env(safe-area-inset-left, 0px)",
        borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)",
        [onRight ? "borderLeftWidth" : "borderRightWidth"]: "var(--v2-border-w)",
      }}
    >
      <div className="p-2 space-y-0.5">
        {primary.map((item) => <NavButton key={item.id} item={item} />)}
      </div>

      {uiV2.bars.actions && keys.length > 0 && (
        <div className="px-2 pb-2 space-y-0.5 border-t pt-2" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
          <p className="px-1 pb-1 text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("nav.quickActions")}
          </p>
          <div className={iconsOnly ? "flex flex-wrap gap-1" : "space-y-0.5"}>
            {keys.map((k) => {
              const Icon = KEY_ICONS[k.id] || Heart;
              const label = applyTerms(t(KEY_LABEL_KEYS[k.id] || "capture.checkIn"), terms);
              const onPress = () => (k.id === "quick_note" ? setNoteOpen(true) : navigate(k.target));
              return iconsOnly ? (
                <CommandKeyButton key={k.id} onTap={onPress} label={label}
                  className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                  style={{
                    width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
                    borderRadius: "var(--v2-radius)",
                    border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
                  }}>
                  <IconSlot override={uiV2.icons?.keys?.[k.id]} Default={Icon} style={{ width: "45%", height: "45%" }} />
                </CommandKeyButton>
              ) : (
                <CommandKeyButton key={k.id} onTap={onPress} label={label}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  style={{ borderRadius: "var(--v2-radius)" }}>
                  <IconSlot override={uiV2.icons?.keys?.[k.id]} Default={Icon} className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{label}</span>
                </CommandKeyButton>
              );
            })}
            <button type="button" onClick={() => navigate("/grounding")}
              title={t("capture.support")} aria-label={t("capture.support")}
              className={iconsOnly
                ? "flex items-center justify-center"
                : "w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"}
              style={iconsOnly
                ? { width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)", borderRadius: "var(--v2-radius)", border: "var(--v2-border-w) solid var(--v2-accent)", color: "var(--v2-accent)" }
                : { borderRadius: "var(--v2-radius)", color: "var(--v2-accent)" }}>
              <LifeBuoy className={iconsOnly ? "" : "w-3.5 h-3.5 flex-shrink-0"}
                style={iconsOnly ? { width: "45%", height: "45%" } : undefined} />
              {!iconsOnly && <span className="truncate">{t("capture.support")}</span>}
            </button>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.label} className="px-2 pb-2 space-y-0.5 border-t pt-2" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
          <p className="px-1 pb-1 text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </p>
          {g.items.map((item) => <NavButton key={item.id} item={item} dim />)}
        </div>
      ))}
      <div className="pb-4" />

      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </nav>
  );
}

// ── Quick-action dock (floating edge bar / bubble) ─────────────────
// Alternative homes for the quick actions: a strip stuck to a screen edge,
// or a single bubble that opens into the strip — same actions, same order,
// just a different place to keep them. Positioning/drag = EdgeDock.
export function V2QuickDock({ uiV2, settingsRow }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();
  const terms = useTerms();
  const [noteOpen, setNoteOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const activeAnchor = useRef(null);
  const [bubbleOpen, setBubbleOpen] = useState(() => {
    try { return localStorage.getItem(DOCK_OPEN_KEY) === "1"; } catch { return false; }
  });
  const mode = uiV2.tokens.actionsMode || "bar";
  const isBubble = mode === "bubble";
  const open = !isBubble || bubbleOpen;
  const side = uiV2.dockPos?.side || (uiV2.tokens.dockSide === "left" ? "left" : "right");
  const topPct = uiV2.dockPos?.topPct ?? 50;
  const keys = uiV2.commandKeys.map((id) => V2_COMMAND_KEYS.find((k) => k.id === id)).filter(Boolean);

  const setOpen = (v) => {
    setBubbleOpen(v);
    try { localStorage.setItem(DOCK_OPEN_KEY, v ? "1" : "0"); } catch { /* storage off */ }
  };
  const savePos = async (pos) => {
    try {
      if (!settingsRow?.id) return;
      await base44.entities.SystemSettings.update(settingsRow.id, {
        ui_v2: { ...(settingsRow.ui_v2 || {}), dockPos: pos },
      });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* best-effort */ }
  };

  if (!uiV2.bars.actions || (mode !== "float" && mode !== "bubble")) return null;

  return (
    <EdgeDock side={side} topPct={topPct} onSavePos={savePos}
      renderHandle={(bind) => (!isBubble ? (
        <span
          onPointerDown={bind.onPointerDown}
          onContextMenu={bind.onContextMenu}
          title={t("nav.dockDragHint")}
          className="w-6 h-3 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "pan-y" }}
        >
          <span className="w-4 h-[3px] rounded-full bg-border" aria-hidden="true" />
        </span>
      ) : (
        <button type="button"
          onPointerDown={bind.onPointerDown}
          onContextMenu={bind.onContextMenu}
          onClick={() => {
            if (bind.suppressTap.current) { bind.suppressTap.current = false; return; }
            setOpen(!bubbleOpen);
          }}
          aria-expanded={bubbleOpen}
          aria-label={bubbleOpen ? t("nav.hideQuickActions") : t("nav.showQuickActions")}
          className="flex items-center justify-center active:scale-95 transition-transform backdrop-blur"
          style={{
            background: "var(--color-bg)",
            width: "calc(var(--v2-cmd-size) + 6px)", height: "calc(var(--v2-cmd-size) + 6px)",
            borderRadius: "9999px",
            border: "var(--v2-border-w) solid var(--v2-accent)",
            color: "var(--v2-accent)",
            boxShadow: "0 2px 10px rgb(0 0 0 / 0.3)",
          }}>
          {bubbleOpen
            ? <ChevronUp style={{ width: "40%", height: "40%", transform: side === "right" ? "rotate(90deg)" : "rotate(-90deg)" }} />
            : <Zap style={{ width: "42%", height: "42%" }} />}
        </button>
      ))}>
      {open && keys.map((k) => {
        const Icon = KEY_ICONS[k.id] || Heart;
        const label = applyTerms(t(KEY_LABEL_KEYS[k.id] || "capture.checkIn"), terms);
        return (
          <CommandKeyButton key={k.id} label={label}
            onHold={k.id === "set_front" ? () => window.dispatchEvent(new CustomEvent("os-v2-toggle-alters-bar")) : null}
            holdHint={k.id === "set_front" ? `to fold the pinned ${terms.alters} bar in or out` : null}
            onTap={() => (k.id === "quick_note" ? setNoteOpen(true) : k.id === "active_now" ? setActiveOpen((v) => !v) : navigate(k.target))}
            className="flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-transform backdrop-blur"
            style={{
              background: "var(--color-bg)",
              width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
              borderRadius: "var(--v2-radius)",
              border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
              boxShadow: "0 2px 8px rgb(0 0 0 / 0.25)",
            }}>
            {k.id === "active_now" ? <ActiveNowKeyFace /> : <IconSlot override={uiV2.icons?.keys?.[k.id]} Default={Icon} style={{ width: "45%", height: "45%" }} />}
          </CommandKeyButton>
        );
      })}
      {open && (
        <button type="button" onClick={() => navigate("/grounding")}
          aria-label={t("capture.support")} title={t("capture.support")}
          className="flex items-center justify-center active:scale-95 transition-transform backdrop-blur"
          style={{
            background: "var(--color-bg)",
            width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
            borderRadius: "var(--v2-radius)",
            border: "var(--v2-border-w) solid var(--v2-accent)",
            color: "var(--v2-accent)",
            boxShadow: "0 2px 8px rgb(0 0 0 / 0.25)",
          }}>
          <LifeBuoy style={{ width: "45%", height: "45%" }} />
        </button>
      )}
      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
      <ActiveNowPopover anchorRef={activeAnchor} open={activeOpen} onClose={() => setActiveOpen(false)} />
    </EdgeDock>
  );
}

// ── Quick-actions strip (bar mode) ──────────────────────────────────
// The split handle + the fold-out row of command keys. One component,
// two hosts: the bottom chrome (handle above the row, swipe UP opens) or
// the top bar (row above the handle, swipe DOWN opens — Display options →
// Quick action bar → Edge). Open state is a device preference.
function QuickActionsStrip({ uiV2, settingsRow, edge = "bottom" }) {
  const navigate = useNavigate();
  const t = useT();
  const terms = useTerms();
  const [noteOpen, setNoteOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const activeAnchor = useRef(null);
  const [qaOpen, setQaOpen] = useState(() => {
    try { return localStorage.getItem(QA_OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggleQa = (next) => {
    setQaOpen(next);
    try { localStorage.setItem(QA_OPEN_KEY, next ? "1" : "0"); } catch { /* storage off */ }
  };
  const dragStart = useRef(null);
  const altersDragStart = useRef(null);
  const swiped = useRef(false);
  const keys = uiV2.commandKeys.map((id) => V2_COMMAND_KEYS.find((k) => k.id === id)).filter(Boolean);
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const altersBarCfg = settingsRow?.[homeField]?.altersBar || {};
  const altersInNav = altersBarCfg.enabled === true;
  // Top edge: "open" is a swipe DOWN; the chevrons flip to match.
  const dir = edge === "top" ? -1 : 1;
  const openRot = edge === "top" ? "none" : "rotate(180deg)";
  const closedRot = edge === "top" ? "rotate(180deg)" : "none";

  // Per-bar [SET 5] for the quick-action row (no veil of its own — it
  // sits on the hosting bar's).
  const handle = (
          <div className="relative" style={barLookStyle(uiV2, "actions", { veil: false })}>
          {/* ONE handle row, split in two (the user's call — no separate
              icon toggles): swipe up (or tap) on the LEFT half for the
              pinned {alters} bar, on the RIGHT half for the quick
              actions. Both halves swipe down to close their own thing. */}
          <div className="w-full flex" style={{ height: 18 }}>
            {/* Each half is the same glyph — dash · chevron · dash — centred
                in its half (the lone off-centre chevron looked broken). The
                halves swap with the Handle-halves option. */}
            <button
              type="button"
              style={{ touchAction: "none", order: (uiV2.tokens.handleSides || "alters-left") === "alters-right" ? 2 : 1 }}
              aria-label={applyTerms(t("nav.showAlterBar"), terms)}
              title={applyTerms(t("nav.showAlterBar"), terms)}
              onPointerDown={(e) => {
                altersDragStart.current = e.clientY;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
              }}
              onPointerUp={(e) => {
                const dy = altersDragStart.current == null ? 0 : e.clientY - altersDragStart.current;
                altersDragStart.current = null;
                try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
                if (dir * dy < -14) window.dispatchEvent(new CustomEvent("os-v2-toggle-alters-bar", { detail: { open: true } }));
                else if (dir * dy > 14) window.dispatchEvent(new CustomEvent("os-v2-toggle-alters-bar", { detail: { open: false } }));
                else window.dispatchEvent(new CustomEvent("os-v2-toggle-alters-bar"));
              }}
              className="flex-1 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <span className="w-6 h-[3px] rounded-full bg-border" aria-hidden="true" />
              <ChevronUp className="w-3 h-3" style={{ transform: altersInNav && !altersBarCfg.collapsed ? openRot : closedRot, transition: "transform .18s" }} />
              <span className="w-6 h-[3px] rounded-full bg-border" aria-hidden="true" />
            </button>
            <button
              type="button"
              style={{ touchAction: "none", order: (uiV2.tokens.handleSides || "alters-left") === "alters-right" ? 1 : 2 }}
              aria-expanded={qaOpen}
              aria-label={qaOpen ? t("nav.hideQuickActions") : t("nav.showQuickActions")}
              title={t("nav.showQuickActions")}
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
                if (dir * dy < -14) { swiped.current = true; toggleQa(true); }
                else if (dir * dy > 14) { swiped.current = true; toggleQa(false); }
              }}
              className="flex-1 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <span className="w-6 h-[3px] rounded-full bg-border" aria-hidden="true" />
              <ChevronUp className="w-3 h-3" style={{ transform: qaOpen ? openRot : closedRot, transition: "transform .18s" }} />
              <span className="w-6 h-[3px] rounded-full bg-border" aria-hidden="true" />
            </button>
          </div>
          </div>
  );
  const row = (
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
                      <CommandKeyButton key={k.id} label={label}
                        onHold={k.id === "set_front" ? () => window.dispatchEvent(new CustomEvent("os-v2-toggle-alters-bar")) : null}
                        holdHint={k.id === "set_front" ? `to fold the pinned ${terms.alters} bar in or out` : null}
                        onTap={() => (k.id === "quick_note" ? setNoteOpen(true) : k.id === "active_now" ? setActiveOpen((v) => !v) : navigate(k.target))}
                        className="flex items-center justify-center flex-shrink-0 text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
                        style={{
                          width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
                          borderRadius: "var(--v2-radius)",
                          border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
                        }}>
                        {k.id === "active_now" ? <ActiveNowKeyFace /> : <IconSlot override={uiV2.icons?.keys?.[k.id]} Default={Icon} style={{ width: "45%", height: "45%" }} />}
                      </CommandKeyButton>
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
  );
  return (
    <>
      {edge === "top" ? <>{row}{handle}</> : <>{handle}{row}</>}
      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
      <ActiveNowPopover anchorRef={activeAnchor} open={activeOpen} onClose={() => setActiveOpen(false)} />
    </>
  );
}

// ── Bottom chrome ──────────────────────────────────────────────────
export function V2BottomChrome({ uiV2, settingsRow }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const t = useT();
  const isActive = useIsActive();
  const terms = useTerms();
  const [noteOpen, setNoteOpen] = useState(false);
  const altersDragStart = useRef(null);
  const swiped = useRef(false);
  // The quick-actions strip (QuickActionsStrip) keeps its own open state;
  // the chrome only needs to re-measure when it folds, which the
  // ResizeObserver below sees on its own.

  const { primary: items } = useNavItems(settingsRow);
  const keys = uiV2.commandKeys.map((id) => V2_COMMAND_KEYS.find((k) => k.id === id)).filter(Boolean);

  // The pinned {alters} bar takes the quick-action bar's slot when that
  // bar is off (the user's spec: it should copy the QUICK ACTIONS bar's
  // display, not float like the support bubble). Config lives on the
  // device's home board, same field the board itself reads.
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const altersBarCfg = settingsRow?.[homeField]?.altersBar || {};
  // Hosted here on EVERY page whenever it's switched on (v0.189.1 — the
  // user's spec: it works like the quick-actions bar). It used to live on
  // the home board only, with the chrome hosting it just when the
  // quick-actions bar was off.
  const altersInNav = altersBarCfg.enabled === true;
  const setNavAlters = async (collapsed) => {
    if (!settingsRow?.id) return;
    await base44.entities.SystemSettings.update(settingsRow.id, {
      [homeField]: {
        ...(settingsRow[homeField] || {}),
        altersBar: { ...altersBarCfg, enabled: true, collapsed },
      },
    });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const toggleNavAlters = () => setNavAlters(!altersBarCfg.collapsed);
  // The split handle, the Set-Front key hold and the board all speak this
  // event; the chrome answers it on every page (the board only when there
  // is no chrome to host the bar).
  const navHostsAlters = uiV2.bars.actions || uiV2.bars.tabs;
  useEffect(() => {
    if (!navHostsAlters) return undefined;
    const onToggle = (e) => {
      const want = e?.detail?.open;
      const collapsed = want === true ? false : want === false ? true
        : (altersBarCfg.enabled ? !altersBarCfg.collapsed : false);
      setNavAlters(collapsed);
    };
    window.addEventListener("os-v2-toggle-alters-bar", onToggle);
    return () => window.removeEventListener("os-v2-toggle-alters-bar", onToggle);
  }, [navHostsAlters, settingsRow?.id, altersBarCfg.enabled, altersBarCfg.collapsed, homeField]);

  // Publish the bar's REAL height so everything that has to clear it —
  // page content, the sidebar, sheets, the floating buttons — reserves the
  // right amount. It changes with the quick-actions drawer, the tab strip,
  // the user's size tokens and the breakpoint, so it's measured rather than
  // computed from settings (the old estimate assumed the drawer was always
  // shut, which is exactly when the bar covered things).
  const navRef = useRef(null);
  useEffect(() => {
    const el = navRef.current;
    const root = document.documentElement;
    const publish = () => {
      if (!el) return;
      const box = el.getBoundingClientRect().height;
      // The nav pads itself by the safe-area inset; consumers add that
      // inset themselves, so report the height above it.
      const inset = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      root.style.setProperty("--v2-bottom-chrome-h", `${Math.max(0, Math.round(box - inset))}px`);
    };
    publish();
    if (!el || typeof ResizeObserver === "undefined") return () => root.style.removeProperty("--v2-bottom-chrome-h");
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    window.addEventListener("orientationchange", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      root.style.removeProperty("--v2-bottom-chrome-h");
    };
  }, [uiV2.bars.actions, uiV2.bars.tabs, uiV2.bars.rail, items.length, keys.length]);

  // The nav box itself has content when the tab strip is on or the
  // quick-actions strip lives down here. The alters bar stack renders
  // regardless (it floats; its height var falls back to 0).
  const navHasContent = uiV2.bars.tabs || (uiV2.bars.actions && (uiV2.tokens.actionsMode || "bar") === "bar" && (uiV2.tokens.actionsEdge || "bottom") !== "top");
  if (!navHasContent && !altersInNav) return null;

  return (
    <>
    {/* The pinned {alters} bar: a floating card ABOVE the chrome, on every
        page, visually separate from the bottom bar (the user's call — a
        band inside the nav made the bottom section too tall). Sits on the
        chrome's published height so it clears the tab strip and the
        quick-action drawer whatever their size. */}
    {altersInNav && altersBarCfg.mode === "bubble" && (
      <AltersBarBubble settingsRow={settingsRow} home={settingsRow?.[homeField] || {}}
        open={!altersBarCfg.collapsed}
        onToggle={(on) => setNavAlters(!on)}
        onSavePos={async (bubble) => {
          if (!settingsRow?.id) return;
          await base44.entities.SystemSettings.update(settingsRow.id, {
            [homeField]: { ...(settingsRow[homeField] || {}), altersBar: { ...altersBarCfg, bubble } },
          });
          qc.invalidateQueries({ queryKey: ["systemSettings"] });
        }}
        onGear={() => requestHomeAction(navigate, location.pathname, "bar-options")} />
    )}
    {altersInNav && altersBarCfg.mode !== "bubble" && (
      <div
        className={`fixed left-0 right-0 z-40 flex flex-col items-center pointer-events-none ${uiV2.bars.rail ? "lg:hidden" : ""}`}
        style={{ bottom: "calc(var(--v2-bottom-chrome-h, 56px) + env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
          <AnimatePresence initial={false}>
            {!altersBarCfg.collapsed && (
              <motion.div
                key="alters-bar"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-auto w-full min-w-0"
              >
                <div className="mx-3">
                  {/* The SAME card the home board draws — look, SET 5,
                      swipe-to-hide, options gear. The gear opens the
                      board's bar options (navigating home first if needed). */}
                  <AltersBarCard settingsRow={settingsRow} home={settingsRow?.[homeField] || {}}
                    onCollapse={() => setNavAlters(true)}
                    onGear={() => requestHomeAction(navigate, location.pathname, "bar-options")} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    )}
    {navHasContent && (
    <nav
      ref={navRef}
      // The rail takes over on wide screens; a bottom bar there is just a
      // phone habit stretched across a monitor.
      data-widget-content
      className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t ${uiV2.bars.rail ? "lg:hidden" : ""}`}
      style={{
        ...barLookStyle(uiV2, "tabs"),
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)",
        borderTopWidth: "var(--v2-border-w)",
      }}
      aria-label={t("nav.appNav")}
    >
      {/* The bar itself FLOATS above this chrome (see the fixed stack
          before <nav>) — the user wants it visually separate, not another
          band making the bottom section taller. Only its fold handle lives
          here, and only when there's no split handle to do the job. */}
      {altersInNav && (
        <div className="relative">
          {/* With the quick-action row OFF there's no split handle, so the
              bar carries its own: tap toggles, swipe up opens, swipe down
              closes (pointer captured so a swipe that leaves the strip
              still counts). With it ON, the split handle's left half does
              this — no second handle. */}
          {!(uiV2.bars.actions && (uiV2.tokens.actionsMode || "bar") === "bar" && (uiV2.tokens.actionsEdge || "bottom") !== "top") && (
            <button
              type="button"
              aria-expanded={!altersBarCfg.collapsed}
              aria-label={altersBarCfg.collapsed ? `Show the pinned ${terms.alters} bar` : `Hide the pinned ${terms.alters} bar`}
              onClick={() => {
                if (swiped.current) { swiped.current = false; return; }
                toggleNavAlters();
              }}
              onPointerDown={(e) => {
                altersDragStart.current = e.clientY;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
              }}
              onPointerUp={(e) => {
                const dy = altersDragStart.current == null ? 0 : e.clientY - altersDragStart.current;
                altersDragStart.current = null;
                try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
                if (dy < -14 && altersBarCfg.collapsed) { swiped.current = true; setNavAlters(false); }
                else if (dy > 14 && !altersBarCfg.collapsed) { swiped.current = true; setNavAlters(true); }
                else if (Math.abs(dy) > 14) { swiped.current = true; }
              }}
              className="w-full flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
              style={{ height: 18, touchAction: "none" }}
            >
              <span className="w-8 h-[3px] rounded-full bg-border" aria-hidden="true" />
              <ChevronUp className="w-3 h-3" style={{ transform: altersBarCfg.collapsed ? "none" : "rotate(180deg)", transition: "transform .18s" }} />
              <span className="w-8 h-[3px] rounded-full bg-border" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {uiV2.bars.actions && (uiV2.tokens.actionsMode || "bar") === "bar" && (uiV2.tokens.actionsEdge || "bottom") !== "top" && (
        <QuickActionsStrip uiV2={uiV2} settingsRow={settingsRow} edge="bottom" />
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
                <IconSlot override={uiV2.icons?.pages?.[item.id]} Default={Icon} style={{ width: 18, height: 18 }} />
                <span className="text-[0.625em] font-medium leading-tight whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </nav>
    )}
    </>
  );
}
