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

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { SlidersHorizontal, Plus, X, Star, Copy, Pencil, Link2 } from "lucide-react";
import { SubSection } from "@/components/settings/SettingsUI";
import ColorPicker from "@/components/shared/ColorPicker";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useV2Display } from "@/components/settings/V2DisplaySettings";
import { V2_TOKEN_DEFS } from "@/lib/uiV2";
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

function PillRow({ label, options, value, onChange, alignX }) {
  return (
    <div className={`flex items-center gap-2.5 py-1 ${alignX === "right" ? "flex-row-reverse" : ""}`}>
      <span className="text-xs font-medium flex-1 min-w-0 truncate">{label}</span>
      <div className="flex gap-1.5 flex-wrap justify-end">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              value === o.v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
            }`}>{o.label}</button>
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
        <SetRow label={tr("editSheet.fontSize")} valueLabel={SIZE_STEPS[sizeIdx]} alignX={alignX}>
          <input type="range" min={0} max={SIZE_STEPS.length - 1} step={1} value={sizeIdx}
            onChange={(e) => { setAccessibilityFontSize(SIZE_STEPS[parseInt(e.target.value, 10)]); refresh(); }}
            className="w-full" aria-label={tr("editSheet.fontSize")} />
        </SetRow>
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

function ColorsSection() {
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
    </SubSection>
  );
}

// ── BACKGROUND section ─────────────────────────────────────────────────

function ImageSlot({ url, onPick, onClear, title }) {
  const resolved = useResolvedAvatarUrl(url || "");
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-8 h-8 rounded-lg border border-border overflow-hidden flex items-center justify-center bg-muted/30">
        {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" /> : null}
      </span>
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

function BackgroundSection({ background, onChange }) {
  const tr = useT();
  const bg = background;
  const patch = (p) => onChange({ ...bg, ...p });
  const patchGrad = (p) => patch({ gradient: { ...bg.gradient, ...p } });

  const POSITIONS = ["cover", "fill", "tile", "stretch", "center"];

  return (
    <SubSection title={tr("editSheet.background")}>
      <PillRow label={tr("editSheet.bgType")} value={bg.type} onChange={(v) => patch({ type: v })}
        options={[
          { v: "none", label: tr("editSheet.bgNone") },
          { v: "flat", label: tr("editSheet.bgFlat") },
          { v: "gradient", label: tr("editSheet.bgGradient") },
          { v: "image", label: tr("editSheet.bgImage") },
        ]} />

      {bg.type === "flat" && (
        <div className="flex items-center gap-2.5 py-1">
          <span className="text-xs font-medium flex-1">{tr("editSheet.bgFlat")}</span>
          <ColorPicker compact value={splitHexAlpha(bg.flat.color).hex || "#222233"}
            onChange={(h) => patch({ flat: { ...bg.flat, color: joinHexAlpha(h, splitHexAlpha(bg.flat.color).alpha), image: "" } })}
            opacity={{
              value: splitHexAlpha(bg.flat.color).alpha,
              onChange: (a) => patch({ flat: { ...bg.flat, color: joinHexAlpha(splitHexAlpha(bg.flat.color).hex || "#222233", a) } }),
            }} />
          <ImageSlot url={bg.flat.image} title={tr("editSheet.bgImage")}
            onPick={(url) => patch({ flat: { color: "", image: url } })}
            onClear={() => patch({ flat: { ...bg.flat, image: "" } })} />
        </div>
      )}

      {bg.type === "gradient" && (
        <div className="space-y-2 py-1">
          {bg.gradient.stops.map((stop, i) => {
            const { hex, alpha } = splitHexAlpha(stop.color);
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 flex-shrink-0 tabular-nums">{i + 1}</span>
                <ColorPicker compact value={hex || "#4f46e5"}
                  onChange={(h) => {
                    const stops = bg.gradient.stops.map((s, j) => (j === i ? { color: joinHexAlpha(h, alpha), image: "" } : s));
                    patchGrad({ stops });
                  }}
                  opacity={{
                    value: alpha,
                    onChange: (a) => {
                      const stops = bg.gradient.stops.map((s, j) => (j === i ? { ...s, color: joinHexAlpha(hex || "#4f46e5", a) } : s));
                      patchGrad({ stops });
                    },
                  }} />
                {/* A stop can be an image instead of a color (spec). */}
                <ImageSlot url={stop.image} title={tr("editSheet.gradStopImage")}
                  onPick={(url) => {
                    const stops = bg.gradient.stops.map((s, j) => (j === i ? { color: "", image: url } : s));
                    patchGrad({ stops });
                  }}
                  onClear={() => {
                    const stops = bg.gradient.stops.map((s, j) => (j === i ? { ...s, image: "" } : s));
                    patchGrad({ stops });
                  }} />
                {bg.gradient.stops.length > 2 && (
                  <button type="button" aria-label={tr("editSheet.gradRemoveStop")}
                    onClick={() => patchGrad({ stops: bg.gradient.stops.filter((_, j) => j !== i) })}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-destructive ml-auto">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => patchGrad({ stops: [...bg.gradient.stops, { color: "#888888", image: "" }] })}
            className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground flex items-center gap-1">
            <Plus className="w-3 h-3" /> {tr("editSheet.gradAddStop")}
          </button>
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

      {bg.type === "image" && (
        <div className="space-y-2 py-1">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium flex-1">{tr("editSheet.bgImage")}</span>
            <ImageSlot url={bg.image.url} title={tr("editSheet.bgImage")}
              onPick={(url) => patch({ image: { ...bg.image, url } })}
              onClear={() => patch({ image: { ...bg.image, url: "" } })} />
          </div>
          <PillRow label={tr("editSheet.bgPosition")} value={bg.image.position}
            onChange={(v) => patch({ image: { ...bg.image, position: v } })}
            options={POSITIONS.map((p) => ({ v: p, label: tr(`editSheet.pos.${p}`) }))} />
        </div>
      )}

      {/* Audio background = the page song (same controls as profile music). */}
      <div className="pt-2 border-t border-border/30">
        <p className="text-xs font-medium mb-1.5">{tr("editSheet.pageSong")}</p>
        <ProfileSongPicker value={bg.audio} onChange={(song) => patch({ audio: song })} subjectLabel="page" />
      </div>
    </SubSection>
  );
}

// ── PRESETS section ────────────────────────────────────────────────────
// Rides the theme-preset store — the store that already applies a linked
// preset when an alter starts fronting.
const SIZE_TOKEN_IDS = ["contentW", "radius", "borderW", "density", "stripH", "cmdSize", "railW", "statusH", "alignX", "alignY"];

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

  const alignX = (v2.uiV2.tokens.alignX ?? "center") === "right" ? "right" : "left";

  return (
    <div className="space-y-2">
      <SizeSection v2={v2} alignX={alignX} />
      <ColorsSection />
      <BackgroundSection background={background} onChange={writeBackground} />
      <PresetsSection v2={v2} />
    </div>
  );
}
