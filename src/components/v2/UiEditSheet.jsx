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
import { SlidersHorizontal, Plus, X, Copy, Pencil, Heart, PenLine, Zap, Activity as ActivityIcon, CheckSquare, Users, Timer, ChevronUp as ChevronUpIcon, ChevronDown as ChevronDownIcon, Undo2, Link2 } from "lucide-react";
import { SubSection } from "@/components/settings/SettingsUI";
import ColorPicker from "@/components/shared/ColorPicker";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import IconPicker from "@/components/shared/IconPicker";
import FontUploadButton from "@/components/shared/FontUploadButton";
import PinnedAltersConfigPanel from "@/components/alters/PinnedAltersConfigPanel";
import { listLookHistory, pushLookHistory } from "@/lib/lookHistory";
import { toast } from "sonner";
import { IconSlot } from "@/components/shared/LucideByName";
import { useV2Display } from "@/components/settings/V2DisplaySettings";
import { V2_TOKEN_DEFS, V2_COMMAND_KEYS, V2_TOP_BAR_ITEMS } from "@/lib/uiV2";
import { WAVE_COLOR_KEYS, WAVE_COLOR_LABELS, readWaveColorKey } from "@/lib/waveColorKey";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { HOME_STYLES, getStyleLook } from "@/lib/homeStyles";
import { lookToStyle, lookCoverage, resolveUserStyles, USER_STYLE_PREFIX, themeToLook, SHADOW_PRESETS, BORDER_STYLES } from "@/lib/widgetLook";
import { boxStyle } from "@/v2/primitives";
import { applyHomePresetToBoard, applyHomePresetToDesktopBoard, captureHomeLayout, captureHomeLook } from "@/lib/homePresetParts";
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

// One list row for "arrange these": checkbox + label + chevron moves —
// the standard treatment for every reorderable list in the edit sheets.
function ArrangeRow({ label, checked, onCheck, onUp, onDown, leading = null }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40">
      {leading}
      <label className="flex items-center gap-2 flex-1 min-w-0 text-xs cursor-pointer">
        <input type="checkbox" checked={checked}
          onChange={(e) => onCheck?.(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-primary" aria-label={label} />
        <span className="truncate">{label}</span>
      </label>
      <button type="button" onClick={onUp || undefined} disabled={!onUp} aria-label={`${label} up`}
        className="w-7 h-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center justify-center">
        <ChevronUpIcon className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onDown || undefined} disabled={!onDown} aria-label={`${label} down`}
        className="w-7 h-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center justify-center">
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
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
    <SubSection title={tr("editSheet.size")} defaultOpen storageKey="edit-size">
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
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value={a11y.fontFamily || "inter"}
                onChange={(id) => { setAccessibilityFontFamily(id); refresh(); }}
                options={fontOptions}
                placeholder={tr("editSheet.fontBody")}
              />
            </div>
            <FontUploadButton onUploaded={(family) => { setAccessibilityFontFamily(family); refresh(); }} />
          </div>
          <p className="text-xs font-medium">{tr("editSheet.fontHeader")}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value={a11y.headingFont || "default"}
                onChange={(id) => { setAccessibilityHeadingFont(id); refresh(); }}
                options={[{ id: "default", label: tr("editSheet.fontSameAsBody") }, ...fontOptions]}
                placeholder={tr("editSheet.fontHeader")}
              />
            </div>
            <FontUploadButton onUploaded={(family) => { setAccessibilityHeadingFont(family); refresh(); }} />
          </div>
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
// The wireframe's [SET 5] on each bar: per-bar border width, corner
// radius, font and text size, shadowing the global tokens on that bar
// only. Unset = inherit the app-wide value.
function BarLookRows({ v2, barId, alignX }) {
  const tr = useT();
  const fontOptions = useFontOptions({ includeInherit: true, inheritLabel: tr("editSheet.inherit") });
  const look = v2.uiV2.barLooks?.[barId] || {};
  const write = (patch) => v2.write({ barLooks: { ...(v2.uiV2.barLooks || {}), [barId]: { ...look, ...patch } } });
  const slider = (key, labelKey, min, max, fallback, unit) => (
    <SetRow label={tr(labelKey)}
      valueLabel={look[key] !== undefined ? `${look[key]}${unit}` : tr("editSheet.inherit")}
      alignX={alignX}>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={key === "fontScale" ? 5 : 1}
          value={look[key] ?? fallback}
          onChange={(e) => write({ [key]: parseInt(e.target.value, 10) })}
          className="flex-1" aria-label={tr(labelKey)} />
        {look[key] !== undefined && (
          <button type="button" onClick={() => write({ [key]: undefined })}
            className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground flex-shrink-0">
            {tr("editSheet.inherit")}
          </button>
        )}
      </div>
    </SetRow>
  );
  // Colour rows share the widget sheet's grammar: compact swatch, opacity
  // inside the popover, Clear = back to inherit.
  const colorRow = (key, opKey, labelKey, fallback) => (
    <ColorPicker compact label={tr(labelKey)}
      value={look[key] || fallback}
      onChange={(v) => write({ [key]: v })}
      opacity={{ value: look[opKey], onChange: (v) => write({ [opKey]: v, ...(look[key] ? {} : { [key]: fallback }) }) }}
      onClear={() => write({ [key]: undefined, [opKey]: undefined })} />
  );
  const chips = (key, labelKey, values) => (
    <div className="py-1">
      <p className="text-xs font-medium mb-1">{tr(labelKey)}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <button key={v} type="button"
            onClick={() => write({ [key]: look[key] === v ? undefined : v })}
            className={`text-[0.6875rem] px-2 py-1 rounded-full border ${
              look[key] === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
            }`}>{v}</button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      {slider("borderW", "editSheet.borderW", 0, 6, 1, "px")}
      {slider("radius", "editSheet.radius", 0, 24, 12, "px")}
      {slider("fontScale", "editSheet.textSize", 70, 160, 100, "%")}
      {slider("padding", "editSheet.innerSpacing", 0, 32, 8, "px")}
      <div className="py-1">
        <p className="text-xs font-medium mb-1">{tr("editSheet.font")}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchableSelect
              value={look.font || ""}
              onChange={(id) => write({ font: id || undefined })}
              options={fontOptions}
              placeholder={tr("editSheet.inherit")}
            />
          </div>
          <FontUploadButton onUploaded={(family) => write({ font: family })} />
        </div>
      </div>
      {/* The same colour set every widget gets — highlight / background /
          text / border, each with its own opacity — plus gradient, shadow
          and border style. Unset = inherit the app look. */}
      <div className="py-1">
        <p className="text-xs font-medium mb-1.5">{tr("editSheet.barColors")}</p>
        <div className="flex items-center gap-3">
          {colorRow("accent", "accentOpacity", "editSheet.highlight", "#8b5cf6")}
          {colorRow("bg", "bgOpacity", "editSheet.background", "#111827")}
          {colorRow("textColor", "textOpacity", "editSheet.textColor", "#e5e7eb")}
          {colorRow("borderColor", "borderOpacity", "editSheet.borderColor", "#8b5cf6")}
        </div>
      </div>
      <div className="py-1">
        <p className="text-xs font-medium mb-1.5">{tr("editSheet.gradient")}</p>
        <div className="flex items-center gap-3">
          {colorRow("gradFrom", "gradFromOpacity", "editSheet.background", "#312e81")}
          {colorRow("gradTo", "gradToOpacity", "editSheet.background", "#831843")}
          {(look.gradFrom || look.gradTo) && (
            <button type="button"
              onClick={() => write({ gradFrom: undefined, gradTo: undefined, gradAngle: undefined, gradFromOpacity: undefined, gradToOpacity: undefined })}
              className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">
              {tr("editSheet.gradientClear")}
            </button>
          )}
        </div>
        {look.gradFrom && look.gradTo && slider("gradAngle", "editSheet.gradAngle", 0, 360, 135, "\u00b0")}
      </div>
      {chips("shadow", "editSheet.shadow", Object.keys(SHADOW_PRESETS))}
      {chips("borderStyle", "editSheet.borderStyle", BORDER_STYLES)}
    </>
  );
}

function BarToggle({ label, on, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-xs font-medium cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-primary" aria-label={label} />
    </label>
  );
}

// Default glyphs for the quick-action keys (mirrors V2Frame's KEY_ICONS) —
// shown on the change-icon button until the user picks another.
const KEY_ICON_DEFAULTS = { quick_checkin: Heart, quick_note: PenLine, start_activity: Zap, start_symptom: ActivityIcon, quick_thing: CheckSquare, set_front: Users, active_now: Timer };

function BarsSection({ v2, alignX }) {
  const tr = useT();
  const terms = useTerms();
  const qc = useQueryClient();
  // Which nav page / quick-action key is picking an icon right now.
  const [iconFor, setIconFor] = useState(null); // { kind, id, label }
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
  // The pinned bar's own size/label config — the same singleton the
  // gallery's gear writes, so both editors agree.
  const pinnedCfg = settingsRow?.pinned_alters_config || {};
  const writePinnedCfg = (patch) => writeSettings({
    pinned_alters_config: { ...pinnedCfg, ...patch },
  });
  const writeAltersBar = (patch) => writeSettings({
    [homeField]: { ...(settingsRow?.[homeField] || {}), altersBar: { ...altersBar, ...patch } },
  });

  // Top-bar arrangement — order + per-item show/hide (the wireframe's
  // "arrangement / icon images, labels ... toggle display"). No on/off
  // for the whole bar: it carries the recovery paths, so it stays.
  const topBar = v2.uiV2.topBar;
  const writeTopBar = (patch) => v2.write({ topBar: { ...topBar, ...patch } });
  const moveTopItem = (idx, dir) => {
    const next = [...topBar.order];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    writeTopBar({ order: next });
  };

  return (
    <SubSection title={tr("editSheet.bars")} storageKey="edit-bars">
      {/* Top bar — each bar is its own collapsible, per the wireframe. */}
      <SubSection title={tr("editSheet.barTop")} storageKey="edit-bar-top">
      <div className="space-y-1">
        {tokenRow("statusH", "editSheet.barHeight")}
        <BarLookRows v2={v2} barId="top" alignX={alignX} />
        <p className="text-xs text-muted-foreground pt-1">{tr("editSheet.arrangement")}</p>
        {topBar.order.map((id, idx) => {
          const item = V2_TOP_BAR_ITEMS.find((i) => i.id === id);
          if (!item) return null;
          const shown = !topBar.hidden.includes(id);
          return (
            <ArrangeRow key={id} label={applyTerms(tr(item.labelKey), terms)}
              checked={shown}
              onCheck={(v) => writeTopBar({ hidden: v ? topBar.hidden.filter((x) => x !== id) : [...topBar.hidden, id] })}
              onUp={idx === 0 ? null : () => moveTopItem(idx, -1)}
              onDown={idx === topBar.order.length - 1 ? null : () => moveTopItem(idx, 1)} />
          );
        })}
        <BarToggle label={tr("editSheet.wave")} on={v2.uiV2.bars.wave} onChange={(on) => v2.setBar("wave", on)} />
        {v2.uiV2.bars.wave && (
          <div className="flex items-center gap-2.5 py-1">
            <span className="text-xs font-medium flex-1 min-w-0 truncate">{tr("editSheet.waveColor")}</span>
            <div className="flex gap-1.5 flex-wrap justify-end items-center">
              {/* Swatches, not word-pills: the choice IS a colour. The
                  "background" key means Off and stays a word. */}
              {WAVE_COLOR_KEYS.map((k) => {
                const on = !waveCustom && waveKey === k;
                if (k === "background") return (
                  <button key={k} type="button" aria-pressed={on}
                    onClick={() => writeSettings({ wave_color_key: k, wave_color_custom: null })}
                    className={`text-[0.6875em] px-2 py-1 rounded-full border ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                    {WAVE_COLOR_LABELS[k]}
                  </button>
                );
                const cssVar = k === "text" ? "--color-text-primary" : k === "text-2nd" ? "--color-text-secondary" : `--color-${k}`;
                return (
                  <button key={k} type="button" aria-pressed={on} aria-label={WAVE_COLOR_LABELS[k]} title={WAVE_COLOR_LABELS[k]}
                    onClick={() => writeSettings({ wave_color_key: k, wave_color_custom: null })}
                    className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${on ? "border-primary ring-2 ring-primary/40" : "border-border/60"}`}
                    style={{ background: `var(${cssVar})` }} />
                );
              })}
              <ColorPicker compact label={tr("editSheet.waveColor")}
                value={waveCustom || "#7dd3fc"}
                onChange={(hex) => writeSettings({ wave_color_custom: hex })}
                onClear={() => writeSettings({ wave_color_custom: null })} />
            </div>
          </div>
        )}
      </div>
      </SubSection>

      <SubSection title={tr("editSheet.barBottom")} storageKey="edit-bar-bottom">
      <div className="space-y-1">
        <BarToggle label={tr("editSheet.show")} on={v2.uiV2.bars.tabs} onChange={(on) => v2.setBar("tabs", on)} />
        {tokenRow("stripH", "editSheet.barHeight")}
        <BarLookRows v2={v2} barId="tabs" alignX={alignX} />
        <p className="text-xs text-muted-foreground pt-1">{tr("editSheet.arrangement")}</p>
        {bottomIds.map((id, idx) => (
          <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40">
            <button type="button" onClick={() => setIconFor({ kind: "pages", id, label: pageLabel(id) })}
              aria-label={`${pageLabel(id)} — change icon`} title="Change icon"
              className="w-7 h-7 rounded-md border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center flex-shrink-0">
              <IconSlot override={v2.uiV2.icons?.pages?.[id]} Default={ALL_PAGES.find((p) => p.id === id)?.icon} className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs flex-1 min-w-0 truncate">{pageLabel(id)}</span>
            <button type="button" onClick={() => moveNavItem(idx, -1)} disabled={idx === 0}
              aria-label={`${pageLabel(id)} ↑`}
              className="w-7 h-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center justify-center"><ChevronUpIcon className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => moveNavItem(idx, 1)} disabled={idx === bottomIds.length - 1}
              aria-label={`${pageLabel(id)} ↓`}
              className="w-7 h-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center justify-center"><ChevronDownIcon className="w-3.5 h-3.5" /></button>
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
      </SubSection>

      <SubSection title={tr("editSheet.barSide")} storageKey="edit-bar-side">
      <div className="space-y-1">
        <BarToggle label={tr("editSheet.show")} on={v2.uiV2.bars.rail} onChange={(on) => v2.setBar("rail", on)} />
        {tokenRow("railW", "editSheet.barWidth")}
        <BarLookRows v2={v2} barId="rail" alignX={alignX} />
        <PillRow label={tr("editSheet.alignEdge")} value={v2.uiV2.tokens.railSide ?? "left"}
          onChange={(val) => v2.setToken("railSide", val)} alignX={alignX}
          options={[{ v: "left", label: tr("editSheet.left") }, { v: "right", label: tr("editSheet.right") }]} />
        <PillRow label={tr("editSheet.railContent")} value={v2.uiV2.tokens.railActions ?? "labels"}
          onChange={(val) => v2.setToken("railActions", val)} alignX={alignX}
          options={[{ v: "labels", label: tr("editSheet.labels") }, { v: "icons", label: tr("editSheet.icons") }]} />
        <p className="text-[0.6875rem] text-muted-foreground">{tr("editSheet.railHint")}</p>
      </div>
      </SubSection>

      <SubSection title={tr("editSheet.barActions")} storageKey="edit-bar-actions">
      <div className="space-y-1">
        <BarToggle label={tr("editSheet.show")} on={v2.uiV2.bars.actions} onChange={(on) => v2.setBar("actions", on)} />
        {tokenRow("cmdSize", "editSheet.buttonSize")}
        <BarLookRows v2={v2} barId="actions" alignX={alignX} />
        <PillRow label={tr("editSheet.placement")} value={v2.uiV2.tokens.actionsMode ?? "bar"}
          onChange={(val) => v2.setToken("actionsMode", val)} alignX={alignX}
          options={[
            { v: "bar", label: tr("editSheet.placementBar") },
            { v: "float", label: tr("editSheet.placementFloat") },
            { v: "bubble", label: tr("editSheet.placementBubble") },
          ]} />
        <PillRow label={tr("editSheet.activeBubble")} value={v2.uiV2.tokens.activeBubble ?? "off"}
          onChange={(val) => v2.setToken("activeBubble", val)} alignX={alignX} stacked
          options={[
            { v: "off", label: tr("editSheet.activeOff") },
            { v: "when-active", label: tr("editSheet.activeWhen") },
            { v: "always", label: tr("editSheet.activeAlways") },
          ]} />
        {(v2.uiV2.tokens.activeBubble ?? "off") !== "off" && (
          <div className="pl-2 border-l border-border/30">
            <BarLookRows v2={v2} barId="active" alignX={alignX} />
          </div>
        )}
        {(v2.uiV2.tokens.actionsMode ?? "bar") === "bar" && (
          <PillRow label={tr("editSheet.actionsEdge")} value={v2.uiV2.tokens.actionsEdge ?? "bottom"}
            onChange={(val) => v2.setToken("actionsEdge", val)} alignX={alignX}
            options={[{ v: "bottom", label: tr("editSheet.edgeBottom") }, { v: "top", label: tr("editSheet.edgeTop") }]} />
        )}
        {(v2.uiV2.tokens.actionsMode ?? "bar") === "bar" && (
          <PillRow label={tr("editSheet.actionsAttach")} value={v2.uiV2.tokens.actionsAttach ?? "float"}
            onChange={(val) => v2.setToken("actionsAttach", val)} alignX={alignX}
            options={[{ v: "float", label: tr("editSheet.attachFloat") }, { v: "attached", label: tr("editSheet.attachBar") }]} />
        )}
        {(v2.uiV2.tokens.actionsMode ?? "bar") === "bar" && (
          <PillRow label={tr("editSheet.handleSides")} value={v2.uiV2.tokens.handleSides ?? "alters-left"}
            onChange={(val) => v2.setToken("handleSides", val)} alignX={alignX} stacked
            options={[
              { v: "alters-left", label: tr("editSheet.handleAltersLeft", { alters: terms.alters }) },
              { v: "alters-right", label: tr("editSheet.handleAltersRight", { alters: terms.alters }) },
            ]} />
        )}
        {/* No edge pill for float/bubble — they're freely repositioned by
            hold-and-drag, so a setting here just lied. */}
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
            <div key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40">
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
                    className="w-7 h-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center justify-center"><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => move(1)} disabled={idx < 0 || idx >= v2.uiV2.commandKeys.length - 1}
                    aria-label={`${applyTerms(k.label, terms)} ↓`}
                    className="w-7 h-7 rounded-md border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30 flex items-center justify-center"><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      </SubSection>

      {/* Alter bar — the pinned-members strip on the home board. */}
      <SubSection title={applyTerms(tr("editSheet.barAlters"), terms)} storageKey="edit-bar-alters">
      <div className="space-y-1">
        <BarToggle label={tr("editSheet.show")}
          on={altersBar.enabled === true}
          onChange={(on) => writeAltersBar({ enabled: on, collapsed: false })} />
        {altersBar.enabled === true && (
          <>
            <PillRow label={tr("editSheet.placement")} value={["top", "bottom", "left", "right"].includes(altersBar.position) ? altersBar.position : "bottom"}
              onChange={(val) => writeAltersBar({ position: val })} alignX={alignX}
              options={[
                { v: "top", label: tr("editSheet.top") }, { v: "bottom", label: tr("editSheet.bottom") },
                { v: "left", label: tr("editSheet.left") }, { v: "right", label: tr("editSheet.right") },
              ]} />
            {["top", "bottom", undefined].includes(altersBar.position) && (
              <PillRow label={tr("editSheet.altersAttach")} value={altersBar.attached ? "attached" : "float"}
                onChange={(val) => writeAltersBar({ attached: val === "attached" })} alignX={alignX}
                options={[{ v: "float", label: tr("editSheet.attachFloat") }, { v: "attached", label: tr("editSheet.attachBar") }]} />
            )}
            {/* SET A (bar height, icon size, labels) + SET 5 (border,
                radius, text size, font) — the same groups every other bar
                gets, on the SAME pinned-bar config the gear writes. */}
            <SetRow label={tr("editSheet.barHeight")}
              valueLabel={pinnedCfg.barHeight > 0 ? `${pinnedCfg.barHeight}px` : tr("editSheet.fitIcons")} alignX={alignX}>
              <input type="range" min={0} max={200} step={4} value={pinnedCfg.barHeight || 0}
                onChange={(e) => writePinnedCfg({ barHeight: parseInt(e.target.value, 10) })}
                className="w-full" aria-label={tr("editSheet.barHeight")} />
            </SetRow>
            <SetRow label={tr("editSheet.iconSize")} valueLabel={`${pinnedCfg.chipSize ?? 48}px`} alignX={alignX}>
              <input type="range" min={14} max={88} step={2} value={pinnedCfg.chipSize ?? 48}
                onChange={(e) => writePinnedCfg({ chipSize: parseInt(e.target.value, 10) })}
                className="w-full" aria-label={tr("editSheet.iconSize")} />
            </SetRow>
            <BarLookRows v2={v2} barId="alters" alignX={alignX} />
            {/* The full pinned config (pins, order, display, shapes, front
                levels…) — THE panel, same one the bar's own gear opens.
                Labels moved in there ("Name shown"). */}
            <div className="pt-2 border-t border-border/30">
              <PinnedAltersConfigPanel />
            </div>
          </>
        )}
      </div>
      </SubSection>
      <IconPicker open={!!iconFor} onClose={() => setIconFor(null)}
        title={iconFor ? `Icon for ${iconFor.label}` : "Choose an icon"}
        current={iconFor ? (v2.uiV2.icons?.[iconFor.kind]?.[iconFor.id]?.iconName || "") : ""}
        onPick={(o) => { if (iconFor) v2.setIcon(iconFor.kind, iconFor.id, o); }} />
    </SubSection>
  );
}

// ── COLORS section — the eight roles from the wireframe ───────────────
const COLOR_ROLES = [
  ["bg", "editSheet.colorBackground"], ["surface", "editSheet.colorSurface"],
  ["primary", "editSheet.colorPrimary"], ["secondary", "editSheet.colorSecondary"],
  ["muted", "editSheet.colorMuted"],
  ["text-primary", "editSheet.colorTextBody"], ["text-secondary", "editSheet.colorTextHeader"],
];

function ColorsSection({ children, v2 }) {
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
    <SubSection title={tr("editSheet.colors")} storageKey="edit-colors">
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
        {/* HIGHLIGHT — the new UI's own accent (--v2-accent): page dots,
            active tab, focus rings, chip highlights, the Peek ring. It
            follows Primary unless set here — this tile is what was
            missing when "the UI has this blue but I can't find it in the
            colors": the token existed, the grid didn't show it. */}
        {v2 && (() => {
          const stored = v2.uiV2.tokens.accent || "";
          const following = !stored;
          const shown = stored || readCss("primary");
          const { hex, alpha } = splitHexAlpha(shown);
          return (
            <div key="v2-highlight" className="flex flex-col items-center gap-1">
              <span className="relative">
                <ColorPicker compact
                  label={tr("editSheet.colorHighlight")}
                  value={hex || "#888888"}
                  onChange={(h) => v2.setToken("accent", joinHexAlpha(h, alpha))}
                  opacity={{ value: alpha, onChange: (a) => v2.setToken("accent", joinHexAlpha(hex || readCss("primary"), a)) }}
                  extraAction={following ? null : { label: tr("editSheet.followPrimary"), onClick: () => v2.setToken("accent", "") }}
                />
                {following && (
                  <span aria-hidden="true" title={tr("editSheet.followsPrimary")}
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-background flex items-center justify-center text-[0.5rem] leading-none"
                    style={{ background: "var(--color-primary)", color: "hsl(var(--primary-foreground))" }}>=</span>
                )}
              </span>
              <span className="text-[0.625rem] text-muted-foreground text-center leading-tight">
                {tr("editSheet.colorHighlight")}
              </span>
            </div>
          );
        })()}
      </div>
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
      <AssetButton onPick={onPick} title={title} allowFolders />
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
    clearCustomColors, setSelectedTheme, setThemeMode, updateCustomColorsFull,
  } = useTheme();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsRows[0] || null;
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const currentStyleMode = settingsRow?.[homeField]?.styleMode || "current";

  // ONE list, TWO tabs (the user's call — "one thing, maybe two: style
  // vs layout/size"). Style = colours + widget look; Layout = UI size,
  // size tokens, home-board arrangement. Every source (built-in themes,
  // your saved presets, widget styles) lives in the same list, told apart
  // by a small tag — no more four stacked sub-lists.
  const [tab, setTab] = useState("style");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [parts, setParts] = useState({ colors: true, widgets: false, size: false, layout: false });
  const [linkAlterId, setLinkAlterId] = useState("");
  const [renaming, setRenaming] = useState(null); // { from, to }
  const [notesFor, setNotesFor] = useState(null);
  const [linkingFor, setLinkingFor] = useState(null); // preset name
  // Applying a THEME also restyles the widgets to match it (persisted;
  // off = a theme only changes colours and your widget style stays put).
  const [themeRestylesWidgets, setThemeRestylesWidgets] = useState(() => {
    try { return localStorage.getItem("symphony_presets_theme_restyles_widgets") === "1"; } catch { return false; }
  });
  const toggleThemeRestyles = () => {
    const next = !themeRestylesWidgets;
    setThemeRestylesWidgets(next);
    try { localStorage.setItem("symphony_presets_theme_restyles_widgets", next ? "1" : "0"); } catch { /* fine */ }
  };

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

  const anyPart = Object.values(parts).some(Boolean);

  // ── Undo history ────────────────────────────────────────────────
  // Everything an apply can touch, captured as a preset payload BEFORE
  // each apply — one tap brings the whole previous look back.
  const captureCurrentLook = () => {
    const snap = snapshotColors();
    return {
      light: snap.light, dark: snap.dark, themeMode,
      fontSize: getAccessibilitySettings().fontSize || "default",
      font: getAccessibilitySettings().fontFamily || "",
      headingFont: getAccessibilitySettings().headingFont || "",
      uiV2Tokens: Object.fromEntries(SIZE_TOKEN_IDS.filter((id) => v2.uiV2.tokens[id] !== undefined).map((id) => [id, v2.uiV2.tokens[id]])),
      uiV2HomeLook: captureHomeLook(settingsRow?.ui_v2_home),
      uiV2HomeLayout: captureHomeLayout(settingsRow?.ui_v2_home),
      uiV2HomeDesktopLook: captureHomeLook(settingsRow?.ui_v2_home_desktop),
      uiV2HomeDesktopLayout: captureHomeLayout(settingsRow?.ui_v2_home_desktop),
    };
  };
  const [history, setHistory] = useState(() => listLookHistory());
  useEffect(() => {
    const on = () => setHistory(listLookHistory());
    window.addEventListener("symphony-look-history", on);
    return () => window.removeEventListener("symphony-look-history", on);
  }, []);
  const [historyOpen, setHistoryOpen] = useState(false);
  const restoreEntry = async (entry) => {
    // Restoring is itself undoable.
    pushLookHistory("Before restore", captureCurrentLook());
    await applyPayload(entry.payload);
    toast.success(`Restored “${entry.label}”`);
  };
  const snapshotThen = (label) => {
    const entry = pushLookHistory(label, captureCurrentLook());
    if (entry) {
      toast.success(`Applied ${label}`, { action: { label: "Undo", onClick: () => restoreEntry(entry) } });
    }
  };
  const doSave = (label) => {
    const trimmed = (label || "").trim();
    if (!trimmed || !anyPart) return;
    const payload = {};
    if (parts.colors) {
      const snap = snapshotColors();
      payload.light = snap.light;
      payload.dark = snap.dark;
      payload.themeMode = themeMode;
    }
    if (parts.size) {
      payload.fontSize = getAccessibilitySettings().fontSize || "default";
      payload.uiV2Tokens = Object.fromEntries(
        SIZE_TOKEN_IDS.filter((id) => v2.uiV2.tokens[id] !== undefined).map((id) => [id, v2.uiV2.tokens[id]])
      );
    }
    // Widget look + board layout use the SAME parts the Settings →
    // Appearance preset form saves, so a preset saved here and one saved
    // there are the same kind of thing (and both apply through the shared
    // applyHomePresetToBoard helper).
    if (parts.widgets) {
      payload.uiV2HomeLook = captureHomeLook(settingsRow?.ui_v2_home);
      payload.uiV2HomeDesktopLook = captureHomeLook(settingsRow?.ui_v2_home_desktop);
    }
    if (parts.layout) {
      payload.uiV2HomeLayout = captureHomeLayout(settingsRow?.ui_v2_home);
      payload.uiV2HomeDesktopLayout = captureHomeLayout(settingsRow?.ui_v2_home_desktop);
    }
    saveCustomPreset(trimmed, payload);
    if (linkAlterId) linkAlterTheme(linkAlterId, trimmed);
    setName(""); setLinkAlterId("");
  };

  const writeSettings = async (patch) => {
    if (!settingsRow?.id || Object.keys(patch).length === 0) return;
    await base44.entities.SystemSettings.update(settingsRow.id, patch);
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };

  // Widget-look entries write the board's default style (styleMode).
  const applyWidgetStyle = async (st, { skipSnapshot = false } = {}) => {
    if (!settingsRow?.id) return;
    if (!skipSnapshot) snapshotThen(st.label || "widget style");
    const patch = {};
    if (st.themeName) {
      const styleId = `theme-${st.themeName}`;
      const others = resolveUserStyles(settingsRow.ui_v2_styles).filter((x) => x.id !== styleId);
      patch.ui_v2_styles = [...others, { id: styleId, label: st.label, look: st.look }];
    }
    patch[homeField] = { ...(settingsRow[homeField] || {}), styleMode: st.id };
    await writeSettings(patch);
  };

  // `presetName`: set when the payload came from a NAMED preset (theme
  // selection tracks it, and the restyle-widgets checkbox applies); a
  // history snapshot has none.
  const applyPayload = async (preset, presetName = "") => {
    if (!preset) return;
    if (preset.light || preset.dark) {
      clearCustomColors();
      if (presetName) setSelectedTheme(presetName);
      else updateCustomColorsFull(preset.light || {}, preset.dark || {});
    }
    if (preset.themeMode) setThemeMode(preset.themeMode);
    if (preset.fontSize) setAccessibilityFontSize(preset.fontSize);
    if (preset.font !== undefined) setAccessibilityFontFamily(preset.font);
    if (preset.headingFont !== undefined) setAccessibilityHeadingFont(preset.headingFont);
    const patch = {};
    if (preset.uiV2Tokens) {
      patch.ui_v2 = { ...(settingsRow?.ui_v2 || {}), tokens: { ...(settingsRow?.ui_v2?.tokens || {}), ...preset.uiV2Tokens } };
    }
    const nextHome = applyHomePresetToBoard(preset, settingsRow?.ui_v2_home);
    if (nextHome) patch.ui_v2_home = nextHome;
    const nextDesk = applyHomePresetToDesktopBoard(preset, settingsRow?.ui_v2_home_desktop);
    if (nextDesk) patch.ui_v2_home_desktop = nextDesk;
    await writeSettings(patch);
    // A theme brings its widget look along only when the user asked for it.
    if (presetName && themeRestylesWidgets && allPresets[presetName] && (preset.light || preset.dark)) {
      await applyWidgetStyle({
        themeName: presetName, id: `${USER_STYLE_PREFIX}theme-${presetName}`, label: presetName, look: themeToLook(preset, isDark),
      }, { skipSnapshot: true });
    }
  };
  const applyPreset = async (presetName) => {
    const preset = allPresets[presetName] || userCustomPresets[presetName];
    if (!preset) return;
    snapshotThen(presetName);
    await applyPayload(preset, presetName);
  };

  const renamePreset = (from, to) => {
    const trimmed = (to || "").trim();
    if (!trimmed || trimmed === from || !userCustomPresets[from]) return;
    saveCustomPreset(trimmed, userCustomPresets[from]);
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
  const removePreset = (pname) => {
    for (const [alterId, l] of Object.entries(alterThemeLinks || {})) {
      if (l === pname) unlinkAlterTheme(alterId);
    }
    deleteUserPreset(pname);
  };

  const alterOptions = useMemo(
    () => alters.filter((a) => !a.is_archived).map((a) => ({ id: a.id, label: formatAlter(a), color: a.color })),
    [alters, formatAlter]
  );
  const linkedAlterNames = (presetName) => Object.entries(alterThemeLinks || {})
    .filter(([, linked]) => linked === presetName)
    .map(([alterId]) => alterOptions.find((o) => o.id === alterId)?.label)
    .filter(Boolean);

  // What a saved preset touches, as short tags — the one honest way to
  // tell "colours only" from "everything" in a single mixed list.
  const coverageOf = (preset) => {
    const covers = [];
    if (preset.light || preset.dark) covers.push({ id: "colors", label: tr("editSheet.partColor") });
    if (preset.uiV2HomeLook || preset.uiV2HomeDesktopLook || preset.uiV2Home) covers.push({ id: "widgets", label: tr("editSheet.partWidgets") });
    if (preset.fontSize || preset.uiV2Tokens || preset.font) covers.push({ id: "size", label: tr("editSheet.partSize") });
    if (preset.uiV2HomeLayout || preset.uiV2HomeDesktopLayout || preset.uiV2Home || preset.dashboardLayout) covers.push({ id: "layout", label: tr("editSheet.partLayout") });
    return covers;
  };
  const isStylePreset = (c) => c.some((x) => x.id === "colors" || x.id === "widgets");
  const isLayoutPreset = (c) => c.some((x) => x.id === "size" || x.id === "layout");

  // The merged list.
  const userWidgetStyles = resolveUserStyles(settingsRow?.ui_v2_styles).filter((st) => !String(st.id).startsWith("theme-"));
  const rows = [];
  // Each built-in theme is TWO rows — its light and its dark version —
  // because the new UI has no separate mode toggle (the user's call:
  // split them instead of linking them).
  for (const pname of Object.keys(allPresets)) {
    const preset = allPresets[pname];
    for (const mode of ["light", "dark"]) {
      if (!preset[mode]) continue;
      rows.push({
        key: `theme:${pname}:${mode}`, kind: "theme", name: `${pname} · ${mode}`, source: tr("editSheet.srcBuiltIn"),
        preset, previewMode: mode, covers: coverageOf(preset),
        active: selectedTheme === pname && !customColors && themeMode === mode,
        apply: async () => { snapshotThen(`${pname} (${mode})`); setThemeMode(mode); await applyPayload(preset, pname); },
      });
    }
  }
  for (const [pname, preset] of Object.entries(userCustomPresets)) {
    const covers = coverageOf(preset);
    rows.push({ key: `user:${pname}`, kind: "user", name: pname, source: tr("editSheet.srcYours"),
      preset, covers, active: selectedTheme === pname && !customColors, apply: () => applyPreset(pname), linked: linkedAlterNames(pname) });
  }
  for (const st of HOME_STYLES) {
    const look = getStyleLook(st.id);
    rows.push({ key: `style:${st.id}`, kind: "widget", name: st.label, source: tr("editSheet.srcWidgetStyle"), description: st.description,
      look, covers: [{ id: "widgets", label: tr("editSheet.partWidgets") }], active: currentStyleMode === st.id, apply: () => applyWidgetStyle({ id: st.id, label: st.label, look }) });
  }
  for (const st of userWidgetStyles) {
    const id = `${USER_STYLE_PREFIX}${st.id}`;
    rows.push({ key: `ustyle:${st.id}`, kind: "widget", name: st.label, source: tr("editSheet.srcYours"),
      look: st.look || {}, covers: [{ id: "widgets", label: tr("editSheet.partWidgets") }], active: currentStyleMode === id, apply: () => applyWidgetStyle({ id, label: st.label, look: st.look || {} }) });
  }
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (tab === "style" ? !isStylePreset(r.covers) : !isLayoutPreset(r.covers)) return false;
    if (q && !`${r.name} ${r.source} ${r.description || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const swatchFor = (r) => {
    if (r.look) return <span aria-hidden="true" className="w-8 h-8 flex-shrink-0" style={{ ...lookToStyle(r.look), ...boxStyle() }} />;
    const c = (r.previewMode ? r.preset?.[r.previewMode] : (isDark ? r.preset?.dark : r.preset?.light)) || r.preset?.light || r.preset?.dark || {};
    const dots = ["primary", "accent", "background"].map((k) => c[k]).filter(Boolean);
    return (
      <span aria-hidden="true" className="w-8 h-8 flex-shrink-0 rounded-lg border border-border/40 flex items-center justify-center gap-0.5"
        style={{ background: c.bg || "var(--color-muted)" }}>
        {dots.length ? dots.map((hex, i) => <span key={i} className="w-2 h-2 rounded-full" style={{ background: hex }} />)
          : <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />}
      </span>
    );
  };

  const PART_TOGGLES = [
    ["colors", tr("editSheet.partColor")], ["widgets", tr("editSheet.partWidgets")],
    ["size", tr("editSheet.partSize")], ["layout", tr("editSheet.partLayout")],
  ];

  return (
    <SubSection title={tr("editSheet.presets")} storageKey="edit-presets">
      {/* Tabs + search — one list underneath. */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-border/50 overflow-hidden flex-shrink-0" role="tablist">
          {[["style", tr("editSheet.tabStyle")], ["layout", tr("editSheet.tabLayout")]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`text-xs px-2.5 py-1.5 ${tab === id ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("editSheet.presetSearch")}
          className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-input bg-background text-xs" />
      </div>
      {tab === "style" && (
        <label className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={themeRestylesWidgets} onChange={toggleThemeRestyles} className="w-3.5 h-3.5 rounded accent-primary" />
          {tr("editSheet.themeRestylesWidgets")}
        </label>
      )}

      {/* Capped + scrolling — 16 built-in themes alone made the sheet
          endless. */}
      <div className="space-y-1 max-h-72 overflow-y-auto overscroll-contain pr-0.5">
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">{tr("editSheet.presetsNone")}</p>
        )}
        {visible.map((r) => {
          const cov = r.look ? lookCoverage(r.look) : null;
          const partialTags = r.covers.map((c) => c.label).join(" · ");
          return (
            <React.Fragment key={r.key}>
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${r.active ? "border-primary/60 bg-primary/10" : "border-border/30"}`}>
              {swatchFor(r)}
              {renaming?.from === r.name && r.kind === "user" ? (
                <input autoFocus value={renaming.to} onChange={(e) => setRenaming({ from: r.name, to: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") renamePreset(r.name, renaming.to); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={() => renamePreset(r.name, renaming.to)}
                  className="flex-1 h-8 px-2 rounded-lg border border-input bg-background text-sm" />
              ) : (
                <button type="button" onClick={r.apply} className="flex-1 min-w-0 text-left" title={tr("editSheet.presetApply")}>
                  <span className={`text-sm truncate block ${r.kind === "theme" ? "capitalize" : ""}`}>{r.name}</span>
                  <span className="text-[0.625rem] text-muted-foreground block truncate">
                    {notesFor === r.key && cov
                      ? `${tr("editSheet.styleChanges")} ${cov.covers.map((g) => g.label.toLowerCase()).join(", ") || "—"} · ${tr("editSheet.styleLeaves")} ${cov.leaves.map((g) => g.label.toLowerCase()).join(", ")}`
                      : [r.source, partialTags, r.linked?.length ? `⛓ ${r.linked.join(", ")}` : null].filter(Boolean).join(" · ")}
                  </span>
                </button>
              )}
              {cov && !cov.complete && (
                <button type="button" aria-label={`${r.name} — partial style details`}
                  onClick={() => setNotesFor(notesFor === r.key ? null : r.key)}
                  className={`p-1 flex-shrink-0 ${notesFor === r.key ? "text-amber-500" : "text-muted-foreground hover:text-foreground"}`}>
                  <StarIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {r.kind === "user" && (
                <>
                  <button type="button" aria-label={tr("editSheet.presetLink", { alter: terms.alter })}
                    title={tr("editSheet.presetLink", { alter: terms.alter })}
                    onClick={() => setLinkingFor(linkingFor === r.name ? null : r.name)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg border flex-shrink-0 ${linkingFor === r.name || r.linked?.length ? "border-primary/60 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                    <Link2 className="w-3 h-3" />
                  </button>
                  <button type="button" aria-label={tr("editSheet.presetRename")} onClick={() => setRenaming({ from: r.name, to: r.name })}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground flex-shrink-0">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button type="button" aria-label={tr("editSheet.presetDuplicate")} onClick={() => duplicatePreset(r.name)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground flex-shrink-0">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button type="button" aria-label={tr("editSheet.presetDelete")} onClick={() => removePreset(r.name)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-destructive flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
            {/* Link this preset to {alters}: applying happens automatically
                when they start fronting (same store the classic UI uses). */}
            {r.kind === "user" && linkingFor === r.name && (
              <div className="ml-3 pl-2 border-l border-border/40 space-y-1.5 py-1">
                {(Object.entries(alterThemeLinks || {}).filter(([, n]) => n === r.name)).map(([alterId]) => {
                  const a = alterOptions.find((o) => o.id === alterId);
                  return (
                    <span key={alterId} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border/50 mr-1">
                      {a?.label || "?"}
                      <button type="button" aria-label={`Unlink ${a?.label || ""}`} onClick={() => unlinkAlterTheme(alterId)}
                        className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
                <SearchableSelect value="" onChange={(id) => { if (id) linkAlterTheme(id, r.name); }}
                  options={alterOptions.filter((o) => alterThemeLinks?.[o.id] !== r.name)}
                  placeholder={tr("editSheet.linkAlter", { alter: terms.alter })} zIndex={80} />
              </div>
            )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Undo — the last looks, newest first; restoring is undoable too. */}
      {history.length > 0 && (
        <div className="pt-1">
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}
            className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-1.5"><Undo2 className="w-3.5 h-3.5" /> {tr("editSheet.undoHistory")}</span>
            <span className="tabular-nums">{history.length}</span>
          </button>
          {historyOpen && (
            <div className="mt-1 space-y-1 max-h-48 overflow-y-auto overscroll-contain">
              {history.map((h) => (
                <button key={h.ts} type="button" onClick={() => restoreEntry(h)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-border/30 text-left text-xs hover:bg-muted/30">
                  <span className="truncate">{tr("editSheet.beforeLabel", { name: h.label })}</span>
                  <span className="text-muted-foreground flex-shrink-0">{new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "style" && typeof window !== "undefined" && window.location.pathname === "/" && (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("os-open-board-style-picker"))}
          className="text-[0.6875rem] text-muted-foreground hover:text-foreground underline underline-offset-2">
          {tr("editSheet.customiseWidgetLook")}
        </button>
      )}

      {/* Save the current look — pick which parts it captures. */}
      <div className="space-y-1.5 pt-2 border-t border-border/30">
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("editSheet.presetName")}
            className="flex-1 h-9 px-2 rounded-lg border border-input bg-background text-sm" />
          <button type="button" disabled={!name.trim() || !anyPart} onClick={() => doSave(name)}
            className="text-xs px-3 h-9 rounded-lg border border-primary/60 text-primary disabled:opacity-40">
            {tr("editSheet.presetSave")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {PART_TOGGLES.map(([id, label]) => (
            <label key={id} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={!!parts[id]} onChange={(e) => setParts((p) => ({ ...p, [id]: e.target.checked }))}
                className="w-3.5 h-3.5 rounded accent-primary" /> {label}
            </label>
          ))}
          <div className="flex-1 min-w-[120px]">
            <SearchableSelect value={linkAlterId} onChange={(id) => setLinkAlterId(id || "")}
              options={alterOptions} allowClear placeholder={tr("editSheet.linkAlter", { alter: terms.alter })} />
          </div>
        </div>
      </div>
    </SubSection>
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
      <ColorsSection v2={v2}>
        <BackgroundBlock background={background} onChange={writeBackground} wallpaper={wallpaper} />
      </ColorsSection>
      <PresetsSection v2={v2} />
    </div>
  );
}
