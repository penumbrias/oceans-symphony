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
  Megaphone, ChevronUp, Eye, EyeOff, LayoutGrid, Pencil,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { V2_COMMAND_KEYS, V2_TOKEN_DEFS, buildTokenVars } from "@/lib/uiV2";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getAccessibilitySettings, setAccessibilityFontSize } from "@/lib/useAccessibility";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useT, LOCALES, getLocale, setLocale, localeCoverage } from "@/lib/i18n";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { buildNavGroups } from "@/lib/navCatalogue";
import HeaderWaveBlock from "@/components/layout/HeaderWaveBlock";
import SidebarNav from "@/components/layout/SidebarNav";
import GlobalSearch from "@/components/dashboard/GlobalSearch";
import ColorPicker from "@/components/shared/ColorPicker";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// The full classic Appearance body — themes, palettes, fonts, corner style,
// UI/touch/nav sizes, navigation config. Display options embeds it rather
// than re-implementing it, so v2 can never be LESS customizable than
// classic. Lazy so its colour-picker/font machinery only loads when the
// sheet is actually opened.
const AdvancedAppearance = React.lazy(() => import("@/components/settings/AdvancedAppearanceNew"));

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
const PREVIEW_OPEN_KEY = "symphony_v2_options_preview";
const DOCK_OPEN_KEY = "symphony_v2_dock_open";

// The apps drawer and home-edit mode live on the home canvas; these fire
// them from anywhere (event when already home, flag + navigate otherwise).
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
// Live sample of what the settings are doing. The sheet covers the app on
// a phone, so without this you'd be adjusting blind and closing the sheet
// after every nudge.
//
// It carries data-ui-v2 + the token vars ITSELF rather than inheriting
// them: the sheet is portaled to <body>, outside the app root those live
// on. That turns out to be the honest way to preview anyway — the sample
// is styled by exactly the same rules as the real thing.
function LivePreview({ uiV2 }) {
  const t = useT();
  const vars = useMemo(() => buildTokenVars(uiV2), [uiV2]);
  return (
    <div data-ui-v2="1" style={vars}
      className="rounded-xl border border-border/60 bg-background p-3 space-y-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("options.preview")}
        </span>
        <span className="text-xs" style={{ color: "var(--v2-accent)" }}>{t("widget.today.open")}</span>
      </div>
      <div className="rounded-xl border border-border/60 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--v2-accent)" }} />
          <span className="text-sm flex-1 truncate">{t("options.previewRow")}</span>
          <span className="text-xs text-muted-foreground tabular-nums">12:30</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" tabIndex={-1}
            className="text-xs px-3 py-1.5 rounded-lg text-white"
            style={{ background: "var(--v2-accent)" }}>
            {t("note.save")}
          </button>
          <button type="button" tabIndex={-1}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground">
            {t("options.previewSecondary")}
          </button>
          <span className="text-[0.625rem] px-2 py-1 rounded-full border border-border/60 text-muted-foreground">
            {t("options.previewPill")}
          </span>
        </div>
        <div className="h-8 rounded-lg border border-input bg-background flex items-center px-2">
          <span className="text-xs text-muted-foreground">{t("note.placeholder")}</span>
        </div>
      </div>
      {/* The bars, at their real heights */}
      <div className="rounded-xl border overflow-hidden"
        style={{ borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)", borderWidth: "var(--v2-border-w)" }}>
        <div className="flex items-center gap-2 px-2" style={{ height: "var(--v2-status-h)" }}>
          <span className="text-xs font-semibold">Aa</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--v2-accent)" }} />
          <span className="ml-auto text-[0.625rem] text-muted-foreground tabular-nums">12:30</span>
        </div>
        <div className="flex items-center justify-center gap-2 py-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center justify-center"
              style={{
                width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
                borderRadius: "var(--v2-radius)",
                border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
              }}>
              <Heart className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
          ))}
        </div>
        <div className="flex" style={{ height: "var(--v2-strip-h)" }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{
                color: i === 0 ? "var(--v2-accent)" : "hsl(var(--muted-foreground))",
                boxShadow: i === 0 ? "inset 0 calc(var(--v2-border-w) + 1px) 0 var(--v2-accent)" : "none",
              }}>
              <Heart className="w-3.5 h-3.5" />
              <span className="text-[0.5rem]">Aa</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function OptionsSheet({ open, onClose, uiV2, onToken, onBar, onMisc }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const appsIconUrl = useResolvedAvatarUrl(uiV2.appsIcon || "");
  const [fontIdx, setFontIdx] = useState(() =>
    Math.max(0, FONT_STEPS.indexOf(getAccessibilitySettings().fontSize || "default"))
  );
  const [locale, setLocaleState] = useState(getLocale());
  // ONE section open at a time. Closed sections expose no sliders, which is
  // what actually stops settings changing under a scrolling finger — the
  // earlier touch-action patch only helped for perfectly vertical swipes.
  const [openSection, setOpenSection] = useState(null);
  const toggleSection = (id) => setOpenSection((cur) => (cur === id ? null : id));
  const [peek, setPeek] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(() => {
    try { return localStorage.getItem(PREVIEW_OPEN_KEY) === "1"; } catch { return false; }
  });
  const togglePreview = (next) => {
    setPreviewOpen(next);
    try { localStorage.setItem(PREVIEW_OPEN_KEY, next ? "1" : "0"); } catch { /* storage off */ }
  };
  useEffect(() => {
    if (!open || !peek) return undefined;
    document.documentElement.setAttribute("data-v2-peek", "1");
    return () => document.documentElement.removeAttribute("data-v2-peek");
  }, [open, peek]);

  const localeCodes = Object.keys(LOCALES);
  const tokenById = useMemo(() => Object.fromEntries(V2_TOKEN_DEFS.map((d) => [d.id, d])), []);

  // Range rows get −/+ steppers: precise, and impossible to hit by
  // accident while scrolling. The slider stays for coarse moves.
  const renderToken = (def) => {
    const val = uiV2.tokens[def.id] ?? def.default;
    if (def.type === "range") {
      const shown = def.id === "contentW" && !val ? t("options.valueFull") : `${val}${def.unit || ""}`;
      const step = (dir) => {
        const next = Math.min(def.max, Math.max(def.min, (Number(val) || 0) + dir * def.step));
        if (next !== val) onToken(def.id, next);
      };
      return (
        <div key={def.id} className="flex items-center gap-3 py-1">
          <span className="text-xs font-medium flex-1 min-w-0 truncate">{def.label}</span>
          <button type="button" aria-label={`${def.label} −`} onClick={() => step(-1)}
            className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none">−</button>
          <input type="range" min={def.min} max={def.max} step={def.step} value={val}
            onChange={(e) => onToken(def.id, parseInt(e.target.value, 10))}
            className="w-28 sm:w-40" aria-label={def.label} />
          <button type="button" aria-label={`${def.label} +`} onClick={() => step(1)}
            className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none">+</button>
          <span className="text-xs text-muted-foreground tabular-nums w-12 text-right flex-shrink-0">{shown}</span>
        </div>
      );
    }
    if (def.type === "select") {
      return (
        <div key={def.id} className="flex items-center gap-3 py-1">
          <span className="text-xs font-medium flex-1 min-w-0 truncate">{def.label}</span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {def.options.map((o) => (
              <button key={o.v} type="button" onClick={() => onToken(def.id, o.v)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  val === o.v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (def.type === "color") {
      return (
        <div key={def.id} className="flex items-center gap-3 py-1">
          <span className="text-xs font-medium flex-1 min-w-0 truncate">{def.label}</span>
          <ColorPicker value={val || "#3b82f6"} onChange={(v) => onToken(def.id, v)} />
          <button type="button" onClick={() => onToken(def.id, "")}
            className={`text-xs px-2.5 py-1 rounded-full border ${!val ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
            {t("options.useTheme")}
          </button>
        </div>
      );
    }
    return null;
  };

  const Section2 = ({ id, title, children }) => {
    const on = openSection === id;
    return (
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <button type="button" onClick={() => toggleSection(id)}
          className={`w-full flex items-center justify-between px-3 py-2.5 text-left ${on ? "bg-muted/30" : ""}`}>
          <span className="text-xs font-semibold">{title}</span>
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground"
            style={{ transform: on ? "none" : "rotate(180deg)", transition: "transform .18s" }} />
        </button>
        {on && <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border/40">{children}</div>}
      </div>
    );
  };

  const LOOK_IDS = ["accent", "density", "radius", "borderW"];
  const lookDefs = LOOK_IDS.map((id) => tokenById[id]).filter(Boolean);
  const sizeDefs = V2_TOKEN_DEFS.filter((d) => d.group === "bars" && !LOOK_IDS.includes(d.id));
  const appDefs = V2_TOKEN_DEFS.filter((d) => d.group === "app");

  const BAR_TOGGLES = [
    { id: "top", label: t("options.topBar") },
    { id: "actions", label: t("options.quickActionRow") },
    { id: "tabs", label: t("options.sectionTabs") },
    { id: "wave", label: t("options.waveHeader") },
    { id: "rail", label: t("options.sideRail") },
  ];

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className={peek ? "max-h-[40vh]" : "max-h-[85vh]"}>
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DrawerTitle className={peek ? "text-sm" : "text-base"}>{t("options.title")}</DrawerTitle>
              {!peek && <DrawerDescription className="text-xs">{t("options.subtitle")}</DrawerDescription>}
              {peek && <DrawerDescription className="text-xs">{t("options.peekHint")}</DrawerDescription>}
            </div>
            <button type="button" onClick={() => setPeek((v) => !v)}
              title={t("options.peekHint")}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border flex-shrink-0 ${
                peek ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {peek ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {peek ? t("options.fullPanel") : t("options.peek")}
            </button>
          </div>
        </DrawerHeader>

        <div className="px-4 space-y-2 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>

          {!peek && (
            <button type="button"
              onClick={() => { onClose(); requestHomeAction(navigate, location.pathname, "edit-home"); }}
              className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl border border-primary/50 text-primary text-sm font-medium">
              <Pencil className="w-4 h-4" /> {t("options.editHome")}
            </button>
          )}

          <Section2 id="showhide" title={t("options.showHide")}>
            {BAR_TOGGLES.map((b) => (
              <label key={b.id} className="flex items-center justify-between gap-3 py-1 text-xs font-medium cursor-pointer">
                <span>{b.label}</span>
                <input type="checkbox" checked={uiV2.bars[b.id]} onChange={(e) => onBar(b.id, e.target.checked)}
                  className="w-4 h-4 rounded accent-primary" aria-label={b.label} />
              </label>
            ))}
            {!uiV2.bars.top && <p className="text-[0.6875rem] text-muted-foreground">{t("options.recoveryHint")}</p>}
          </Section2>

          <Section2 id="look" title={t("options.sectionLook")}>
            {lookDefs.map(renderToken)}
          </Section2>

          <Section2 id="text" title={t("options.sectionText")}>
            <div className="flex items-center gap-3 py-1">
              <span className="text-xs font-medium flex-1 min-w-0 truncate">{t("options.textSize")}</span>
              <button type="button" aria-label={`${t("options.textSize")} −`}
                onClick={() => { const i = Math.max(0, fontIdx - 1); setFontIdx(i); setAccessibilityFontSize(FONT_STEPS[i]); }}
                className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none">−</button>
              <input type="range" min={0} max={FONT_STEPS.length - 1} step={1} value={fontIdx}
                onChange={(e) => { const i = parseInt(e.target.value, 10); setFontIdx(i); setAccessibilityFontSize(FONT_STEPS[i]); }}
                className="w-28 sm:w-40" aria-label={t("options.textSize")} />
              <button type="button" aria-label={`${t("options.textSize")} +`}
                onClick={() => { const i = Math.min(FONT_STEPS.length - 1, fontIdx + 1); setFontIdx(i); setAccessibilityFontSize(FONT_STEPS[i]); }}
                className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none">+</button>
              <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0">
                {FONT_STEPS[fontIdx] === "default" ? t("options.textNormal") : FONT_STEPS[fontIdx]}
              </span>
            </div>
            {appDefs.map(renderToken)}
          </Section2>

          <Section2 id="sizes" title={t("options.sectionSizes")}>
            {sizeDefs.map(renderToken)}
          </Section2>

          <Section2 id="apps" title={t("options.sectionApps")}>
            <div className="flex items-center gap-3 py-1">
              <span className="text-xs font-medium flex-1 min-w-0 truncate">{t("options.appsView")}</span>
              <div className="flex gap-1.5">
                {[["grid", t("options.appsViewGrid")], ["sidebar", t("options.appsViewSidebar")]].map(([v, label]) => (
                  <button key={v} type="button" onClick={() => onMisc?.({ appsView: v })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      (uiV2.appsView || "grid") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 py-1">
              <span className="text-xs font-medium flex-1 min-w-0 truncate">{t("options.appsIcon")}</span>
              <span className="w-8 h-8 flex items-center justify-center rounded-lg border border-border">
                {appsIconUrl
                  ? <img src={appsIconUrl} alt="" className="w-5 h-5 object-cover rounded" />
                  : <img src="/logo.png" alt="" className="w-5 h-5 object-contain rounded" />}
              </span>
              <AssetButton onPick={(url) => onMisc?.({ appsIcon: url || "" })} title={t("options.appsIconPick")} />
              {uiV2.appsIcon && (
                <button type="button" onClick={() => onMisc?.({ appsIcon: "" })}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground">
                  {t("options.appsIconReset")}
                </button>
              )}
            </div>
          </Section2>

          {localeCodes.length > 1 && (
            <Section2 id="language" title={t("options.language")}>
              <div className="flex flex-wrap gap-1.5 py-1">
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
            </Section2>
          )}

          {!peek && (
            <Section2 id="preview" title={t("options.preview")}>
              <LivePreview uiV2={uiV2} />
            </Section2>
          )}

          <Section2 id="everything" title={t("options.everythingElse")}>
            <p className="text-[0.6875rem] text-muted-foreground pb-1">{t("options.everythingElseHint")}</p>
            {openSection === "everything" && (
              <React.Suspense fallback={<p className="text-xs text-muted-foreground py-4">{t("common.loading")}</p>}>
                <AdvancedAppearance />
              </React.Suspense>
            )}
          </Section2>
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

// Search opens as its own sheet so the whole index is reachable from the
// top bar on every page — not just the dashboard.
function SearchSheet({ open, onClose }) {
  const t = useT();
  const terms = useTerms();
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
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
    setMisc: (patch) => write(patch),
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
  const appsIconUrl = useResolvedAvatarUrl(uiV2.appsIcon || "");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setToken, setBar, setMisc } = usePersistUiV2(settingsRow);

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
    <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} uiV2={uiV2} onToken={setToken} onBar={setBar} onMisc={setMisc} />
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
        {/* Apps — upper-left, where the classic sidebar trigger lives. The
            icon is the user's own if they've set one in Display options. */}
        <button type="button"
          onClick={() => (uiV2.appsView === "sidebar"
            ? setSidebarOpen(true)
            : requestHomeAction(navigate, location.pathname, "open-apps"))}
          aria-label={t("top.apps")} title={t("top.apps")}
          className="min-w-[34px] min-h-[34px] flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
          {appsIconUrl
            ? <img src={appsIconUrl} alt="" className="w-5 h-5 object-cover" style={{ borderRadius: "var(--v2-radius)" }} />
            : <img src="/logo.png" alt="" className="w-6 h-6 object-contain rounded-md" />}
        </button>
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
        <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("top.search")}
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
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
      {/* Classic sidebar, verbatim — the appsView="sidebar" mode is exactly
          the old UI's navigation, not an imitation of it. */}
      {sidebarOpen && <SidebarNav open onClose={() => setSidebarOpen(false)} />}
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
    return (
      <button type="button" onClick={() => navigate(item.path)} aria-current={on ? "page" : undefined}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left ${dim ? "text-xs" : "text-sm"} hover:bg-muted/40`}
        style={{
          borderRadius: "var(--v2-radius)",
          color: on ? "var(--v2-accent)" : "hsl(var(--muted-foreground))",
          boxShadow: on ? "inset 2px 0 0 var(--v2-accent)" : "none",
        }}>
        {Icon && <Icon style={{ width: dim ? 14 : 16, height: dim ? 14 : 16, flexShrink: 0 }} />}
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <nav
      aria-label={t("nav.appNav")}
      className={`hidden lg:flex flex-col fixed bottom-0 z-40 bg-background/95 backdrop-blur-xl overflow-y-auto overscroll-contain ${
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
          <p className="px-1 pb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("nav.quickActions")}
          </p>
          <div className={iconsOnly ? "flex flex-wrap gap-1" : "space-y-0.5"}>
            {keys.map((k) => {
              const Icon = KEY_ICONS[k.id] || Heart;
              const label = applyTerms(t(KEY_LABEL_KEYS[k.id] || "capture.checkIn"), terms);
              const onPress = () => (k.id === "quick_note" ? setNoteOpen(true) : navigate(k.target));
              return iconsOnly ? (
                <button key={k.id} type="button" onClick={onPress} title={label} aria-label={label}
                  className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                  style={{
                    width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
                    borderRadius: "var(--v2-radius)",
                    border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
                  }}>
                  <Icon style={{ width: "45%", height: "45%" }} />
                </button>
              ) : (
                <button key={k.id} type="button" onClick={onPress}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  style={{ borderRadius: "var(--v2-radius)" }}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{label}</span>
                </button>
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
          <p className="px-1 pb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
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
// just a different place to keep them.
export function V2QuickDock({ uiV2, settingsRow }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();
  const terms = useTerms();
  const [noteOpen, setNoteOpen] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(() => {
    try { return localStorage.getItem(DOCK_OPEN_KEY) === "1"; } catch { return false; }
  });
  // Hold-and-drag repositioning. While dragging, the dock follows the
  // pointer; on release it snaps to the nearer edge at that height, clamped
  // so it can never end up off screen, and the spot is saved.
  const [drag, setDrag] = useState(null); // { x, y }
  const dragState = useRef(null);
  const suppressTap = useRef(false);

  const mode = uiV2.tokens.actionsMode || "bar";
  const isBubble = mode === "bubble";
  const open = !isBubble || bubbleOpen;
  const side = uiV2.dockPos?.side || (uiV2.tokens.dockSide === "left" ? "left" : "right");
  const topPct = uiV2.dockPos?.topPct ?? 50;
  const horizontal = side === "top" || side === "bottom";
  // Measure the stack so the clamp uses its REAL size — a fixed guess let
  // the bottom of a tall dock slide behind the bottom bar.
  const dockRef = useRef(null);
  const [dockSize, setDockSize] = useState({ w: 56, h: 220 });
  useEffect(() => {
    const node = dockRef.current;
    if (!node) return undefined;
    const measure = () => {
      const r = node.getBoundingClientRect();
      if (r.width && r.height) setDockSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [open, mode]);
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

  const onHandleDown = (e) => {
    if (e.button === 1 || e.button === 2 || dragState.current) return;
    const node = e.currentTarget;
    const startX = e.clientX, startY = e.clientY;
    const st = { active: false, timer: null };
    const onMove = (ev) => {
      if (!st.active) {
        if (Math.abs(ev.clientX - startX) > 6 || Math.abs(ev.clientY - startY) > 6) cleanup();
        return;
      }
      setDrag({ x: ev.clientX, y: ev.clientY });
      ev.preventDefault();
    };
    const onTouchMove = (ev) => { if (st.active) ev.preventDefault(); };
    const onUp = (ev) => {
      const wasActive = st.active;
      cleanup();
      setDrag(null);
      if (!wasActive) return;
      suppressTap.current = true;
      const W = window.innerWidth, H = window.innerHeight;
      const dists = {
        left: ev.clientX, right: W - ev.clientX,
        top: ev.clientY, bottom: H - ev.clientY,
      };
      const nextSide = Object.keys(dists).reduce((a, b) => (dists[a] <= dists[b] ? a : b));
      const along = nextSide === "top" || nextSide === "bottom" ? ev.clientX / W : ev.clientY / H;
      const pct = Math.min(88, Math.max(6, along * 100));
      savePos({ side: nextSide, topPct: Math.round(pct * 10) / 10 });
    };
    const cleanup = () => {
      if (st.timer) clearTimeout(st.timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("touchmove", onTouchMove);
      dragState.current = null;
    };
    dragState.current = st;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    st.timer = setTimeout(() => {
      st.active = true;
      try { node.setPointerCapture?.(e.pointerId); } catch { /* unsupported */ }
      try { navigator.vibrate?.(10); } catch { /* no haptics */ }
      setDrag({ x: startX, y: startY });
    }, 300);
  };

  if (!uiV2.bars.actions || (mode !== "float" && mode !== "bubble")) return null;

  return (
    <div
      ref={dockRef}
      className={`fixed z-40 flex items-center ${horizontal ? "flex-row" : "flex-col"}`}
      style={drag ? {
        left: drag.x, top: drag.y,
        transform: "translate(-50%, -50%)",
        gap: "calc(var(--v2-space) * 0.75)",
        opacity: 0.9,
      } : horizontal ? {
        [side]: side === "top"
          ? "calc(var(--v2-status-h) + env(safe-area-inset-top, 0px) + 8px)"
          : "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 8px)",
        left: `clamp(${8 + dockSize.w / 2}px, ${topPct}%, calc(100% - ${8 + dockSize.w / 2}px))`,
        transform: "translateX(-50%)",
        gap: "calc(var(--v2-space) * 0.75)",
      } : {
        [side]: "calc(env(safe-area-inset-" + side + ", 0px) + 8px)",
        // Clamp with the dock's measured height so its far end can never
        // slide behind the top or bottom chrome.
        top: `clamp(calc(var(--v2-status-h) + env(safe-area-inset-top, 0px) + ${8 + dockSize.h / 2}px), ${topPct}%, calc(100% - var(--bottom-nav-height, 56px) - env(safe-area-inset-bottom, 0px) - ${8 + dockSize.h / 2}px))`,
        transform: "translateY(-50%)",
        gap: "calc(var(--v2-space) * 0.75)",
      }}
    >
      {open && keys.map((k) => {
        const Icon = KEY_ICONS[k.id] || Heart;
        const label = applyTerms(t(KEY_LABEL_KEYS[k.id] || "capture.checkIn"), terms);
        return (
          <button key={k.id} type="button"
            onClick={() => (k.id === "quick_note" ? setNoteOpen(true) : navigate(k.target))}
            aria-label={label} title={label}
            className="flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-transform bg-background/90 backdrop-blur"
            style={{
              width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
              borderRadius: "var(--v2-radius)",
              border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
              boxShadow: "0 2px 8px rgb(0 0 0 / 0.25)",
            }}>
            <Icon style={{ width: "45%", height: "45%" }} />
          </button>
        );
      })}
      {open && (
        <button type="button" onClick={() => navigate("/grounding")}
          aria-label={t("capture.support")} title={t("capture.support")}
          className="flex items-center justify-center active:scale-95 transition-transform bg-background/90 backdrop-blur"
          style={{
            width: "var(--v2-cmd-size)", height: "var(--v2-cmd-size)",
            borderRadius: "var(--v2-radius)",
            border: "var(--v2-border-w) solid var(--v2-accent)",
            color: "var(--v2-accent)",
            boxShadow: "0 2px 8px rgb(0 0 0 / 0.25)",
          }}>
          <LifeBuoy style={{ width: "45%", height: "45%" }} />
        </button>
      )}
      {!isBubble && (
        <span
          onPointerDown={onHandleDown}
          onContextMenu={(e) => e.preventDefault()}
          title={t("nav.dockDragHint")}
          className="w-6 h-3 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "pan-y" }}
        >
          <span className="w-4 h-[3px] rounded-full bg-border" aria-hidden="true" />
        </span>
      )}
      {isBubble && (
        <button type="button"
          onPointerDown={onHandleDown}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (suppressTap.current) { suppressTap.current = false; return; }
            setOpen(!bubbleOpen);
          }}
          aria-expanded={bubbleOpen}
          aria-label={bubbleOpen ? t("nav.hideQuickActions") : t("nav.showQuickActions")}
          className="flex items-center justify-center active:scale-95 transition-transform bg-background/95 backdrop-blur"
          style={{
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
      )}
      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </div>
  );
}

// ── Bottom chrome ──────────────────────────────────────────────────
export function V2BottomChrome({ uiV2, settingsRow }) {
  const navigate = useNavigate();
  const t = useT();
  const isActive = useIsActive();
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

  const { primary: items } = useNavItems(settingsRow);

  const keys = uiV2.commandKeys.map((id) => V2_COMMAND_KEYS.find((k) => k.id === id)).filter(Boolean);
  if (!uiV2.bars.actions && !uiV2.bars.tabs) return null;


  return (
    <nav
      // The rail takes over on wide screens; a bottom bar there is just a
      // phone habit stretched across a monitor.
      className={`fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t ${uiV2.bars.rail ? "lg:hidden" : ""}`}
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        borderColor: "color-mix(in srgb, var(--v2-accent) 30%, transparent)",
        borderTopWidth: "var(--v2-border-w)",
      }}
      aria-label={t("nav.appNav")}
    >
      {uiV2.bars.actions && (uiV2.tokens.actionsMode || "bar") === "bar" && (
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
            <span className="w-8 h-[3px] rounded-full bg-border" aria-hidden="true" />
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
