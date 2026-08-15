// The unified UI edit popup — built to docs/v2-edit-menu-spec.md (the
// user's wireframe). One anatomy for every UI edit menu; this file is the
// popup BODY, mounted first on the v2 Display Options sheet.
//
// Anatomy rules implemented here:
//  • Chevron-expandable sections (SubSection), in the wireframe's order.
//  • Every slider hides behind a VISIBLE "set" button on the edge opposite
//    the content alignment — a slider only exists after an explicit tap,
//    so a scroll can never adjust a setting.
//  • Color boxes open the shared picker with per-color opacity.
//  • Image slots offer upload or asset library; font pickers include the
//    user's custom fonts; audio background doubles as the page song.
//
// Storage: nothing new. ui_v2 tokens via useV2Display (the one write
// path), the eight color roles via ThemeContext's customColors, the page
// background on the home-board field (ui_v2_home / _desktop), presets via
// the theme preset store (which already applies on fronting via
// alterThemeLinks).

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { SlidersHorizontal, Plus, X, Star, Copy, Pencil, Link2 } from "lucide-react";
import { SubSection } from "@/components/settings/SettingsUI";
import ColorPicker from "@/components/shared/ColorPicker";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useV2Display } from "@/components/settings/V2DisplaySettings";
import { V2_TOKEN_DEFS, V2_COMMAND_KEYS } from "@/lib/uiV2";
import { WAVE_COLOR_KEYS, WAVE_COLOR_LABELS, readWaveColorKey } from "@/lib/waveColorKey";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { HOME_STYLES, getStyleLook } from "@/lib/homeStyles";
import { lookToStyle, lookCoverage, resolveUserStyles, USER_STYLE_PREFIX, themeToLook } from "@/lib/widgetLook";
import { boxStyle } from "@/v2/primitives";
import { Star as StarIcon } from "lucide-react";
import { useTheme } from "@/lib/ThemeContext";
import { useFontOptions } from "@/lib/useFontOptions";
import {
  getAccessibilitySettings, setAccessibilityFontSize,
  setAccessibilityFontFamily, setAccessibilityHeadingFont,
  setAccessibilityLargeTouch,
} from "@/lib/useAccessibility";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { resolveBackground } from "@/components/v2/PageBackground";
import { useT } from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";

const tokenById = Object.fromEntries(V2_TOKEN_DEFS.map((d) => [d.id, d]));

// ── #rrggbbaa helpers — opacity rides inside the stored color ─────────
export function splitHexAlpha(value) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{8}$/.test(v)) {
    return { hex: v.slice(0, 7), alpha: Math.round((parseInt(v.slice(7, 9), 16) / 255) * 100) };
  }
  return { hex: /^#[0-9a-fA-F]{6}$/.test(v) ? v : "", alpha: 100 };
}
export function joinHexAlpha(hex, alpha) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return hex || "";
  const a = Math.max(0, Math.min(100, Number(alpha)));
  if (a >= 100) return hex;
  return hex + Math.round((a / 100) * 255).toString(16).padStart(2, "0");
}

// ── The "set" row — name + visible set icon; slider only after a tap ──
function SetRow({ label, valueLabel, alignX = "center", children }) {
  const [open, setOpen] = useState(false);
  const btn = (
    <button type="button" aria-label={`${label} — set`} aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      className={`w-8 h-8 flex items-center justify-center rounded-lg border flex-shrink-0 ${
        open ? "border-primary/60 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
      }`}>
      <SlidersHorizontal className="w-3.5 h-3.5" />
    </button>
  );
  return (
    <div className="py-0.5">
      <div className="flex items-center gap-2.5">
        {alignX === "right" && btn}
        <span className={`text-xs font-medium flex-1 min-w-0 truncate ${alignX === "right" ? "text-right" : ""}`}>
          {label}
        </span>
        {valueLabel != null && (
          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{valueLabel}</span>
        )}
        {alignX !== "right" && btn}
      </div>
      {open && <div className="pt-1.5 pb-1">{children}</div>}
    </div>
  );
}

function TokenSlider({ def, value, onChange }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="range" min={def.min} max={def.max} step={def.step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1" aria-label={def.label} />
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{value}{def.unit || ""}</span>
    </div>
  );
}

function PillRow({ label, options, value, onChange, alignX, stacked = false }) {
  const pills = options.map((o) => (
    <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
      className={`text-xs px-2.5 py-1 rounded-full border ${
        value === o.v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
      }`}>{o.label}</button>
  ));
  // Stacked: label on its own line, pills wrapping below — for option
  // sets too wide to share a line without squashing the label to "P…".
  if (stacked) {
    return (
      <div className="py-1 space-y-1">
        <span className={`text-xs font-medium block ${alignX === "right" ? "text-right" : ""}`}>{label}</span>
        <div className={`flex gap-1.5 flex-wrap ${alignX === "right" ? "justify-end" : ""}`}>{pills}</div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2.5 py-1 ${alignX === "right" ? "flex-row-reverse" : ""}`}>
      <span className="text-xs font-medium flex-1 min-w-0 truncate">{label}</span>
      <div className="flex gap-1.5 flex-wrap justify-end">{pills}</div>
    </div>
  );
}

// Font-style toggles render as the styles themselves — a bold B, an
// italic i — instead of words. Full names stay in the aria-label/title.
const STYLE_GLYPHS = {
  bold: <span className="font-bold">B</span>,
  italic: <span className="italic">i</span>,
  underline: <span className="underline">U</span>,
  strike: <span className="line-through">S</span>,
  smallcaps: <span style={{ fontVariantCaps: "small-caps" }}>Aa</span>,
};

function StyleFlagsRow({ label, def, value = [], onChange, alignX }) {
  const toggle = (f) => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  return (
    <div className={`flex items-center gap-2.5 py-1 ${alignX === "right" ? "flex-row-reverse" : ""}`}>
      <span className="text-xs font-medium flex-1 min-w-0 truncate">{label}</span>
      <div className="flex gap-1">
        {def.options.map((o) => (
          <button key={o.v} type="button" aria-pressed={value.includes(o.v)}
            aria-label={o.label} title={o.label}
            onClick={() => toggle(o.v)}
            className={`w-8 h-8 rounded-lg border text-sm flex items-center justify-center ${
              value.includes(o.v) ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
            }`}>
            {STYLE_GLYPHS[o.v] || o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// UI-size steps (mirrors the a11y engine's discrete scale).
const SIZE_STEPS = ["xs3", "xs2", "xs", "sm", "default", "lg", "xl", "xl2", "xl3", "xl4", "xl5"];
const TOUCH_STEPS = ["default", "comfortable", "large"];

// ── SIZE section ───────────────────────────────────────────────────────
function SizeSection({ v2, alignX }) {
  const tr = useT();
  const fontOptions = useFontOptions({ includeInherit: false });
  const [a11y, setA11y] = useState(() => getAccessibilitySettings());
  const refresh = () => setA11y(getAccessibilitySettings());

  const tokenRow = (id) => {
    const def = tokenById[id];
    const value = v2.uiV2.tokens[id] ?? def.default;
    const shown = def.id === "contentW" && !value ? tr("options.valueFull") : `${value}${def.unit || ""}`;
    return (
      <SetRow key={id} label={def.label} valueLabel={shown} alignX={alignX}>
        <TokenSlider def={def} value={value} onChange={(val) => v2.setToken(id, val)} />
      </SetRow>
    );
  };

  const sizeIdx = Math.max(0, SIZE_STEPS.indexOf(a11y.fontSize || "default"));
  const touchIdx = Math.max(0, TOUCH_STEPS.indexOf(a11y.largeTouch || "default"));

  return (
    <SubSection title={tr("editSheet.size")} defaultOpen>
      <div className="space-y-1">
        {tokenRow("contentW")}
        {/* Touch target spacing — the engine today is one all-sides scale;
            per-side values arrive with the engine work (spec notes this). */}
        <SetRow label={tr("editSheet.touchSpacing")} valueLabel={TOUCH_STEPS[touchIdx]} alignX={alignX}>
          <input type="range" min={0} max={TOUCH_STEPS.length - 1} step={1} value={touchIdx}
            onChange={(e) => { setAccessibilityLargeTouch(TOUCH_STEPS[parseInt(e.target.value, 10)]); refresh(); }}
            className="w-full" aria-label={tr("editSheet.touchSpacing")} />
        </SetRow>
        {tokenRow("borderW")}
        {tokenRow("radius")}
        <PillRow label={tokenById.alignX.label} options={tokenById.alignX.options}
          value={v2.uiV2.tokens.alignX ?? "center"} onChange={(val) => v2.setToken("alignX", val)} alignX={alignX} />
        <div className="pt-1 space-y-2">
          <p className="text-xs font-medium">{tr("editSheet.fontBody")}</p>
          <SearchableSelect
            value={a11y.fontFamily || "inter"}
            onChange={(id) => { setAccessibilityFontFamily(id); refresh(); }}
            options={fontOptions}
            placeholder={tr("editSheet.fontBody")}
          />
          <p className="text-xs font-medium">{tr("editSheet.fontHeader")}</p>
          <SearchableSelect
            value={a11y.headingFont || "default"}
            onChange={(id) => { setAccessibilityHeadingFont(id); refresh(); }}
            options={[{ id: "default", label: tr("editSheet.fontSameAsBody") }, ...fontOptions]}
            placeholder={tr("editSheet.fontHeader")}
          />
        </div>
        <SetRow label={tr("editSheet.fontSizeBody")} valueLabel={SIZE_STEPS[sizeIdx]} alignX={alignX}>
          <input type="range" min={0} max={SIZE_STEPS.length - 1} step={1} value={sizeIdx}
            onChange={(e) => { setAccessibilityFontSize(SIZE_STEPS[parseInt(e.target.value, 10)]); refresh(); }}
            className="w-full" aria-label={tr("editSheet.fontSizeBody")} />
        </SetRow>
        {tokenRow("headerScale")}
        <StyleFlagsRow label={tr("editSheet.styleBody")} def={tokenById.bodyStyle}
          value={v2.uiV2.tokens.bodyStyle ?? []} onChange={(val) => v2.setToken("bodyStyle", val)} alignX={alignX} />
        <StyleFlagsRow label={tr("editSheet.styleHeader")} def={tokenById.headerStyle}
          value={v2.uiV2.tokens.headerStyle ?? []} onChange={(val) => v2.setToken("headerStyle", val)} alignX={alignX} />
      </div>
    </SubSection>
  );
}

// ── BAR SIZES + LAYOUT (spec §2 — page-level surfaces only) ───────────
// Each bar: show/hide, its real size/placement knobs, and its content
// arrangement where the engine has one (bottom-bar section order, quick
// action keys). Wave color rides SystemSettings like the classic picker.
function BarToggle({ label, on, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-xs font-medium cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-primary" aria-label={label} />
    </label>
  );
}

function BarsSection({ v2, alignX }) {
  const tr = useT();
  const terms = useTerms();
  const qc = useQueryClient();
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsRows[0] || null;

  const writeSettings = async (patch) => {
    if (!settingsRow?.id) return;
    await base44.entities.SystemSettings.update(settingsRow.id, patch);
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };

  const tokenRow = (id, labelKey) => {
    const def = tokenById[id];
    const value = v2.uiV2.tokens[id] ?? def.default;
    return (
      <SetRow label={tr(labelKey)} valueLabel={`${value}${def.unit || ""}`} alignX={alignX}>
        <TokenSlider def={def} value={value} onChange={(val) => v2.setToken(id, val)} />
      </SetRow>
    );
  };

  // Bottom bar arrangement — the REAL list the bar renders is
  // navigation_config.bottomBar (the same one Settings → Navigation
  // edits), resolved against ALL_PAGES with the user's terms.
  const navConfig = settingsRow?.navigation_config || {};
  const bottomIds = Array.isArray(navConfig.bottomBar) ? navConfig.bottomBar : DEFAULT_CONFIG.bottomBar;
  const termMap = {
    alters: terms.Alters,
    checkin: `${terms.System} Meeting`,
    "system-map": `${terms.System} Map`,
    "system-history": `${terms.System} History`,
  };
  const pageLabel = (id) => {
    const p = ALL_PAGES.find((x) => x.id === id);
    return p ? (termMap[p.id] || p.label) : id;
  };
  const writeBottomBar = (next) => writeSettings({ navigation_config: { ...navConfig, bottomBar: next } });
  const moveNavItem = (idx, dir) => {
    const next = [...bottomIds];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    writeBottomBar(next);
  };
  const addNavOptions = ALL_PAGES
    .filter((p) => !bottomIds.includes(p.id))
    .map((p) => ({ id: p.id, label: termMap[p.id] || p.label }));

  // Wave color: a palette key ("Off" = background), or a custom hex.
  const waveKey = readWaveColorKey(settingsRow);
  const waveCustom = settingsRow?.wave_color_custom || "";

  // The alter bar lives on the home board's own field, per device.
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const altersBar = settingsRow?.[homeField]?.altersBar || {};
  const writeAltersBar = (patch) => writeSettings({
    [homeField]: { ...(settingsRow?.[homeField] || {}), altersBar: { ...altersBar, ...patch } },
  });

  return (
    <SubSection title={tr("editSheet.bars")}>
      {/* Top bar */}
      <div className="space-y-1 pb-2 border-b border-border/30">
        <BarToggle label={tr("editSheet.barTop")} on={v2.uiV2.bars.top} onChange={(on) => v2.setBar("top", on)} />
        {!v2.uiV2.bars.top && <p className="text-[0.6875rem] text-muted-foreground">{tr("options.recoveryHint")}</p>}
        {tokenRow("statusH", "editSheet.barHeight")}
        <BarToggle label={tr("editSheet.wave")} on={v2.uiV2.bars.wave} onChange={(on) => v2.setBar("wave", on)} />
        {v2.uiV2.bars.wave && (
          <div className="flex items-center gap-2.5 py-1">
            <span className="text-xs font-medium flex-1 min-w-0 truncate">{tr("editSheet.waveColor")}</span>
            <div className="flex gap-1 flex-wrap justify-end items-center">
              {WAVE_COLOR_KEYS.map((k) => (
                <button key={k} type="button" aria-pressed={!waveCustom && waveKey === k}
                  onClick={() => writeSettings({ wave_color_key: k, wave_color_custom: null })}
                  className={`text-[0.6875em] px-2 py-0.5 rounded-full border ${
                    !waveCustom && waveKey === k ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                  }`}>{WAVE_COLOR_LABELS[k]}</button>
              ))}
              <ColorPicker compact label={tr("editSheet.waveColor")}
                value={waveCustom || "#7dd3fc"}
                onChange={(hex) => writeSettings({ wave_color_custom: hex })}
                onClear={() => writeSettings({ wave_color_custom: null })} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="space-y-1 py-2 border-b border-border/30">
        <BarToggle label={tr("editSheet.barBottom")} on={v2.uiV2.bars.tabs} onChange={(on) => v2.setBar("tabs", on)} />
        {tokenRow("stripH", "editSheet.barHeight")}
        <p className="text-xs text-muted-foreground pt-1">{tr("editSheet.arrangement")}</p>
        {bottomIds.map((id, idx) => (
          <div key={id} className="flex items-center gap-2 py-0.5">
            <span className="text-xs flex-1 min-w-0 truncate">{pageLabel(id)}</span>
            <button type="button" onClick={() => moveNavItem(idx, -1)} disabled={idx === 0}
              aria-label={`${pageLabel(id)} ↑`}
              className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground disabled:opacity-30">↑</button>
            <button type="button" onClick={() => moveNavItem(idx, 1)} disabled={idx === bottomIds.length - 1}
              aria-label={`${pageLabel(id)} ↓`}
              className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground disabled:opacity-30">↓</button>
            <button type="button" onClick={() => writeBottomBar(bottomIds.filter((x) => x !== id))}
              disabled={bottomIds.length <= 1}
              aria-label={tr("editSheet.removeTab", { name: pageLabel(id) })}
              className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground hover:text-destructive disabled:opacity-30">
              <X className="w-3 h-3 mx-auto" />
            </button>
          </div>
        ))}
        {bottomIds.length < 6 && (
          <SearchableSelect
            value=""
            onChange={(id) => { if (id) writeBottomBar([...bottomIds, id]); }}
            options={addNavOptions}
            placeholder={tr("editSheet.addTab")}
            searchPlaceholder={tr("editSheet.addTab")}
          />
        )}
      </div>

      {/* Side bar (desktop rail) */}
      <div className="space-y-1 py-2 border-b border-border/30">
        <BarToggle label={tr("editSheet.barSide")} on={v2.uiV2.bars.rail} onChange={(on) => v2.setBar("rail", on)} />
        {tokenRow("railW", "editSheet.barWidth")}
        <PillRow label={tr("editSheet.alignEdge")} value={v2.uiV2.tokens.railSide ?? "left"}
          onChange={(val) => v2.setToken("railSide", val)} alignX={alignX}
          options={[{ v: "left", label: tr("editSheet.left") }, { v: "right", label: tr("editSheet.right") }]} />
        <PillRow label={tr("editSheet.railContent")} value={v2.uiV2.tokens.railActions ?? "labels"}
          onChange={(val) => v2.setToken("railActions", val)} alignX={alignX}
          options={[{ v: "labels", label: tr("editSheet.labels") }, { v: "icons", label: tr("editSheet.icons") }]} />
        <p className="text-[0.6875rem] text-muted-foreground">{tr("editSheet.railHint")}</p>
      </div>

      {/* Quick action bar */}
      <div className="space-y-1 py-2 border-b border-border/30">
        <BarToggle label={tr("editSheet.barActions")} on={v2.uiV2.bars.actions} onChange={(on) => v2.setBar("actions", on)} />
        {tokenRow("cmdSize", "editSheet.buttonSize")}
        <PillRow label={tr("editSheet.placement")} value={v2.uiV2.tokens.actionsMode ?? "bar"}
          onChange={(val) => v2.setToken("actionsMode", val)} alignX={alignX}
          options={[
            { v: "bar", label: tr("editSheet.placementBar") },
            { v: "float", label: tr("editSheet.placementFloat") },
            { v: "bubble", label: tr("editSheet.placementBubble") },
          ]} />
        {(v2.uiV2.tokens.actionsMode === "float" || v2.uiV2.tokens.actionsMode === "bubble") && (
          <PillRow label={tr("editSheet.alignEdge")} value={v2.uiV2.tokens.dockSide ?? "right"}
            onChange={(val) => v2.setToken("dockSide", val)} alignX={alignX}
            options={[{ v: "left", label: tr("editSheet.left") }, { v: "right", label: tr("editSheet.right") }]} />
        )}
        <p className="text-xs text-muted-foreground pt-1">{tr("editSheet.actionKeys")}</p>
        {V2_COMMAND_KEYS.map((k) => {
          const on = v2.uiV2.commandKeys.includes(k.id);
          const idx = v2.uiV2.commandKeys.indexOf(k.id);
          const move = (dir) => {
            const next = [...v2.uiV2.commandKeys];
            const to = idx + dir;
            if (to < 0 || to >= next.length) return;
            [next[idx], next[to]] = [next[to], next[idx]];
            v2.setCommandKeys(next);
          };
          return (
            <div key={k.id} className="flex items-center gap-2 py-0.5">
              <label className="flex items-center gap-2 flex-1 min-w-0 text-xs cursor-pointer">
                <input type="checkbox" checked={on}
                  onChange={(e) => v2.setCommandKeys(e.target.checked
                    ? [...v2.uiV2.commandKeys, k.id]
                    : v2.uiV2.commandKeys.filter((x) => x !== k.id))}
                  className="w-3.5 h-3.5 rounded accent-primary" aria-label={applyTerms(k.label, terms)} />
                <span className="truncate">{applyTerms(k.label, terms)}</span>
              </label>
              {on && (
                <span className="flex gap-1 flex-shrink-0">
                  <button type="button" onClick={() => move(-1)} disabled={idx <= 0}
                    aria-label={`${applyTerms(k.label, terms)} ↑`}
                    className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(1)} disabled={idx < 0 || idx >= v2.uiV2.commandKeys.length - 1}
                    aria-label={`${applyTerms(k.label, terms)} ↓`}
                    className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground disabled:opacity-30">↓</button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Alter bar — the pinned-members strip on the home board. */}
      <div className="space-y-1 pt-2">
        <BarToggle label={applyTerms(tr("editSheet.barAlters"), terms)}
          on={altersBar.enabled === true} onChange={(on) => writeAltersBar({ enabled: on })} />
        {altersBar.enabled === true && (
          <PillRow label={tr("editSheet.placement")} value={altersBar.position === "top" ? "top" : "bottom"}
            onChange={(val) => writeAltersBar({ position: val })} alignX={alignX}
            options={[{ v: "top", label: tr("editSheet.top") }, { v: "bottom", label: tr("editSheet.bottom") }]} />
        )}
        <p className="text-[0.6875rem] text-muted-foreground">{applyTerms(tr("editSheet.alterBarHint"), terms)}</p>
      </div>
    </SubSection>
  );
}

// ── COLORS section — the eight roles from the wireframe ───────────────
const COLOR_ROLES = [
  ["bg", "editSheet.colorBackground"], ["surface", "editSheet.colorSurface"],
  ["primary", "editSheet.colorPrimary"], ["secondary", "editSheet.colorSecondary"],
  ["accent", "editSheet.colorAccent"], ["muted", "editSheet.colorMuted"],
  ["text-primary", "editSheet.colorTextBody"], ["text-secondary", "editSheet.colorTextHeader"],
];

function ColorsSection({ children }) {
  const tr = useT();
  const {
    themeMode, selectedTheme, customColors, updateCustomColorsFull,
    allPresets, userCustomPresets,
  } = useTheme();
  const isDark = themeMode === "dark" ||
    (themeMode === "system" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  const readCss = (k) => {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(`--color-${k}`).trim() || "#888888";
    } catch { return "#888888"; }
  };

  // The swatches must show what the UI is ACTUALLY using right now, so
  // re-read the live CSS whenever the theme inputs change (same pattern
  // as the classic editor) instead of trusting a stale first read.
  const [, setLiveTick] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLiveTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [customColors, selectedTheme, themeMode, isDark]);

  // Seed a full two-mode draft the first time any swatch changes, exactly
  // like the classic editor — so editing one role never clears the others.
  const seedDraft = () => {
    const presetColors = allPresets[selectedTheme] || userCustomPresets[selectedTheme];
    const light = { ...(customColors?.light || presetColors?.light || {}) };
    const dark = { ...(customColors?.dark || presetColors?.dark || {}) };
    for (const [k] of COLOR_ROLES) {
      if (!light[k]) light[k] = isDark ? "#888888" : readCss(k);
      if (!dark[k]) dark[k] = isDark ? readCss(k) : "#888888";
    }
    return { light, dark };
  };

  const current = (k) => {
    const src = customColors || allPresets[selectedTheme] || userCustomPresets[selectedTheme];
    const mode = src ? (isDark ? src.dark : src.light) : null;
    return (mode && mode[k]) || readCss(k);
  };

  const write = (k, nextValue) => {
    const draft = customColors ? { light: { ...customColors.light }, dark: { ...customColors.dark } } : seedDraft();
    draft[isDark ? "dark" : "light"][k] = nextValue;
    updateCustomColorsFull(draft.light, draft.dark);
  };

  return (
    <SubSection title={tr("editSheet.colors")}>
      <div className="grid grid-cols-4 gap-2">
        {COLOR_ROLES.map(([key, labelKey]) => {
          const { hex, alpha } = splitHexAlpha(current(key));
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <ColorPicker compact
                label={tr(labelKey)}
                value={hex || "#888888"}
                onChange={(h) => write(key, joinHexAlpha(h, alpha))}
                opacity={{ value: alpha, onChange: (a) => write(key, joinHexAlpha(hex || readCss(key), a)) }}
              />
              <span className="text-[0.625rem] text-muted-foreground text-center leading-tight">{tr(labelKey)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">{tr("editSheet.colorsHint")}</p>
      {children}
    </SubSection>
  );
}

// ── BACKGROUND section ─────────────────────────────────────────────────

function ImageSlot({ url, onPick, onClear, title }) {
  const resolved = useResolvedAvatarUrl(url || "");
  return (
    <span className="flex items-center gap-1.5">
      {/* Preview only when an image exists — an always-there empty square
          read as a broken color picker. */}
      {resolved && (
        <span className="w-8 h-8 rounded-lg border border-border overflow-hidden flex items-center justify-center bg-muted/30">
          <img src={resolved} alt="" className="w-full h-full object-cover" />
        </span>
      )}
      <AssetButton onPick={onPick} title={title} />
      {url && (
        <button type="button" onClick={onClear} aria-label={`${title} — clear`}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-destructive">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

// Rendered INSIDE the "Colors & background" section (the user's call —
// one section for everything painted, not two).
function BackgroundBlock({ background, onChange, wallpaper }) {
  const tr = useT();
  const bg = background;
  const patch = (p) => onChange({ ...bg, ...p });
  const patchGrad = (p) => patch({ gradient: { ...bg.gradient, ...p } });

  const POSITIONS = ["cover", "fill", "tile", "stretch", "center"];

  // Wallpaper folders — a folder instead of one image rotates on each
  // app open (the legacy wallpaper's headline feature, kept here now
  // that the pill row is gone).
  const { data: allAssets = [] } = useQuery({
    queryKey: ["imageAssets"], queryFn: () => base44.entities.ImageAsset.list(),
  });
  const assetFolders = useMemo(
    () => [...new Set(allAssets.map((a) => a.folder).filter(Boolean))].sort(),
    [allAssets]
  );
  const wall = wallpaper || {};

  // NO type selector — the type is inferred from what's in the boxes
  // (the user's design): one box with a color = flat; one box with an
  // image = full-page image (the wallpaper); press the + box and it
  // becomes a gradient, each box holding a color OR an image.
  const layers = bg.type === "gradient"
    ? bg.gradient.stops.map((s) => ({ color: s.color || "", image: s.image || "" }))
    : bg.type === "flat"
      ? [{ color: bg.flat.color || "", image: bg.flat.image || "" }]
      : bg.type === "image"
        ? [{ color: "", image: bg.image.url || "" }]
        // Legacy wallpaper appears as the single box's image, so nothing
        // a user set before this UI existed goes invisible.
        : [{ color: "", image: wall.url || "" }];

  // Where single-image settings (position / rotation folder) live —
  // carried over from the legacy wallpaper the first time it's touched.
  const imageCfg = bg.type === "image"
    ? bg.image
    : { url: wall.url || "", position: "cover", folder: wall.folder || "", mode: wall.mode || "random" };

  const readCssBg = () => {
    try { return getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim() || "#222233"; }
    catch { return "#222233"; }
  };

  const writeLayers = (next) => {
    const clean = next.map((l) => ({ color: l.color || "", image: l.image || "" }));
    if (clean.length >= 2) {
      patch({ type: "gradient", gradient: { ...bg.gradient, stops: clean } });
      return;
    }
    const L = clean[0] || { color: "", image: "" };
    if (L.image) patch({ type: "image", image: { ...imageCfg, url: L.image } });
    else if (L.color) patch({ type: "flat", flat: { color: L.color, image: "" } });
    else patch({ type: "none" });
  };
  const setLayer = (i, l) => writeLayers(layers.map((s, j) => (j === i ? l : s)));

  const isGradient = layers.length >= 2;
  const singleImage = !isGradient && !!layers[0].image;

  return (
    <div className="pt-2 mt-1 border-t border-border/30 space-y-1">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {tr("editSheet.background")}
      </p>
      <div className="space-y-1.5 py-1">
        {layers.map((s, i) => {
          const { hex, alpha } = splitHexAlpha(s.color);
          return (
            <div key={i} className="flex items-center gap-2">
              {isGradient && (
                <span className="text-xs text-muted-foreground w-4 flex-shrink-0 tabular-nums">{i + 1}</span>
              )}
              <ColorPicker compact label={tr("editSheet.background")}
                value={hex || readCssBg()}
                onChange={(h) => setLayer(i, { color: joinHexAlpha(h, alpha), image: "" })}
                opacity={{
                  value: alpha,
                  onChange: (a) => setLayer(i, { color: joinHexAlpha(hex || readCssBg(), a), image: "" }),
                }} />
              <ImageSlot url={s.image} title={tr("editSheet.bgImage")}
                onPick={(url) => setLayer(i, { color: "", image: url })}
                onClear={() => setLayer(i, { ...s, image: "" })} />
              {isGradient && (
                <button type="button" aria-label={tr("editSheet.gradRemoveStop")}
                  onClick={() => writeLayers(layers.filter((_, j) => j !== i))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {/* The + box: press to grow into a gradient (their spec —
                  "a box with a plus sign in it"). */}
              {i === layers.length - 1 && (
                <button type="button" aria-label={tr("editSheet.gradAddStop")} title={tr("editSheet.gradAddStop")}
                  onClick={() => writeLayers([...layers, { color: "#888888", image: "" }])}
                  className="w-8 h-8 rounded-lg border border-dashed border-border/70 text-muted-foreground hover:text-foreground flex items-center justify-center ml-auto">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isGradient && (
        <div className="space-y-1 py-1">
          <PillRow label={tr("editSheet.gradShape")} value={bg.gradient.shape}
            onChange={(v) => patchGrad({ shape: v })}
            options={[{ v: "linear", label: tr("editSheet.gradLinear") }, { v: "radial", label: tr("editSheet.gradRadial") }]} />
          {bg.gradient.shape === "linear" && (
            <SetRow label={tr("editSheet.gradAngle")} valueLabel={`${bg.gradient.angle}°`}>
              <input type="range" min={0} max={360} step={15} value={bg.gradient.angle}
                onChange={(e) => patchGrad({ angle: parseInt(e.target.value, 10) })}
                className="w-full" aria-label={tr("editSheet.gradAngle")} />
            </SetRow>
          )}
          <SetRow label={tr("editSheet.gradStrength")} valueLabel={`${bg.gradient.strength}%`}>
            <input type="range" min={0} max={100} step={5} value={bg.gradient.strength}
              onChange={(e) => patchGrad({ strength: parseInt(e.target.value, 10) })}
              className="w-full" aria-label={tr("editSheet.gradStrength")} />
          </SetRow>
        </div>
      )}

      {singleImage && (
        <div className="space-y-1 py-1">
          <PillRow stacked label={tr("editSheet.bgPosition")} value={imageCfg.position || "cover"}
            onChange={(v) => patch({ type: "image", image: { ...imageCfg, position: v } })}
            options={POSITIONS.map((p) => ({ v: p, label: tr(`editSheet.pos.${p}`) }))} />
          {assetFolders.length > 0 && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium flex-1">{tr("editSheet.wallFolder")}</span>
              <div className="min-w-[9rem]">
                <SearchableSelect
                  value={imageCfg.folder || null}
                  onChange={(folder) => patch({ type: "image", image: { ...imageCfg, folder: folder || "" } })}
                  options={assetFolders.map((f) => ({ id: f, label: f }))}
                  placeholder={tr("editSheet.wallFolderNone")}
                  searchPlaceholder={tr("editSheet.wallFolderNone")}
                  allowClear
                />
              </div>
            </div>
          )}
          {imageCfg.folder && (
            <PillRow label={tr("editSheet.wallMode")} value={imageCfg.mode === "sequential" ? "sequential" : "random"}
              onChange={(v) => patch({ type: "image", image: { ...imageCfg, mode: v } })}
              options={[
                { v: "random", label: tr("editSheet.wallShuffle") },
                { v: "sequential", label: tr("editSheet.wallInOrder") },
              ]} />
          )}
        </div>
      )}

      {/* Audio background = the page song (same controls as profile music). */}
      <div className="pt-2 border-t border-border/30">
        <p className="text-xs font-medium mb-1.5">{tr("editSheet.pageSong")}</p>
        <ProfileSongPicker value={bg.audio} onChange={(song) => patch({ audio: song })} subjectLabel="page" />
      </div>
    </div>
  );
}

// ── PRESETS section ────────────────────────────────────────────────────
// Rides the theme-preset store — the store that already applies a linked
// preset when an alter starts fronting.
const SIZE_TOKEN_IDS = ["contentW", "radius", "borderW", "density", "stripH", "cmdSize", "railW", "statusH", "alignX", "alignY", "headerScale", "bodyStyle", "headerStyle"];

function PresetsSection({ v2 }) {
  const tr = useT();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const {
    themeMode, selectedTheme, customColors, allPresets,
    userCustomPresets, saveCustomPreset, deleteUserPreset,
    alterThemeLinks, linkAlterTheme, unlinkAlterTheme,
    clearCustomColors, setSelectedTheme, setThemeMode,
  } = useTheme();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsRows[0] || null;

  const [name, setName] = useState("");
  const [saveColor, setSaveColor] = useState(true);
  const [saveSize, setSaveSize] = useState(false);
  const [linkAlterId, setLinkAlterId] = useState("");
  const [renaming, setRenaming] = useState(null); // { from, to }

  const isDark = themeMode === "dark" ||
    (themeMode === "system" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  const snapshotColors = () => {
    const src = customColors || allPresets[selectedTheme] || userCustomPresets[selectedTheme] || {};
    const readAll = () => {
      const out = {};
      for (const [k] of COLOR_ROLES) {
        try { out[k] = getComputedStyle(document.documentElement).getPropertyValue(`--color-${k}`).trim() || "#888888"; }
        catch { out[k] = "#888888"; }
      }
      return out;
    };
    const live = readAll();
    return {
      light: { ...(src.light || (isDark ? {} : live)) },
      dark: { ...(src.dark || (isDark ? live : {})) },
    };
  };

  const doSave = (label) => {
    const trimmed = (label || "").trim();
    if (!trimmed || (!saveColor && !saveSize)) return;
    const payload = {};
    if (saveColor) {
      const snap = snapshotColors();
      payload.light = snap.light;
      payload.dark = snap.dark;
      payload.themeMode = themeMode;
    }
    if (saveSize) {
      payload.fontSize = getAccessibilitySettings().fontSize || "default";
      payload.uiV2Tokens = Object.fromEntries(
        SIZE_TOKEN_IDS.filter((id) => v2.uiV2.tokens[id] !== undefined).map((id) => [id, v2.uiV2.tokens[id]])
      );
    }
    saveCustomPreset(trimmed, payload);
    if (linkAlterId) linkAlterTheme(linkAlterId, trimmed);
    setName(""); setLinkAlterId("");
  };

  const applyPreset = async (presetName) => {
    const preset = allPresets[presetName] || userCustomPresets[presetName];
    if (!preset) return;
    if (preset.light || preset.dark) {
      clearCustomColors();
      setSelectedTheme(presetName);
    }
    if (preset.themeMode) setThemeMode(preset.themeMode);
    if (preset.fontSize) setAccessibilityFontSize(preset.fontSize);
    if (preset.font) setAccessibilityFontFamily(preset.font);
    if (preset.headingFont) setAccessibilityHeadingFont(preset.headingFont);
    if (preset.uiV2Tokens && settingsRow?.id) {
      await base44.entities.SystemSettings.update(settingsRow.id, {
        ui_v2: { ...(settingsRow.ui_v2 || {}), tokens: { ...(settingsRow.ui_v2?.tokens || {}), ...preset.uiV2Tokens } },
      });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    }
  };

  const renamePreset = (from, to) => {
    const trimmed = (to || "").trim();
    if (!trimmed || trimmed === from || !userCustomPresets[from]) return;
    saveCustomPreset(trimmed, userCustomPresets[from]);
    // Carry alter links over to the new name before dropping the old one.
    for (const [alterId, linked] of Object.entries(alterThemeLinks || {})) {
      if (linked === from) linkAlterTheme(alterId, trimmed);
    }
    deleteUserPreset(from);
    setRenaming(null);
  };

  const duplicatePreset = (from) => {
    if (!userCustomPresets[from]) return;
    let copy = `${from} 2`;
    let n = 2;
    while (userCustomPresets[copy]) copy = `${from} ${++n}`;
    saveCustomPreset(copy, JSON.parse(JSON.stringify(userCustomPresets[from])));
  };

  const coverageOf = (preset) => {
    const covers = [];
    if (preset.light || preset.dark) covers.push(tr("editSheet.partColor"));
    if (preset.fontSize || preset.uiV2Tokens) covers.push(tr("editSheet.partSize"));
    return covers;
  };

  const alterOptions = useMemo(
    () => alters.filter((a) => !a.is_archived).map((a) => ({ id: a.id, label: formatAlter(a), color: a.color })),
    [alters, formatAlter]
  );

  const linkedAlterNames = (presetName) => Object.entries(alterThemeLinks || {})
    .filter(([, linked]) => linked === presetName)
    .map(([alterId]) => alterOptions.find((o) => o.id === alterId)?.label)
    .filter(Boolean);

  return (
    <SubSection title={tr("editSheet.presets")}>
      {/* Save new — size and/or color, optionally linked to a member. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={tr("editSheet.presetName")}
            className="flex-1 h-9 px-2 rounded-lg border border-input bg-background text-sm" />
          <button type="button" disabled={!name.trim() || (!saveColor && !saveSize)}
            onClick={() => doSave(name)}
            className="text-xs px-3 h-9 rounded-lg border border-primary/60 text-primary disabled:opacity-40">
            {tr("editSheet.presetSave")}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={saveColor} onChange={(e) => setSaveColor(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary" /> {tr("editSheet.partColor")}
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={saveSize} onChange={(e) => setSaveSize(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-primary" /> {tr("editSheet.partSize")}
          </label>
          <div className="flex-1 min-w-[120px]">
            <SearchableSelect value={linkAlterId} onChange={(id) => setLinkAlterId(id || "")}
              options={alterOptions} allowClear
              placeholder={tr("editSheet.linkAlter", { alter: terms.alter })} />
          </div>
        </div>
      </div>

      {/* Custom presets — apply / rename / duplicate / link / delete. */}
      {Object.keys(userCustomPresets).length > 0 && (
        <div className="space-y-1 pt-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {tr("editSheet.presetsYours")}
          </p>
          {Object.entries(userCustomPresets).map(([pname, preset]) => {
            const covers = coverageOf(preset);
            const partial = covers.length === 1;
            const linked = linkedAlterNames(pname);
            return (
              <div key={pname} className="flex items-center gap-1.5 py-1 border-b border-border/20 last:border-0">
                {renaming?.from === pname ? (
                  <input autoFocus value={renaming.to} onChange={(e) => setRenaming({ from: pname, to: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") renamePreset(pname, renaming.to); if (e.key === "Escape") setRenaming(null); }}
                    onBlur={() => renamePreset(pname, renaming.to)}
                    className="flex-1 h-8 px-2 rounded-lg border border-input bg-background text-sm" />
                ) : (
                  <button type="button" onClick={() => applyPreset(pname)}
                    className="flex-1 min-w-0 text-left text-sm truncate hover:text-primary" title={tr("editSheet.presetApply")}>
                    {pname}
                    {partial && <Star className="w-3 h-3 inline ml-1 text-amber-500" title={covers.join(" · ")} />}
                    {linked.length > 0 && (
                      <span className="text-[0.625rem] text-muted-foreground ml-1.5">
                        <Link2 className="w-3 h-3 inline mr-0.5" />{linked.join(", ")}
                      </span>
                    )}
                  </button>
                )}
                <button type="button" aria-label={tr("editSheet.presetRename")}
                  onClick={() => setRenaming({ from: pname, to: pname })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">
                  <Pencil className="w-3 h-3" />
                </button>
                <button type="button" aria-label={tr("editSheet.presetDuplicate")}
                  onClick={() => duplicatePreset(pname)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground">
                  <Copy className="w-3 h-3" />
                </button>
                <button type="button" aria-label={tr("editSheet.presetDelete")}
                  onClick={() => {
                    for (const [alterId, l] of Object.entries(alterThemeLinks || {})) {
                      if (l === pname) unlinkAlterTheme(alterId);
                    }
                    deleteUserPreset(pname);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Built-in presets. */}
      <div className="space-y-1 pt-2">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {tr("editSheet.presetsBuiltIn")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(allPresets).map((pname) => (
            <button key={pname} type="button" onClick={() => applyPreset(pname)}
              className={`text-xs px-2.5 py-1 rounded-full border capitalize ${
                selectedTheme === pname && !customColors
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/50 text-muted-foreground"
              }`}>{pname}</button>
          ))}
        </div>
      </div>

      {/* Board styles — the old home screen "Style" picker, now a preset
          list like everything else (the user's call). Built-ins plus the
          user's saved widget styles; sets the default widget look for
          this device's board, and any widget can still override it. The
          swatch renders through the same pipeline a real widget uses,
          and a partial style's star spells out what it touches. */}
      <BoardStylesBlock settingsRow={settingsRow} />
    </SubSection>
  );
}

function BoardStylesBlock({ settingsRow }) {
  const tr = useT();
  const qc = useQueryClient();
  const { themeMode, allPresets, userCustomPresets } = useTheme();
  const [notesFor, setNotesFor] = useState(null);
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const current = settingsRow?.[homeField]?.styleMode || "current";
  const userWidgetStyles = resolveUserStyles(settingsRow?.ui_v2_styles);
  const isDark = themeMode === "dark" ||
    (themeMode === "system" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  // Theme presets, synced into widget looks (the user's ask): each colour
  // theme also appears here as a widget preset via themeToLook. Applying
  // one saves it as a user style with a stable id, so re-applying after a
  // theme tweak refreshes the same entry instead of piling up copies.
  const themeStyles = Object.entries({ ...allPresets, ...userCustomPresets })
    .filter(([, p]) => p && (p.light || p.dark))
    .map(([name, p]) => ({
      themeName: name,
      id: `${USER_STYLE_PREFIX}theme-${name}`,
      label: name,
      description: tr("editSheet.fromThemes"),
      look: themeToLook(p, isDark),
    }));
  const styles = [
    ...HOME_STYLES.map((st) => ({ id: st.id, label: st.label, description: st.description, look: getStyleLook(st.id) })),
    ...userWidgetStyles.filter((st) => !String(st.id).startsWith("theme-"))
      .map((st) => ({ id: `${USER_STYLE_PREFIX}${st.id}`, label: st.label, description: tr("editSheet.yourStyle"), look: st.look || {} })),
    ...themeStyles,
  ];
  const apply = async (st) => {
    if (!settingsRow?.id) return;
    const patch = {};
    // A theme-derived entry writes/refreshes its backing user style first.
    if (st.themeName) {
      const styleId = `theme-${st.themeName}`;
      const others = resolveUserStyles(settingsRow.ui_v2_styles).filter((x) => x.id !== styleId);
      patch.ui_v2_styles = [...others, { id: styleId, label: st.label, look: st.look }];
    }
    patch[homeField] = { ...(settingsRow[homeField] || {}), styleMode: st.id };
    await base44.entities.SystemSettings.update(settingsRow.id, patch);
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  return (
    <div className="space-y-1 pt-2">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {tr("editSheet.boardStyles")}
      </p>
      {styles.map((st) => {
        const cov = lookCoverage(st.look);
        return (
          <div key={st.id}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border text-sm ${
              current === st.id ? "border-primary/60 bg-primary/10" : "border-border/40"
            }`}>
            <span aria-hidden="true" className="w-8 h-8 flex-shrink-0"
              style={{ ...lookToStyle(st.look), ...boxStyle() }} />
            <button type="button" onClick={() => apply(st)} className="flex-1 min-w-0 text-left">
              <span className="text-xs font-medium">{st.label}</span>
              <span className="text-[0.625rem] text-muted-foreground block truncate">
                {notesFor === st.id
                  ? `${tr("editSheet.styleChanges")} ${cov.covers.map((g) => g.label.toLowerCase()).join(", ") || "—"} · ${tr("editSheet.styleLeaves")} ${cov.leaves.map((g) => g.label.toLowerCase()).join(", ")}`
                  : st.description}
              </span>
            </button>
            {!cov.complete && (
              <button type="button" aria-label={`${st.label} — partial style details`}
                onClick={() => setNotesFor(notesFor === st.id ? null : st.id)}
                className={`p-1 flex-shrink-0 ${notesFor === st.id ? "text-amber-500" : "text-muted-foreground hover:text-foreground"}`}>
                <StarIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <p className="text-[0.6875rem] text-muted-foreground">{tr("editSheet.boardStylesHint")}</p>
      {typeof window !== "undefined" && window.location.pathname === "/" && (
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("os-open-board-style-picker"))}
          className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
          {tr("editSheet.boardStylesMore")}
        </button>
      )}
    </div>
  );
}

// ── The popup body ─────────────────────────────────────────────────────
export default function UiEditSheet() {
  const v2 = useV2Display();
  const qc = useQueryClient();
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsRows[0] || null;

  // Which home board this device edits — same breakpoint HomeV2 uses.
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const background = resolveBackground(settingsRow?.[homeField]?.background);
  const writeBackground = async (next) => {
    if (!settingsRow?.id) return;
    await base44.entities.SystemSettings.update(settingsRow.id, {
      [homeField]: { ...(settingsRow[homeField] || {}), background: next },
    });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const wallpaper = settingsRow?.[homeField]?.wallpaper || {};

  const alignX = (v2.uiV2.tokens.alignX ?? "center") === "right" ? "right" : "left";

  return (
    <div className="space-y-2">
      <SizeSection v2={v2} alignX={alignX} />
      {/* Wireframe order: bars sit between SIZE and COLORS. Page-level
          only — the widget sheet mounts the other sections without it. */}
      <BarsSection v2={v2} alignX={alignX} />
      <ColorsSection>
        <BackgroundBlock background={background} onChange={writeBackground} wallpaper={wallpaper} />
      </ColorsSection>
      <PresetsSection v2={v2} />
    </div>
  );
}
