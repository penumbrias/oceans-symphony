// Display options — the app-wide inspector (v0.288.0), built to
// docs/inspector-design-guide.md: the same five-tab anatomy as the widget
// inspector. This file is the popup BODY; V2Frame's OptionsSheet and the
// home board's "Home screen" drawer mount it.
//
//  • A fixed tab strip — Text · Shape · Bars · Colour · Styles — one tab on
//    screen at a time (no accordion, no 4000px scroll).
//  • One row grammar (src/components/shared/SettingRows.jsx): name left,
//    control right; every size is an always-visible slider with the number
//    beside it; a value a bar inherits shows greyed and dashed, with a ×
//    to clear it.
//  • Bars: one bar at a time, chosen on a segmented row, each laid out the
//    same way — Show · Position · Size · Look · What's on it.
//  • Colour boxes open the shared picker with per-colour opacity; image
//    slots offer upload or the asset library; font pickers include the
//    user's custom fonts; the audio background doubles as the page song.
//
// Storage: nothing new. ui_v2 tokens via useV2Display (the one write
// path), the eight color roles via ThemeContext's customColors, the page
// background on the home-board field (ui_v2_home / _desktop), presets via
// the theme preset store (which already applies on fronting via
// alterThemeLinks).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { SlidersHorizontal, Plus, X, Copy, Pencil, Heart, PenLine, Zap, Activity as ActivityIcon, CheckSquare, Users, Timer, ChevronUp as ChevronUpIcon, ChevronDown as ChevronDownIcon, Undo2, Link2, Download, Upload, Type, Square, PanelTop, Palette, Star as StarIcon } from "lucide-react";
import { Row, StackedRow, Group, SwitchRow, Segmented, ChoiceRow, SliderRow, ColourRow, TabBar } from "@/components/shared/SettingRows";
import { useEdgeSafeSliders } from "@/lib/gestureExclusion";
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
import { pageForPath, readPageLook, hasPageLook, writePageLook } from "@/lib/pageLooks";
import { takeLookFocus, useLookSubject, LOOK_DEFAULTS_ID } from "@/lib/lookSubject";
import { readLookDefaults } from "@/lib/profileLookDefaults";
import ProfileLookTabs from "@/components/profile/ProfileLookTabs";
import { HOME_STYLES, getStyleLook } from "@/lib/homeStyles";
import { useNavigate, useLocation } from "react-router-dom";
import { buildApplyPatch, packToJson, applyAppTheme, savePackFile } from "@/lib/setupPacks";
import { lookToStyle, lookCoverage, resolveUserStyles, USER_STYLE_PREFIX, themeToLook, SHADOW_PRESETS, BORDER_STYLES } from "@/lib/widgetLook";
import { boxStyle } from "@/v2/primitives";
import { applyHomePresetToBoard, captureHomeLayout, captureHomeLook } from "@/lib/homePresetParts";
import { writeBoard, writeSettingsWithBoards, useBoardField } from "@/lib/boardWriter";
import { useTheme } from "@/lib/ThemeContext";
import { useFontOptions } from "@/lib/useFontOptions";
import {
  getAccessibilitySettings, setAccessibilityFontSize,
  setAccessibilityFontFamily, setAccessibilityHeadingFont,
  setAccessibilityLargeTouch, A11Y_CHANGED_EVENT,
} from "@/lib/useAccessibility";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { resolveBackground } from "@/components/v2/PageBackground";
import { useT } from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useIsWide } from "@/lib/useIsWide";
import { readPinnedBar, pinnedBarLook, pinnedBarPatch, pinnedBarLookPatch } from "@/lib/barsModel";
import BarShowSwitch, { useBarsChrome, useBarLabels } from "@/components/v2/BarShowSwitch";

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

// A ui_v2 token as a slider row — the value is always on screen with the
// number beside it (the old "set" button hid the slider until tapped).
function TokenSliderRow({ v2, id, label, hint }) {
  const def = tokenById[id];
  const value = v2.uiV2.tokens[id] ?? def.default;
  return (
    <SliderRow label={label || def.label} hint={hint} value={value} fallback={def.default}
      min={def.min} max={def.max} step={def.step} unit={def.unit || ""}
      onChange={(val) => v2.setToken(id, val)} />
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

// A choice among a few options — the inspector's ChoiceRow (segmented when
// it fits beside the name, chips otherwise). Kept under its old name so the
// bar sections read as before.
function PillRow({ label, options, value, onChange }) {
  return (
    <ChoiceRow label={label} value={value} onChange={onChange}
      options={options.map((o) => ({ value: o.v, label: o.label }))} />
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

// UI-size steps (mirrors the a11y engine's discrete scale) and the root
// font size each one sets (index.css html.a11y-text-*), shown as a %.
const SIZE_STEPS = ["xs3", "xs2", "xs", "sm", "default", "lg", "xl", "xl2", "xl3", "xl4", "xl5"];
const SIZE_PCT = { xs3: 50, xs2: 62.5, xs: 75, sm: 87.5, default: 100, lg: 112.5, xl: 125, xl2: 137.5, xl3: 150, xl4: 175, xl5: 200 };
const TOUCH_STEPS = ["default", "comfortable", "large"];

// − value + stepper — font sizes read as a number you nudge, not a knob
// hidden behind a button.
function StyleFlagButtons({ def, value = [], onChange }) {
  const toggle = (f) => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  return (
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
  );
}

// ── TEXT tab ───────────────────────────────────────────────────────────
// Body | Headings on one segmented row; the font, size and style of the
// chosen kind sit together under it, so a change can't bleed into the
// other kind. The preview at the top shows both.
function TextTab({ v2 }) {
  const tr = useT();
  const fontOptions = useFontOptions({ includeInherit: false });
  const [a11y, setA11y] = useState(() => getAccessibilitySettings());
  const refresh = () => setA11y(getAccessibilitySettings());
  // Undo/redo (UndoRedoHistory) sets these from outside — follow it.
  useEffect(() => {
    window.addEventListener(A11Y_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(A11Y_CHANGED_EVENT, refresh);
  }, []);
  const [kind, setKind] = useState("body");

  const sizeIdx = Math.max(0, SIZE_STEPS.indexOf(a11y.fontSize || "default"));
  const setBodySize = (i) => { setAccessibilityFontSize(SIZE_STEPS[Math.round(i)]); refresh(); };
  const hDef = tokenById.headerScale;
  const hScale = v2.uiV2.tokens.headerScale ?? hDef.default;

  return (
    <div>
      <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 mb-2" aria-hidden>
        <h3 className="font-display font-semibold leading-tight" style={{ fontSize: `${1.125 * hScale / 100}em` }}>
          {tr("editSheet.previewHeading")}
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">{tr("editSheet.previewBody")}</p>
      </div>
      <Segmented label={tr("editSheet.groupText")} value={kind} onChange={setKind}
        options={[{ value: "body", label: tr("editSheet.textBody") }, { value: "headings", label: tr("editSheet.textHeadings") }]} />
      {kind === "body" ? (
        <div className="pt-1">
          <Row label={tr("editSheet.font")} align="start">
            <span className="flex items-center gap-1.5 w-[11.5rem] max-w-full">
              <span className="flex-1 min-w-0">
                <SearchableSelect
                  value={a11y.fontFamily || "inter"}
                  onChange={(id) => { setAccessibilityFontFamily(id); refresh(); }}
                  options={fontOptions}
                  placeholder={tr("editSheet.fontBody")}
                />
              </span>
              <FontUploadButton onUploaded={(family) => { setAccessibilityFontFamily(family); refresh(); }} />
            </span>
          </Row>
          <SliderRow label={tr("editSheet.textSize")} value={sizeIdx} fallback={sizeIdx}
            min={0} max={SIZE_STEPS.length - 1} step={1}
            labels={SIZE_STEPS.map((k) => `${SIZE_PCT[k]}%`)} onChange={setBodySize} />
          <Row label={tr("editSheet.textStyle")}>
            <StyleFlagButtons def={tokenById.bodyStyle} value={v2.uiV2.tokens.bodyStyle ?? []}
              onChange={(val) => v2.setToken("bodyStyle", val)} />
          </Row>
        </div>
      ) : (
        <div className="pt-1">
          <Row label={tr("editSheet.font")} align="start">
            <span className="flex items-center gap-1.5 w-[11.5rem] max-w-full">
              <span className="flex-1 min-w-0">
                <SearchableSelect
                  value={a11y.headingFont || "default"}
                  onChange={(id) => { setAccessibilityHeadingFont(id); refresh(); }}
                  options={[{ id: "default", label: tr("editSheet.fontSameAsBody") }, ...fontOptions]}
                  placeholder={tr("editSheet.fontHeader")}
                />
              </span>
              <FontUploadButton onUploaded={(family) => { setAccessibilityHeadingFont(family); refresh(); }} />
            </span>
          </Row>
          <TokenSliderRow v2={v2} id="headerScale" label={tr("editSheet.textSizeRelative")} />
          <Row label={tr("editSheet.textStyle")}>
            <StyleFlagButtons def={tokenById.headerStyle} value={v2.uiV2.tokens.headerStyle ?? []}
              onChange={(val) => v2.setToken("headerStyle", val)} />
          </Row>
        </div>
      )}
    </div>
  );
}

// ── SHAPE tab — width, alignment, spacing, edges ───────────────────────
function ShapeTab({ v2 }) {
  const tr = useT();
  const [a11y, setA11y] = useState(() => getAccessibilitySettings());
  const refresh = () => setA11y(getAccessibilitySettings());
  // Undo/redo (UndoRedoHistory) sets these from outside — follow it.
  useEffect(() => {
    window.addEventListener(A11Y_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(A11Y_CHANGED_EVENT, refresh);
  }, []);
  const touchIdx = Math.max(0, TOUCH_STEPS.indexOf(a11y.largeTouch || "default"));
  const alignDef = tokenById.alignX;
  return (
    <div>
      <Group title={tr("editSheet.groupLayout")} first>
        <TokenSliderRow v2={v2} id="contentW" hint={tr("editSheet.contentWidthHint")} />
        <ChoiceRow label={alignDef.label} value={v2.uiV2.tokens.alignX ?? "center"}
          onChange={(val) => v2.setToken("alignX", val)}
          options={alignDef.options.map((o) => ({ value: o.v, label: o.label }))} />
        {/* Touch target spacing — the engine today is one all-sides scale;
            per-side values arrive with the engine work (spec notes this). */}
        <SliderRow label={tr("editSheet.touchSpacing")} value={touchIdx} fallback={touchIdx}
          min={0} max={TOUCH_STEPS.length - 1} step={1} labels={TOUCH_STEPS.map((k) => tr(`editSheet.touch.${k}`))}
          onChange={(i) => { setAccessibilityLargeTouch(TOUCH_STEPS[Math.round(i)]); refresh(); }} />
      </Group>
      <Group title={tr("editSheet.groupEdges")}>
        <TokenSliderRow v2={v2} id="borderW" label={tr("editSheet.borderW")} />
        <TokenSliderRow v2={v2} id="radius" label={tr("editSheet.radius")} />
      </Group>
    </div>
  );
}

// ── BAR SIZES + LAYOUT (spec §2 — page-level surfaces only) ───────────
// Each bar: show/hide, its real size/placement knobs, and its content
// arrangement where the engine has one (bottom-bar section order, quick
// action keys). Wave color rides SystemSettings like the classic picker.
// The wireframe's [SET 5] on each bar: per-bar border width, corner
// radius, font and text size, shadowing the global tokens on that bar
// only. Unset = inherit the app-wide value.
function BarLookRows({ v2, barId, look: lookIn = null, write: writeIn = null, onReset = null }) {
  const tr = useT();
  const fontOptions = useFontOptions({ includeInherit: true, inheritLabel: tr("editSheet.inherit") });
  // The pinned bar passes its own look/write (lib/barsModel.js owns where
  // that look lives); every other bar is ui_v2.barLooks[barId].
  const look = lookIn || v2.uiV2.barLooks?.[barId] || {};
  const write = writeIn || ((patch) => v2.write({ barLooks: { ...(v2.uiV2.barLooks || {}), [barId]: { ...look, ...patch } } }));
  const reset = onReset || (() => {
    const rest = { ...(v2.uiV2.barLooks || {}) };
    delete rest[barId];
    v2.write({ barLooks: rest });
  });
  const hasLook = Object.values(look).some((v) => v !== undefined && v !== null && v !== "");
  // Inherited (unset) values show the app-wide number greyed and dashed;
  // the × puts a value back to inherited.
  const slider = (key, labelKey, min, max, fallback, unit) => (
    <SliderRow label={tr(labelKey)} value={look[key]} fallback={fallback}
      min={min} max={max} step={key === "fontScale" ? 5 : 1} unit={unit}
      onChange={(v) => write({ [key]: Math.round(v) })}
      onClear={() => write({ [key]: undefined })} />
  );
  const colorRow = (key, opKey, labelKey, fallback) => (
    <ColourRow label={tr(labelKey)} value={look[key]} fallback={fallback}
      onChange={(v) => write({ [key]: v })}
      opacity={{ value: look[opKey], onChange: (v) => write({ [opKey]: v, ...(look[key] ? {} : { [key]: fallback }) }) }}
      onClear={() => write({ [key]: undefined, [opKey]: undefined })} />
  );
  const choice = (key, labelKey, values) => (
    <ChoiceRow label={tr(labelKey)} value={look[key] ?? ""} own={look[key] !== undefined}
      onClear={() => write({ [key]: undefined })}
      onChange={(v) => write({ [key]: v === "" ? undefined : v })}
      options={values.map((v) => ({ value: v, label: v }))} />
  );
  return (
    <>
      {slider("borderW", "editSheet.borderW", 0, 6, 1, "px")}
      {slider("radius", "editSheet.radius", 0, 24, 12, "px")}
      {slider("fontScale", "editSheet.textSize", 70, 160, 100, "%")}
      {slider("padding", "editSheet.innerSpacing", 0, 32, 8, "px")}
      <Row label={tr("editSheet.font")} align="start" own={!!look.font} onClear={() => write({ font: undefined })}>
        <span className="flex items-center gap-1.5 w-[11.5rem] max-w-full">
          <span className="flex-1 min-w-0">
            <SearchableSelect
              value={look.font || ""}
              onChange={(id) => write({ font: id || undefined })}
              options={fontOptions}
              placeholder={tr("editSheet.inherit")}
            />
          </span>
          <FontUploadButton onUploaded={(family) => write({ font: family })} />
        </span>
      </Row>
      {/* The same colour set every widget gets — highlight / background /
          text / border, each with its own opacity — plus gradient, shadow
          and border style. Unset = inherit the app look. */}
      {colorRow("accent", "accentOpacity", "editSheet.highlight", "#8b5cf6")}
      {colorRow("bg", "bgOpacity", "editSheet.background", "#111827")}
      {colorRow("textColor", "textOpacity", "editSheet.textColor", "#e5e7eb")}
      {colorRow("borderColor", "borderOpacity", "editSheet.borderColor", "#8b5cf6")}
      {/* Toggle-owned: gradient swatches only exist while it's on —
          always-visible pickers read as unrelated colours. */}
      <SwitchRow label={tr("editSheet.gradient")} checked={!!(look.gradFrom && look.gradTo)}
        onChange={(on) => on
          ? write({ gradFrom: look.gradFrom || "#312e81", gradTo: look.gradTo || "#831843" })
          : write({ gradFrom: undefined, gradTo: undefined, gradAngle: undefined, gradFromOpacity: undefined, gradToOpacity: undefined })} />
      {look.gradFrom && look.gradTo && (
        <div className="pl-3 border-l border-border/40">
          {colorRow("gradFrom", "gradFromOpacity", "editSheet.gradFrom", "#312e81")}
          {colorRow("gradTo", "gradToOpacity", "editSheet.gradTo", "#831843")}
          {slider("gradAngle", "editSheet.gradAngle", 0, 360, 135, "\u00b0")}
        </div>
      )}
      {choice("shadow", "editSheet.shadow", Object.keys(SHADOW_PRESETS))}
      {choice("borderStyle", "editSheet.borderStyle", BORDER_STYLES)}
      {hasLook && (
        <button type="button" onClick={reset}
          className="mt-2 text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
          {tr("editSheet.resetLook")}
        </button>
      )}
    </>
  );
}

// A bar's parts, in the same order on every bar: Show · Position · Size ·
// Look · What's on it. A part with nothing to offer is left out.
function BarPart({ label, children, first = false }) {
  return <Group title={label} first={first}>{children}</Group>;
}

function BarToggle({ label, on, onChange }) {
  return <SwitchRow label={label} checked={on} onChange={onChange} />;
}

// Default glyphs for the quick-action keys (mirrors V2Frame's KEY_ICONS) —
// shown on the change-icon button until the user picks another.
const KEY_ICON_DEFAULTS = { quick_checkin: Heart, quick_note: PenLine, start_activity: Zap, start_symptom: ActivityIcon, quick_thing: CheckSquare, set_front: Users, active_now: Timer };

function BarsTab({ v2, alignX }) {
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

  const tokenRow = (id, labelKey) => <TokenSliderRow v2={v2} id={id} label={tr(labelKey)} />;

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

  // The pinned bar: placement + look through lib/barsModel.js (it lives on
  // this device's ui_v2 — older records are moved across on first change);
  // its size and pins are the pinned config the gallery reads.
  const { v2Chrome } = useBarsChrome();
  const labels = useBarLabels();
  const wide = useIsWide();
  const pinnedBar = readPinnedBar(settingsRow);
  const pinnedLook = pinnedBarLook(settingsRow);
  const writePinnedBar = (patch) => writeSettings(pinnedBarPatch(settingsRow, patch));
  const writePinnedLook = (patch) => writeSettings(pinnedBarLookPatch(settingsRow, patch));
  const pinnedCfg = settingsRow?.pinned_alters_config || {};
  const writePinnedCfg = (patch) => writeSettings({
    pinned_alters_config: { ...pinnedCfg, ...patch },
  });
  const classicBars = v2.uiV2.classicBars;

  // One bar on screen at a time. Opened for one bar (openBarsEditor), that
  // bar is the one shown.
  const [bar, setBar] = useState(() => {
    let id = null;
    try { id = sessionStorage.getItem("os_bars_focus"); sessionStorage.removeItem("os_bars_focus"); } catch { /* storage off */ }
    return ["top", "tabs", "actions", "alters", "rail"].includes(id) ? id : "top";
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

  const actionsMode = v2.uiV2.tokens.actionsMode ?? "bar";
  const pinnedPlace = pinnedBar.mode === "bubble" ? "bubble" : pinnedBar.position;

  const barOptions = [
    { value: "top", label: labels.top }, { value: "tabs", label: labels.tabs },
    { value: "actions", label: labels.actions }, { value: "alters", label: labels.alters },
    ...(v2Chrome ? [{ value: "rail", label: labels.rail }] : []),
  ];
  const shownBar = bar === "rail" && !v2Chrome ? "top" : bar;

  return (
    <div>
      <ChoiceRow label={tr("editSheet.whichBar")} value={shownBar} onChange={setBar} options={barOptions} />
      {/* Classic chrome on a wide screen: whether the phone's bars come
          along beside the sidebar at all. */}
      {!v2Chrome && wide && (
        <BarToggle label={tr("editSheet.wideBars")} on={classicBars.wide === true}
          onChange={(on) => v2.write({ classicBars: { ...(settingsRow?.ui_v2?.classicBars || {}), wide: on } })} />
      )}

      {/* ── Top bar ── */}
      {shownBar === "top" && (<div data-bar-section="top">
        {!v2Chrome && <BarPart label={tr("editSheet.show")} first><BarShowSwitch barId="top" /></BarPart>}
        <BarPart label={tr("editSheet.partSize")}>
          {tokenRow("statusH", "editSheet.barHeight")}
        </BarPart>
        <BarPart label={tr("editSheet.partLook")}>
          <BarLookRows v2={v2} barId="top" alignX={alignX} />
          {v2Chrome && <BarShowSwitch barId="wave" label={tr("editSheet.wave")} />}
          {v2Chrome && v2.uiV2.bars.wave && (
            <StackedRow label={tr("editSheet.waveColor")}>
              <div className="flex gap-1.5 flex-wrap items-center">
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
                <ColorPicker compact caption={false} label={tr("editSheet.waveColor")}
                  value={waveCustom || "#7dd3fc"}
                  onChange={(hex) => writeSettings({ wave_color_custom: hex })}
                  onClear={() => writeSettings({ wave_color_custom: null })} />
              </div>
            </StackedRow>
          )}
        </BarPart>
        <BarPart label={tr("editSheet.partContent")}>
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
        </BarPart>
      </div>)}

      {/* ── Bottom tabs ── */}
      {shownBar === "tabs" && (<div data-bar-section="tabs">
        <BarPart label={tr("editSheet.show")} first><BarShowSwitch barId="tabs" /></BarPart>
        <BarPart label={tr("editSheet.partSize")}>
          {tokenRow("stripH", "editSheet.barHeight")}
        </BarPart>
        <BarPart label={tr("editSheet.partLook")}>
          <BarLookRows v2={v2} barId="tabs" alignX={alignX} />
        </BarPart>
        <BarPart label={tr("editSheet.partContent")}>
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
        </BarPart>
      </div>)}

      {/* ── Quick actions bar ── */}
      {shownBar === "actions" && (<div data-bar-section="actions">
        <BarPart label={tr("editSheet.show")} first><BarShowSwitch barId="actions" /></BarPart>
        <BarPart label={tr("editSheet.partPosition")}>
          <PillRow label={tr("editSheet.placement")} value={actionsMode}
            onChange={(val) => v2.setToken("actionsMode", val)} alignX={alignX}
            options={[
              { v: "bar", label: tr("editSheet.placementBar") },
              { v: "float", label: tr("editSheet.placementFloat") },
              { v: "bubble", label: tr("editSheet.placementBubble") },
            ]} />
          {/* No edge pill for float/bubble — they're freely repositioned by
              hold-and-drag, so a setting here just lied. */}
          {actionsMode === "bar" && (
            <PillRow label={tr("editSheet.actionsEdge")} value={v2.uiV2.tokens.actionsEdge ?? "bottom"}
              onChange={(val) => v2.setToken("actionsEdge", val)} alignX={alignX}
              options={[{ v: "bottom", label: tr("editSheet.bottom") }, { v: "top", label: tr("editSheet.top") }]} />
          )}
          {actionsMode === "bar" && (
            <PillRow label={tr("editSheet.actionsAttach")} value={v2.uiV2.tokens.actionsAttach ?? "float"}
              onChange={(val) => v2.setToken("actionsAttach", val)} alignX={alignX}
              options={[{ v: "float", label: tr("editSheet.attachFloat") }, { v: "attached", label: tr("editSheet.attachBar") }]} />
          )}
          {actionsMode === "bar" && (v2.uiV2.tokens.actionsEdge ?? "bottom") !== "top" && (
            <PillRow label={tr("editSheet.barsSwap")} value={v2.uiV2.tokens.barsSwap ?? "normal"}
              onChange={(val) => v2.setToken("barsSwap", val)} alignX={alignX} stacked
              options={[
                { v: "normal", label: tr("editSheet.barsSwapNormal") },
                { v: "swapped", label: tr("editSheet.barsSwapSwapped") },
              ]} />
          )}
          {actionsMode === "bar" && (
            <PillRow label={tr("editSheet.handleSides")} value={v2.uiV2.tokens.handleSides ?? "alters-left"}
              onChange={(val) => v2.setToken("handleSides", val)} alignX={alignX} stacked
              options={[
                { v: "alters-left", label: tr("editSheet.handleAltersLeft", { alters: terms.alters }) },
                { v: "alters-right", label: tr("editSheet.handleAltersRight", { alters: terms.alters }) },
              ]} />
          )}
        </BarPart>
        <BarPart label={tr("editSheet.partSize")}>
          {tokenRow("cmdSize", "editSheet.buttonSize")}
        </BarPart>
        <BarPart label={tr("editSheet.partLook")}>
          <BarLookRows v2={v2} barId="actions" alignX={alignX} />
        </BarPart>
        <BarPart label={tr("editSheet.partContent")}>
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
        </BarPart>
      </div>)}

      {/* ── Pinned alters bar ── */}
      {shownBar === "alters" && (<div data-bar-section="alters">
        <BarPart label={tr("editSheet.show")} first><BarShowSwitch barId="alters" /></BarPart>
        <BarPart label={tr("editSheet.partPosition")}>
          <PillRow label={tr("editSheet.placement")} value={pinnedPlace} stacked
            onChange={(val) => writePinnedBar(val === "bubble"
              ? { mode: "bubble", collapsed: false }
              : { mode: "bar", position: val, collapsed: false })} alignX={alignX}
            options={[
              { v: "top", label: tr("editSheet.top") }, { v: "bottom", label: tr("editSheet.bottom") },
              { v: "left", label: tr("editSheet.left") }, { v: "right", label: tr("editSheet.right") },
              { v: "bubble", label: tr("editSheet.placementBubble") },
            ]} />
          {(pinnedPlace === "top" || pinnedPlace === "bottom") && (
            <PillRow label={tr("editSheet.altersAttach")} value={pinnedBar.attached ? "attached" : "float"}
              onChange={(val) => writePinnedBar({ attached: val === "attached" })} alignX={alignX}
              options={[{ v: "float", label: tr("editSheet.attachFloat") }, { v: "attached", label: tr("editSheet.attachBar") }]} />
          )}
        </BarPart>
        <BarPart label={tr("editSheet.partSize")}>
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
          {pinnedCfg.barHeight > 0 && (
            <PillRow label={tr("editSheet.iconsSit")} value={pinnedLook.valign || "center"}
              onChange={(val) => writePinnedLook({ valign: val === "center" ? undefined : val })} alignX={alignX}
              options={[
                { v: "top", label: tr("editSheet.top") },
                { v: "center", label: tr("editSheet.middle") },
                { v: "bottom", label: tr("editSheet.bottom") },
              ]} />
          )}
        </BarPart>
        <BarPart label={tr("editSheet.partLook")}>
          <BarLookRows v2={v2} barId="alters" alignX={alignX}
            look={pinnedLook} write={writePinnedLook}
            onReset={() => writeSettings(pinnedBarLookPatch(settingsRow, {}, { replace: true }))} />
        </BarPart>
        {/* Pins, order, names, fronting emphasis, front levels — the same
            panel the Alters page uses for its pinned row. */}
        <BarPart label={tr("editSheet.partContent")}>
          <PinnedAltersConfigPanel />
        </BarPart>
      </div>)}

      {/* ── Side rail (new UI, wide screens) ── */}
      {v2Chrome && shownBar === "rail" && (
        <div data-bar-section="rail">
          <BarPart label={tr("editSheet.show")} first><BarShowSwitch barId="rail" /></BarPart>
          <BarPart label={tr("editSheet.partPosition")}>
            <PillRow label={tr("editSheet.alignEdge")} value={v2.uiV2.tokens.railSide ?? "left"}
              onChange={(val) => v2.setToken("railSide", val)} alignX={alignX}
              options={[{ v: "left", label: tr("editSheet.left") }, { v: "right", label: tr("editSheet.right") }]} />
          </BarPart>
          <BarPart label={tr("editSheet.partSize")}>
            {tokenRow("railW", "editSheet.barWidth")}
          </BarPart>
          <BarPart label={tr("editSheet.partLook")}>
            <BarLookRows v2={v2} barId="rail" alignX={alignX} />
          </BarPart>
          <BarPart label={tr("editSheet.partContent")}>
            <PillRow label={tr("editSheet.railContent")} value={v2.uiV2.tokens.railActions ?? "labels"}
              onChange={(val) => v2.setToken("railActions", val)} alignX={alignX}
              options={[{ v: "labels", label: tr("editSheet.labels") }, { v: "icons", label: tr("editSheet.icons") }]} />
          </BarPart>
        </div>
      )}
      <IconPicker open={!!iconFor} onClose={() => setIconFor(null)}
        title={iconFor ? `Icon for ${iconFor.label}` : "Choose an icon"}
        current={iconFor ? (v2.uiV2.icons?.[iconFor.kind]?.[iconFor.id]?.iconName || "") : ""}
        onPick={(o) => { if (iconFor) v2.setIcon(iconFor.kind, iconFor.id, o); }} />
    </div>
  );
}

// ── COLORS section — the eight roles from the wireframe ───────────────
const COLOR_ROLES = [
  ["bg", "editSheet.colorBackground"], ["surface", "editSheet.colorSurface"],
  ["primary", "editSheet.colorPrimary"], ["secondary", "editSheet.colorSecondary"],
  ["muted", "editSheet.colorMuted"],
  ["text-primary", "editSheet.colorTextBody"], ["text-secondary", "editSheet.colorTextHeader"],
];

function ColourTab({ children, v2 }) {
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
    <div>
      <Group title={tr("editSheet.groupAppColours")} first>
        {COLOR_ROLES.map(([key, labelKey]) => {
          const { hex, alpha } = splitHexAlpha(current(key));
          return (
            <ColourRow key={key} label={tr(labelKey)} value={hex || "#888888"}
              onChange={(h) => write(key, joinHexAlpha(h, alpha))}
              opacity={{ value: alpha, onChange: (a) => write(key, joinHexAlpha(hex || readCss(key), a)) }} />
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
            <ColourRow key="v2-highlight" label={tr("editSheet.colorHighlight")}
              hint={following ? tr("editSheet.followsPrimary") : null}
              value={following ? "" : hex} live={hex || "#888888"}
              onChange={(h) => v2.setToken("accent", joinHexAlpha(h, alpha))}
              opacity={{ value: alpha, onChange: (a) => v2.setToken("accent", joinHexAlpha(hex || readCss("primary"), a)) }}
              onClear={() => v2.setToken("accent", "")}
              extraAction={following ? null : { label: tr("editSheet.followPrimary"), onClick: () => v2.setToken("accent", "") }} />
          );
        })()}
      </Group>
      {children}
    </div>
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
    <Group title={tr("editSheet.background")}>
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
            <SliderRow label={tr("editSheet.gradAngle")} value={bg.gradient.angle} fallback={135} min={0} max={360} step={15} unit="°"
              onChange={(v) => patchGrad({ angle: Math.round(v) })} />
          )}
          <SliderRow label={tr("editSheet.gradStrength")} value={bg.gradient.strength} fallback={100} min={0} max={100} step={5} unit="%"
            onChange={(v) => patchGrad({ strength: Math.round(v) })} />
        </div>
      )}

      {singleImage && (
        <div className="space-y-1 py-1">
          <PillRow stacked label={tr("editSheet.bgPosition")} value={imageCfg.position || "cover"}
            onChange={(v) => patch({ type: "image", image: { ...imageCfg, position: v } })}
            options={POSITIONS.map((p) => ({ v: p, label: tr(`editSheet.pos.${p}`) }))} />
          {assetFolders.length > 0 && (
            <Row label={tr("editSheet.wallFolder")} align="start">
              <span className="block w-[11.5rem] max-w-full">
                <SearchableSelect
                  value={imageCfg.folder || null}
                  onChange={(folder) => patch({ type: "image", image: { ...imageCfg, folder: folder || "" } })}
                  options={assetFolders.map((f) => ({ id: f, label: f }))}
                  placeholder={tr("editSheet.wallFolderNone")}
                  searchPlaceholder={tr("editSheet.wallFolderNone")}
                  allowClear
                />
              </span>
            </Row>
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
      <StackedRow label={tr("editSheet.pageSong")}>
        <ProfileSongPicker value={bg.audio} onChange={(song) => patch({ audio: song })} subjectLabel="page" />
      </StackedRow>
    </Group>
  );
}

// ── PRESETS section ────────────────────────────────────────────────────
// Rides the theme-preset store — the store that already applies a linked
// preset when an alter starts fronting.
const SIZE_TOKEN_IDS = ["contentW", "radius", "borderW", "density", "stripH", "cmdSize", "railW", "statusH", "alignX", "alignY", "headerScale", "bodyStyle", "headerStyle"];

function StylesTab({ v2 }) {
  const tr = useT();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    themeMode, selectedTheme, customColors, allPresets,
    userCustomPresets, saveCustomPreset, deleteUserPreset,
    alterThemeLinks, linkAlterTheme, unlinkAlterTheme,
    clearCustomColors, setSelectedTheme, setThemeMode, updateCustomColorsFull,
  } = useTheme();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsRows[0] || null;
  // The board this sheet was opened on — the home screen or the widget
  // board (v0.277.0: this was always the widget board, so a change made
  // while editing the home screen landed somewhere else).
  const homeField = useBoardField();
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

  // Setup packs saved from previous imports (SystemSettings.ui_v2_setup_packs).
  const savedPacks = Array.isArray(settingsRow?.ui_v2_setup_packs) ? settingsRow.ui_v2_setup_packs : [];
  const openPackSheet = (packTab) => {
    if (location.pathname === "/") {
      window.dispatchEvent(new CustomEvent("os-v2-pack-sheet", { detail: { tab: packTab } }));
    } else {
      try { sessionStorage.setItem("symphony_v2_pack-sheet", packTab); } catch { /* storage off */ }
      navigate("/");
    }
  };
  const applySavedPack = async (pk) => {
    if (!settingsRow?.id) return;
    try {
      const patch = buildApplyPatch({ pack: pk, which: { layout: true, widgetStyles: true, uiTheme: true }, settingsRow, homeField });
      await writeSettingsWithBoards(settingsRow, patch);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      applyAppTheme(pk.types?.uiTheme?.appTheme);
      toast.success(`${pk.title || "Pack"} applied`);
    } catch (e) { toast.error(e?.message || "Couldn't apply the pack"); }
  };
  const downloadSavedPack = async (pk) => {
    const blob = new Blob([packToJson(pk)], { type: "application/json" });
    const filename = `${(pk.title || "symphony-setup").replace(/[^\w-]+/g, "-").toLowerCase()}.symphony-pack.json`;
    const res = await savePackFile(blob, filename);
    if (res?.result === "failed") toast.error("Couldn't save the file");
    else if (res?.result === "downloaded" && res.location) toast.success(`Saved to ${res.location}`);
  };
  const deleteSavedPack = async (pk) => {
    if (!settingsRow?.id) return;
    try {
      await base44.entities.SystemSettings.update(settingsRow.id, {
        ui_v2_setup_packs: savedPacks.filter((x) => x.id !== pk.id),
      });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };

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
      uiV2HomeLook: captureHomeLook(settingsRow?.[homeField]),
      uiV2HomeLayout: captureHomeLayout(settingsRow?.[homeField]),
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
      payload.uiV2HomeLook = captureHomeLook(settingsRow?.[homeField]);
    }
    if (parts.layout) {
      payload.uiV2HomeLayout = captureHomeLayout(settingsRow?.[homeField]);
    }
    // Which board the home parts came from, so applying the preset when
    // someone starts fronting lands them on the same board.
    if (parts.widgets || parts.layout) payload.homeField = homeField;
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
    await writeBoard(settingsRow, homeField, (cur) => ({ ...(cur || {}), styleMode: st.id }), { extra: patch });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
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
    await writeSettings(patch);
    // The board part goes through the shared writer: applied to the board
    // as it is now and stamped, so the next sync can't quietly undo it.
    if (settingsRow?.id && applyHomePresetToBoard(preset, settingsRow?.[homeField])) {
      await writeBoard(settingsRow, homeField, (cur) => applyHomePresetToBoard(preset, cur));
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    }
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
    // A preset that saved none of the above (only terms, navigation,
    // banner, wave or corner) used to show on NEITHER tab — the user's
    // own preset just vanished from the list. List it under Style.
    if (!covers.length) covers.push({ id: "colors", label: tr("editSheet.partOther") });
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
    <div className="space-y-2">
      {/* Style | Layout + search — one list underneath. */}
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

      {/* ── Setup packs — whole-setup share/import (the "texture pack"
          flow), plus the packs saved from previous imports. The sheet
          itself lives on the home board, so off-home these navigate
          there first (same pattern as the bar-options deep link). */}
      <div className="pt-2 mt-2 border-t border-border/40 space-y-1.5">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Setup packs</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => openPackSheet("export")}
            className="text-xs px-2.5 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Download className="w-3 h-3" /> Share as a pack…
          </button>
          <button type="button" onClick={() => openPackSheet("import")}
            className="text-xs px-2.5 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Upload className="w-3 h-3" /> Import a pack…
          </button>
        </div>
        {savedPacks.length > 0 && (
          <div className="space-y-1">
            {savedPacks.map((pk) => (
              <div key={pk.id} className="flex items-center gap-1.5 rounded-lg border border-border/40 px-2 py-1.5">
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{pk.title || "Untitled pack"}</span>
                  <span className="text-[0.625rem] text-muted-foreground">
                    {["layout", "widgetStyles", "uiTheme"].filter((k) => pk.types?.[k]).map((k) => (
                      { layout: "layout", widgetStyles: "widget styles", uiTheme: "UI theme" }[k]
                    )).join(" · ") || "empty"}
                  </span>
                </span>
                <button type="button" onClick={() => applySavedPack(pk)}
                  className="text-[0.6875rem] px-2 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex-shrink-0">
                  Apply
                </button>
                <button type="button" onClick={() => downloadSavedPack(pk)} aria-label={`Download ${pk.title || "pack"}`} title="Download"
                  className="w-6 h-6 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center justify-center flex-shrink-0">
                  <Download className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => deleteSavedPack(pk)} aria-label={`Delete ${pk.title || "pack"}`} title="Delete"
                  className="w-6 h-6 rounded-full border border-border/50 text-muted-foreground hover:text-destructive flex items-center justify-center flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── The popup body ─────────────────────────────────────────────────────
// ── The scope row (v0.310.0) ──────────────────────────────────────────
// Everywhere · This page · New <alter> profiles. "This page" is the page
// the sheet was opened on (its own background and song, pageLooks.js). The
// home page is the board, whose background is already the Everywhere one,
// so it has no page scope. A profile page has its own sheet (Profile
// style, ProfileLookSheet) for ITS look; here it offers the defaults every
// new or empty profile of that kind starts with (profileLookDefaults.js,
// v0.313.0) — the same tabs, written to SystemSettings.
function PageLookTab({ settingsRow, page }) {
  const tr = useT();
  const qc = useQueryClient();
  const look = readPageLook(settingsRow, page.id);
  const background = resolveBackground(look?.background);
  const write = async (next) => {
    if (!settingsRow?.id) return;
    await writePageLook(settingsRow, page.id, (cur) => ({ ...(cur || {}), background: next }));
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const reset = async () => {
    if (!settingsRow?.id) return;
    await writePageLook(settingsRow, page.id, null);
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  return (
    <div>
      <p className="text-[0.6875rem] text-muted-foreground pt-2">{tr("editSheet.scopePageHint", { page: page.label })}</p>
      <BackgroundBlock background={background} onChange={write} wallpaper={{}} />
      <div className="pt-4 pb-2">
        <button type="button" onClick={reset}
          className="w-full h-9 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground">
          {tr("editSheet.scopePageReset")}
        </button>
      </div>
    </div>
  );
}

export default function UiEditSheet() {
  const v2 = useV2Display();
  const qc = useQueryClient();
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsRows[0] || null;

  // The board this sheet was opened on (home screen or widget board).
  const homeField = useBoardField();
  const background = resolveBackground(settingsRow?.[homeField]?.background);
  const writeBackground = async (next) => {
    if (!settingsRow?.id) return;
    await writeBoard(settingsRow, homeField, (cur) => ({ ...(cur || {}), background: next }));
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const wallpaper = settingsRow?.[homeField]?.wallpaper || {};

  const alignX = (v2.uiV2.tokens.alignX ?? "center") === "right" ? "right" : "left";
  const tr = useT();
  const terms = useTerms();

  // Where the sheet is: a page of the app with a look of its own, or a
  // profile (whose KIND has defaults to edit here).
  const location = useLocation();
  const page = useMemo(() => pageForPath(location.pathname), [location.pathname]);
  const subject = useLookSubject();
  const defaultsType = subject?.type || (location.pathname === "/Home" ? "alter" : null);
  const defaultsLabel = defaultsType ? ({
    alter: `New ${terms.alter} profiles`, group: "New group profiles", location: "New location profiles",
  }[defaultsType]) : "";
  const defaultsSubject = useMemo(() => (defaultsType ? {
    type: defaultsType, id: LOOK_DEFAULTS_ID, label: defaultsLabel,
    customFields: readLookDefaults(settingsRow, defaultsType),
    hint: `The look every ${defaultsType === "alter" ? terms.alter : defaultsType} profile starts with, and what empty ones show. A profile's own Profile style always wins, setting by setting.`,
  } : null), [defaultsType, defaultsLabel, settingsRow, terms.alter]);
  const pageLabel = page ? ({
    alters: terms.Alters, checkin: `${terms.System} Meeting`,
    "system-map": `${terms.System} Map`, "system-history": `${terms.System} History`,
  }[page.id] || page.label) : "";
  const scopes = [
    { value: "app", label: tr("editSheet.scopeApp") },
    ...(page ? [{ value: "page", label: pageLabel }] : []),
    ...(defaultsSubject ? [{ value: "defaults", label: defaultsLabel }] : []),
  ];
  // Opened for one bar (openBarsEditor) → land on Bars; opened for this
  // page's look (openPageLook) → land on the page.
  const [scope, setScope] = useState(() => {
    const focus = takeLookFocus();
    if (focus === "page" && page) return "page";
    return "app";
  });
  const effectiveScope = scopes.some((s) => s.value === scope) ? scope : "app";
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem("os_bars_focus") ? "bars" : "text"; } catch { return "text"; }
  });
  const tabs = [
    { id: "text", label: tr("editSheet.tabText"), icon: Type },
    { id: "shape", label: tr("editSheet.tabShape"), icon: Square },
    { id: "bars", label: tr("editSheet.bars"), icon: PanelTop },
    { id: "colour", label: tr("editSheet.tabColour"), icon: Palette },
    { id: "styles", label: tr("editSheet.tabStyles"), icon: StarIcon },
  ];
  // A tab change starts at the top of the panel — the host scrolls, so
  // this scrolls the nearest scrolling ancestor.
  const panelRef = useRef(null);
  const scrollTop = () => {
    let el = panelRef.current?.parentElement;
    while (el && el !== document.body) {
      const ov = getComputedStyle(el).overflowY;
      if (ov === "auto" || ov === "scroll") { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  };
  const pickTab = (id) => { setTab(id); scrollTop(); };
  const pickScope = (id) => { setScope(id); scrollTop(); };
  const [defaultsTab, setDefaultsTab] = useState("colour");
  const pickDefaultsTab = (id) => { setDefaultsTab(id); scrollTop(); };
  useEdgeSafeSliders(true, [tab, effectiveScope, defaultsTab]);

  return (
    <div ref={panelRef}>
      {scopes.length > 1 && (
        <div className="pb-1.5" data-display-scope={effectiveScope}>
          <Segmented label={tr("editSheet.scope")} value={effectiveScope} onChange={pickScope} options={scopes} />
        </div>
      )}
      {effectiveScope === "defaults" && defaultsSubject ? (
        <ProfileLookTabs subject={defaultsSubject} tab={defaultsTab} onTab={pickDefaultsTab} />
      ) : effectiveScope === "page" && page ? (
        <>
          <div className="sticky -top-1 z-10 -mx-4 bg-background">
            <TabBar tabs={[{ id: "colour", label: tr("editSheet.tabColour"), icon: Palette, dot: hasPageLook(settingsRow, page.id) }]} value="colour" onChange={() => {}} />
          </div>
          <div role="tabpanel" aria-labelledby="inspector-tab-colour" className="pt-2">
            <PageLookTab settingsRow={settingsRow} page={page} />
          </div>
        </>
      ) : (
        <>
          {/* The tab strip stays put while the panel scrolls (the hosts give it
              a scrolling container with 16px side padding, hence the -mx-4). */}
          <div className="sticky -top-1 z-10 -mx-4 bg-background">
            <TabBar tabs={tabs} value={tab} onChange={pickTab} />
          </div>
          <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`} className="pt-2">
            {tab === "text" && <TextTab v2={v2} />}
            {tab === "shape" && <ShapeTab v2={v2} />}
            {tab === "bars" && <BarsTab v2={v2} alignX={alignX} />}
            {tab === "colour" && (
              <ColourTab v2={v2}>
                <BackgroundBlock background={background} onChange={writeBackground} wallpaper={wallpaper} />
              </ColourTab>
            )}
            {tab === "styles" && <StylesTab v2={v2} />}
          </div>
        </>
      )}
    </div>
  );
}
