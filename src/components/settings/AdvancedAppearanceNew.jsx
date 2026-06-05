import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/lib/ThemeContext';
import { HexColorPicker } from 'react-colorful';
import {
  APP_FONT_OPTIONS, EXTRA_FONT_OPTIONS, FONT_CATEGORY_LABELS,
  getAccessibilitySettings, setAccessibilityFontFamily, setAccessibilityFontSize, findFontOption,
  setAccessibilityHeadingFont, HEADING_FONT_OPTIONS,
} from '@/lib/useAccessibility';
import { isExtraFontsInstalled, installExtraFonts, uninstallExtraFonts } from '@/lib/fontPacks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, ChevronDown, Search, Check, Trash2, Unlink, Save, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTerms } from '@/lib/useTerms';
import '@/lib/editorFonts.js'; // ensure all bundled fonts are loaded
import { WAVE_COLOR_KEYS, WAVE_COLOR_LABELS, readWaveColorKey } from '@/lib/waveColorKey';
import { SubSection } from '@/components/settings/SettingsUI';
import { UiSizeControl, TouchTargetControl, NavHeightControl } from './DisplaySizeControls';
import ThemeModeChip from './ThemeModeChip';
import CornerStyleSettings from './CornerStyleSettings';
import DashboardLayoutSettings from './DashboardLayoutSettings';
import NavigationSettings from './NavigationSettings';
import UpcomingPlansSurfacesSection from './UpcomingPlansSurfacesSection';
import { isNative } from '@/lib/platform';

const BASIC_THEMES = ['warm', 'cool', 'forest', 'sunset', 'ocean', 'berry', 'charcoal', 'ivory'];

const COLOR_LABELS = {
  bg: 'Background', surface: 'Surface', primary: 'Primary',
  secondary: 'Secondary', accent: 'Accent', muted: 'Muted',
  'text-primary': 'Text', 'text-secondary': 'Text 2nd',
};

// Anchored popover portaled to <body> with fixed positioning, so dropdowns
// inside the collapsible Theme SubSection (which is overflow-hidden) aren't
// clipped. Handles position tracking + outside-click close (counting both the
// anchor and the portaled content as "inside").
function AnchoredPortal({ anchorRef, open, onClose, align = 'left', width, maxHeight, children }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });
  useLayoutEffect(() => {
    if (!open) return undefined;
    const compute = () => {
      const n = anchorRef.current;
      if (!n) return;
      const r = n.getBoundingClientRect();
      const w = Math.min(width || r.width, window.innerWidth - 16);
      let left = align === 'right' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: r.bottom + 4, left, width: w });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('orientationchange', compute);
    };
  }, [open, anchorRef, width, align]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, anchorRef, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight, zIndex: 100000 }}
    >
      {children}
    </div>,
    document.body
  );
}

// ── Font Picker ──────────────────────────────────────────────────────────────
function FontPicker({ currentFont, onSelect, options = APP_FONT_OPTIONS, resolveCurrent }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const triggerRef = useRef(null);

  const currentOption = resolveCurrent
    ? resolveCurrent(currentFont)
    : findFontOption(currentFont);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const result = {};
    for (const f of options) {
      if (q && !f.label.toLowerCase().includes(q)) continue;
      const cat = f.category || 'ui';
      if (!result[cat]) result[cat] = [];
      result[cat].push(f);
    }
    return result;
  }, [search, options]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const isSelected = (f) =>
    f.value === currentFont || (f.legacy && f.legacy === currentFont);

  const previewFontFor = (f) => f.value === 'default' ? "'DM Serif Display', 'Playfair Display', serif" : f.value;
  const triggerFont = previewFontFor(currentOption);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-input bg-background hover:bg-muted/30 transition-colors text-sm"
        style={{ fontFamily: triggerFont }}
      >
        <span className="font-medium">{currentOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnchoredPortal anchorRef={triggerRef} open={open} onClose={() => setOpen(false)}>
        <div className="bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fonts…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {Object.entries(grouped).map(([cat, fonts]) => (
              <div key={cat}>
                <p className="px-2 pt-2 pb-1 text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider">
                  {FONT_CATEGORY_LABELS[cat] || cat}
                </p>
                {fonts.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { onSelect(f.value); setOpen(false); setSearch(''); }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isSelected(f) ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40 text-foreground'
                    }`}
                    style={{ fontFamily: previewFontFor(f) }}
                  >
                    <span>{f.label}</span>
                    {isSelected(f) && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-4">No fonts match</p>
            )}
          </div>
        </div>
      </AnchoredPortal>
    </div>
  );
}

// ── Color swatch button ───────────────────────────────────────────────────────
function ColorSwatch({ label, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Edit ${label}`}
      className="flex flex-col items-center gap-1 group"
    >
      <div
        className="w-10 h-10 rounded-xl border-2 border-border/50 group-hover:border-primary/60 transition-colors shadow-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-[0.625rem] text-muted-foreground group-hover:text-foreground">{label}</span>
    </button>
  );
}

// Picker for which colour the header's animated wave fills with. The
// user can pick one of the eight palette swatches, turn the wave Off,
// or pick a fully custom hex.
//
// Palette picks write SystemSettings.wave_color_key (one of
// WAVE_COLOR_KEYS) — HeaderWaveBlock reads that today.
//
// A fully-custom hex writes SystemSettings.wave_color_custom. NOTE:
// HeaderWaveBlock currently only reads wave_color_key, so a custom hex
// is stored but won't render until HeaderWaveBlock + waveColorKey.js
// are taught to prefer wave_color_custom (flagged for the main agent).
// The palette swatches read live CSS vars so they always match the
// active theme.
function WaveColorSwatch() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0];
  const currentKey = readWaveColorKey(settings);
  const customHex = typeof settings?.wave_color_custom === 'string' ? settings.wave_color_custom : '';
  const usingCustom = !!customHex;

  const persist = async (patch) => {
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, patch);
      } else {
        await base44.entities.SystemSettings.create(patch);
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      console.warn("[WaveColorSwatch] save failed:", e?.message || e);
    }
  };

  // Map a wave key to a live CSS colour for the swatch fill.
  const cssVarFor = (key) => key === "text-2nd"
    ? "var(--color-text-secondary)"
    : key === "text"
      ? "var(--color-text-primary)"
      : `var(--color-${key})`;

  const pickPaletteKey = (key) => {
    // Clearing the custom hex when picking a palette key keeps the two
    // mutually exclusive — a palette pick always wins.
    persist({ wave_color_key: key, wave_color_custom: null });
    setOpen(false);
  };

  const pickCustom = (hex) => {
    persist({ wave_color_custom: hex });
  };

  // What the trigger swatch should show.
  const triggerStyle = currentKey === "background" && !usingCustom
    ? undefined
    : { backgroundColor: usingCustom ? customHex : cssVarFor(currentKey) };
  const triggerIsOff = currentKey === "background" && !usingCustom;

  return (
    <div className="relative flex flex-col items-center gap-1">
      <span className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider">Wave</span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Header wave colour"
        className="w-14 h-14 rounded-xl border-2 border-border/60 hover:border-primary/60 transition-colors shadow-sm flex items-center justify-center overflow-hidden"
        style={triggerStyle}
      >
        {triggerIsOff && <span className="text-lg text-muted-foreground leading-none">⊘</span>}
      </button>
      <span className="text-[0.625rem] text-muted-foreground">
        {usingCustom ? 'Custom' : WAVE_COLOR_LABELS[currentKey]}
      </span>

      <AnchoredPortal anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} align="right" width={240}>
        <div className="bg-background border-2 border-border rounded-xl shadow-2xl p-3 space-y-3">
          <p className="text-[0.6875rem] text-muted-foreground leading-snug">
            Colour of the header's animated wave (shown at 0.3 opacity). Pick a palette colour, turn it Off, or set a custom one.
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {WAVE_COLOR_KEYS.map((key) => {
              const isOff = key === "background";
              const isCurrent = !usingCustom && currentKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickPaletteKey(key)}
                  title={WAVE_COLOR_LABELS[key]}
                  className={`flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg border transition-all ${
                    isCurrent ? "border-primary/60 bg-primary/10" : "border-border/50 hover:bg-muted/30"
                  }`}
                >
                  {isOff ? (
                    <div className="w-6 h-6 rounded-md border-2 border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
                      <span className="text-sm leading-none">⊘</span>
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-md border-2 border-border overflow-hidden">
                      <div className="w-full h-full" style={{ backgroundColor: cssVarFor(key) }} />
                    </div>
                  )}
                  <span className={`text-[0.5625rem] leading-none ${isCurrent ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {WAVE_COLOR_LABELS[key]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="space-y-2 pt-1 border-t border-border/40">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider">Custom colour</span>
              {usingCustom && (
                <button
                  type="button"
                  onClick={() => persist({ wave_color_custom: null })}
                  className="text-[0.625rem] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Use palette
                </button>
              )}
            </div>
            <HexColorPicker
              color={usingCustom ? customHex : (cssVarFor(currentKey).startsWith('#') ? customHex : '#94A3B8')}
              onChange={pickCustom}
              style={{ width: '100%', height: 120 }}
            />
          </div>
        </div>
      </AnchoredPortal>
    </div>
  );
}

// Built-in preset picker as a dropdown that shows each theme's colours as a
// swatch (a gradient of its bg → primary), matching the wireframe.
function BuiltInPresetDropdown({ presets, names, selectedTheme, customColors, onSelect }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const activeName = !customColors && names.includes(selectedTheme) ? selectedTheme : null;
  const swatch = (name) => {
    const p = presets[name];
    return p ? `linear-gradient(135deg, ${p.light.bg}, ${p.light.primary})` : '';
  };
  const triggerName = activeName || names[0];
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Built-in preset</p>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-input bg-background hover:bg-muted/30 transition-colors text-sm"
        >
          <span className="w-6 h-6 rounded-md border border-border/50 flex-shrink-0" style={{ backgroundImage: swatch(triggerName) }} />
          <span className="flex-1 text-left capitalize font-medium">{customColors ? 'Custom' : triggerName}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <AnchoredPortal anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} maxHeight="18rem">
          <div className="bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto p-1">
            {names.map((name) => {
              const isActive = activeName === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => { onSelect(name); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40'}`}
                >
                  <span className="w-7 h-7 rounded-md border border-border/50 flex-shrink-0" style={{ backgroundImage: swatch(name) }} />
                  <span className="flex-1 text-left capitalize font-medium">{name}</span>
                  {isActive && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </AnchoredPortal>
      </div>
    </div>
  );
}

// What a saved preset can capture. Keyed so the Save form can render a
// checkbox per group and only the checked groups end up in the payload.
const PRESET_PARTS = [
  { id: 'colors',     label: 'Colours' },
  { id: 'fonts',      label: 'Fonts' },
  { id: 'uiSize',     label: 'UI size' },
  { id: 'themeMode',  label: 'Theme mode (light/dark)' },
  { id: 'wave',       label: 'Wave colour' },
  { id: 'corner',     label: 'Corner style' },
  { id: 'dashboard',  label: 'Dashboard layout' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'terms',      label: 'Terminology' },
  { id: 'banner',     label: 'System banner' },
];

// ── Main component — renders the WHOLE Appearance section body ─────────────────
export default function AdvancedAppearance() {
  const t = useTerms();
  const qc = useQueryClient();
  const {
    themeMode, setThemeMode,
    selectedTheme, setSelectedTheme,
    customColors, updateCustomColorsFull, clearCustomColors,
    presets, allPresets,
    userCustomPresets, saveCustomPreset, deleteUserPreset,
    alterThemeLinks, linkAlterTheme, unlinkAlterTheme,
  } = useTheme();

  const a11y = getAccessibilitySettings();
  const [currentFont, setCurrentFont] = useState(a11y.fontFamily);
  const [currentSize, setCurrentSize] = useState(a11y.fontSize);
  const [currentHeadingFont, setCurrentHeadingFont] = useState(a11y.headingFont);

  // Optional extra-fonts pack (downloaded on demand, not bundled).
  const [extraInstalled, setExtraInstalled] = useState(isExtraFontsInstalled());
  const [installingFonts, setInstallingFonts] = useState(false);
  // Once installed, the extra fonts become selectable in both pickers.
  const appFontOptions = useMemo(
    () => extraInstalled ? [...APP_FONT_OPTIONS, ...EXTRA_FONT_OPTIONS] : APP_FONT_OPTIONS,
    [extraInstalled]);
  const headingFontOptions = useMemo(
    () => extraInstalled ? [...HEADING_FONT_OPTIONS, ...EXTRA_FONT_OPTIONS] : HEADING_FONT_OPTIONS,
    [extraInstalled]);

  const handleInstallExtraFonts = async () => {
    setInstallingFonts(true);
    try {
      await installExtraFonts();
      setExtraInstalled(true);
      toast.success("Extra fonts downloaded");
    } catch (e) {
      toast.error(e?.message || "Couldn't download the extra fonts");
    } finally {
      setInstallingFonts(false);
    }
  };

  const handleRemoveExtraFonts = () => {
    uninstallExtraFonts();
    setExtraInstalled(false);
    toast.success("Extra fonts removed");
  };

  const handleHeadingFontSelect = (value) => {
    setCurrentHeadingFont(value);
    setAccessibilityHeadingFont(value);
  };

  // Color editor state
  const [editingColor, setEditingColor] = useState(null);
  const [hexInput, setHexInput] = useState('');
  const [pendingColors, setPendingColors] = useState(null);
  const [originalTheme, setOriginalTheme] = useState(selectedTheme);

  // Fronter theme search
  const [alterSearch, setAlterSearch] = useState('');

  // Save preset state
  const [presetName, setPresetName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  // Which parts of the current look the next saved preset captures.
  // Defaults to the look-and-feel essentials; layout/terms left off so a
  // saved colour theme doesn't quietly rearrange the whole app on load.
  const [presetParts, setPresetParts] = useState(() => ({
    colors: true, fonts: true, uiSize: true, themeMode: true, wave: true,
    corner: false, dashboard: false, navigation: false, terms: false, banner: false,
  }));
  const togglePart = (id) => setPresetParts((p) => ({ ...p, [id]: !p[id] }));

  // Alter data for fronter linking
  const { data: alters = [] } = useQuery({
    queryKey: ['alters'],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: systemSettingsList = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const systemSettings = systemSettingsList[0] || null;

  // Mirrors ThemeContext's logic: dark when the user picked 'dark' or when
  // they're on 'system' and the html element currently carries the dark
  // class (set by the provider based on the OS).
  const isDark = themeMode === 'dark' ||
    (themeMode === 'system' && document.documentElement.classList.contains('dark'));

  const readCssColors = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.keys(COLOR_LABELS).map(k => [k, style.getPropertyValue(`--color-${k}`).trim() || '#888888'])
    );
  };

  // Source of truth for the user's saved theme colors. Updated whenever the
  // selected preset, customColors, or theme mode changes.
  const sourceColors = useMemo(() => {
    const src = customColors || allPresets[selectedTheme] || userCustomPresets[selectedTheme];
    if (!src) return {};
    return isDark ? (src.dark || {}) : (src.light || {});
  }, [customColors, selectedTheme, isDark, allPresets, userCustomPresets]);

  // Live CSS as a fallback for any colors the source dictionary is missing.
  const [liveColors, setLiveColors] = useState(() => {
    if (typeof document === 'undefined') return {};
    return Object.fromEntries(
      Object.keys(COLOR_LABELS).map(k => [k, getComputedStyle(document.documentElement).getPropertyValue(`--color-${k}`).trim() || ''])
    );
  });
  useEffect(() => {
    const id = requestAnimationFrame(() => setLiveColors(readCssColors()));
    return () => cancelAnimationFrame(id);
  }, [selectedTheme, customColors, themeMode, isDark]);

  const currentColors = pendingColors
    ? (isDark ? pendingColors.dark : pendingColors.light)
    : Object.fromEntries(
        Object.keys(COLOR_LABELS).map(k => [k, sourceColors[k] || liveColors[k] || '#888888'])
      );

  // ── Font + size handlers ─────────────────────────────────────
  const handleFontSelect = (value) => {
    setCurrentFont(value);
    setAccessibilityFontFamily(value);
  };

  // ── Preset handlers ──────────────────────────────────────────
  // Only apply the keys actually present in the preset — a granular
  // save omits unchecked groups, and loading must not touch them.
  const handleSelectPreset = async (name) => {
    const preset = allPresets[name] || userCustomPresets[name];
    // Colours: only swap if this preset carries a colour payload.
    if (preset?.light || preset?.dark) {
      clearCustomColors();
      setSelectedTheme(name);
    }
    setPendingColors(null);
    setEditingColor(null);
    if (preset?.font) { setCurrentFont(preset.font); setAccessibilityFontFamily(preset.font); }
    if (preset?.headingFont) { setCurrentHeadingFont(preset.headingFont); setAccessibilityHeadingFont(preset.headingFont); }
    if (preset?.themeMode) setThemeMode(preset.themeMode);
    if (preset?.fontSize) { setCurrentSize(preset.fontSize); setAccessibilityFontSize(preset.fontSize); }
    // Every other Appearance-section setting lives on the singleton
    // SystemSettings row — batch them all into one write.
    const settingsPatch = {};
    if (preset?.terms) {
      settingsPatch.term_system = preset.terms.system || 'system';
      settingsPatch.term_alter  = preset.terms.alter  || 'alter';
      settingsPatch.term_switch = preset.terms.switch || 'switch';
      settingsPatch.term_front  = preset.terms.front  || 'front';
    }
    if (preset?.waveColorKey && WAVE_COLOR_KEYS.includes(preset.waveColorKey)) {
      settingsPatch.wave_color_key = preset.waveColorKey;
      // A palette-keyed wave clears any custom hex so they stay exclusive.
      settingsPatch.wave_color_custom = preset.waveColorCustom || null;
    } else if (preset?.waveColorCustom) {
      settingsPatch.wave_color_custom = preset.waveColorCustom;
    }
    if (preset?.cornerMode) settingsPatch.corner_mode = preset.cornerMode;
    if (preset?.alterLabelMode) settingsPatch.alter_label_mode = preset.alterLabelMode;
    if (Array.isArray(preset?.dashboardLayout)) settingsPatch.dashboard_layout = preset.dashboardLayout;
    if (preset?.navigationConfig) settingsPatch.navigation_config = preset.navigationConfig;
    if (Array.isArray(preset?.upcomingPlansSurfaces)) settingsPatch.upcoming_plans_surfaces = preset.upcomingPlansSurfaces;
    // System banner config — only re-apply when the preset captured it.
    if (preset?.banner) {
      const b = preset.banner;
      if (b.system_banner_url !== undefined) settingsPatch.system_banner_url = b.system_banner_url;
      if (b.system_banner_height !== undefined) settingsPatch.system_banner_height = b.system_banner_height;
      if (b.system_banner_position !== undefined) settingsPatch.system_banner_position = b.system_banner_position;
      if (b.system_banner_scope !== undefined) settingsPatch.system_banner_scope = b.system_banner_scope;
    }
    if (Object.keys(settingsPatch).length > 0) {
      if (systemSettings?.id) {
        await base44.entities.SystemSettings.update(systemSettings.id, settingsPatch);
      } else {
        await base44.entities.SystemSettings.create(settingsPatch);
      }
      qc.invalidateQueries({ queryKey: ['systemSettings'] });
    }
  };

  // ── Color editing ────────────────────────────────────────────
  const handleStartEdit = (key) => {
    if (!pendingColors) {
      setOriginalTheme(selectedTheme);
      const presetColors = allPresets[selectedTheme] || userCustomPresets[selectedTheme];
      const light = { ...(customColors?.light || presetColors?.light || {}) };
      const dark  = { ...(customColors?.dark  || presetColors?.dark  || {}) };
      const cssColors = readCssColors();
      Object.keys(COLOR_LABELS).forEach(k => {
        if (!light[k]) light[k] = isDark ? '#888888' : cssColors[k];
        if (!dark[k])  dark[k]  = isDark ? cssColors[k] : '#888888';
      });
      setPendingColors({ light, dark });
    }
    setEditingColor(key);
    setHexInput(pendingColors?.[isDark ? 'dark' : 'light']?.[key] || currentColors[key] || '#000000');
  };

  const handleColorChange = (hex) => {
    setHexInput(hex);
    if (pendingColors && editingColor) {
      const mode = isDark ? 'dark' : 'light';
      const updated = { ...pendingColors, [mode]: { ...pendingColors[mode], [editingColor]: hex } };
      setPendingColors(updated);
      updateCustomColorsFull(updated.light, updated.dark);
    }
  };

  const handleSaveColor = () => {
    if (!editingColor || !/^#[0-9A-F]{6}$/i.test(hexInput) || !pendingColors) return;
    const mode = isDark ? 'dark' : 'light';
    const updated = { ...pendingColors, [mode]: { ...pendingColors[mode], [editingColor]: hexInput } };
    setPendingColors(updated);
    updateCustomColorsFull(updated.light, updated.dark);
    setEditingColor(null);
  };

  // ── Save as named preset (granular) ──────────────────────────
  // Only the checked groups get captured. Omitting a key means loading
  // the preset later won't touch that aspect of the app.
  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const payload = {};

    if (presetParts.colors) {
      const colors = customColors || allPresets[selectedTheme] || userCustomPresets[selectedTheme];
      if (colors?.light || colors?.dark) {
        payload.light = colors.light;
        payload.dark = colors.dark;
      }
    }
    if (presetParts.fonts) {
      payload.font = currentFont;
      payload.headingFont = currentHeadingFont;
    }
    if (presetParts.uiSize) payload.fontSize = currentSize;
    if (presetParts.themeMode) payload.themeMode = themeMode;
    if (presetParts.wave) {
      payload.waveColorKey = readWaveColorKey(systemSettings);
      if (typeof systemSettings?.wave_color_custom === 'string') {
        payload.waveColorCustom = systemSettings.wave_color_custom;
      }
    }
    if (presetParts.corner) payload.cornerMode = systemSettings?.corner_mode;
    if (presetParts.dashboard) {
      payload.dashboardLayout = systemSettings?.dashboard_layout;
      payload.upcomingPlansSurfaces = systemSettings?.upcoming_plans_surfaces;
    }
    if (presetParts.navigation) payload.navigationConfig = systemSettings?.navigation_config;
    if (presetParts.terms) {
      payload.terms = { system: t.system, alter: t.alter, switch: t.switch, front: t.front };
    }
    if (presetParts.banner) {
      payload.banner = {
        system_banner_url: systemSettings?.system_banner_url ?? null,
        system_banner_height: systemSettings?.system_banner_height,
        system_banner_position: systemSettings?.system_banner_position,
        system_banner_scope: systemSettings?.system_banner_scope,
      };
    }
    // alterLabelMode rides with colours/fonts implicitly when present; keep
    // it only when fonts (typography identity) are saved.
    if (presetParts.fonts) payload.alterLabelMode = systemSettings?.alter_label_mode;

    if (Object.keys(payload).length === 0) {
      toast.error("Pick at least one thing to save");
      return;
    }
    saveCustomPreset(name, payload);
    setPresetName('');
    setShowSaveForm(false);
    const count = PRESET_PARTS.filter((p) => presetParts[p.id]).length;
    toast.success(`Preset "${name}" saved (${count} ${count === 1 ? 'setting' : 'settings'})`);
  };

  // Collect all presets for display
  const builtInNames = BASIC_THEMES;
  const userPresetNames = Object.keys(userCustomPresets);
  const allPresetNames = [...builtInNames, ...userPresetNames];

  // Top nav bar only matters where it's actually shown. On native /
  // mobile the top bar is hidden, so we surface only the bottom-bar
  // config there; on web (wide layouts) we keep both.
  const showTopBarConfig = !isNative();

  return (
    <div className="space-y-5">
      {/* 1. UI SIZE — directly on the card. */}
      <UiSizeControl />

      {/* 2. ADVANCED — touch target + nav height sliders. */}
      <SubSection title="Advanced" defaultOpen={false}>
        <TouchTargetControl />
        <NavHeightControl />
      </SubSection>

      {/* 3. FONTS — directly on the card. Body font with the
              "download more" button on its right; heading font below. */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Font family</p>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0">
              <FontPicker currentFont={currentFont} onSelect={handleFontSelect} options={appFontOptions} />
            </div>
            {extraInstalled ? (
              <button
                type="button"
                onClick={handleRemoveExtraFonts}
                title="Remove the downloaded extra fonts"
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs px-3 rounded-xl border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove fonts
              </button>
            ) : (
              <button
                type="button"
                onClick={handleInstallExtraFonts}
                disabled={installingFonts}
                title="Download 14 more fonts (one-time, needs internet)"
                className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs px-3 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {installingFonts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {installingFonts ? "Downloading…" : "More fonts"}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Heading font</p>
          <FontPicker
            currentFont={currentHeadingFont}
            onSelect={handleHeadingFontSelect}
            options={headingFontOptions}
            resolveCurrent={(v) => headingFontOptions.find(f => f.value === v) || HEADING_FONT_OPTIONS[0]}
          />
        </div>
        <p className="text-[0.6875rem] text-muted-foreground leading-snug">
          Body text uses the font family; headings and the app name use the heading font.
        </p>
      </div>

      {/* 4. THEME — expandable, with the light/dark cycle chip in its header. */}
      <SubSection title="Theme" defaultOpen={false} right={<ThemeModeChip />}>
        {/* a. Built-in preset swatch dropdown. */}
        <BuiltInPresetDropdown
          presets={presets}
          names={builtInNames}
          selectedTheme={selectedTheme}
          customColors={customColors}
          onSelect={handleSelectPreset}
        />

        {/* b. Custom colours (4×2 grid) + the larger Wave swatch on the right. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom colours</p>
            {customColors && (
              <button
                type="button"
                onClick={() => {
                  clearCustomColors();
                  setPendingColors(null);
                  const fallback = allPresets[originalTheme]
                    ? originalTheme
                    : Object.keys(allPresets || {})[0] || "cool";
                  setSelectedTheme(fallback);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Revert to preset
              </button>
            )}
          </div>
          <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
            <div className="grid grid-cols-4 gap-x-3 gap-y-2 flex-1">
              {Object.entries(COLOR_LABELS).map(([key, label]) => (
                <ColorSwatch
                  key={key}
                  label={label}
                  color={currentColors[key] || '#888'}
                  onClick={() => handleStartEdit(key)}
                />
              ))}
            </div>
            <div className="flex-shrink-0 border-l border-border/40 pl-3">
              <WaveColorSwatch />
            </div>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">Tap a swatch to edit it. The Wave swatch sets the header wave colour.</p>
        </div>
      </SubSection>

      {/* 5. CORNER STYLE — directly on the card. */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corner style</p>
        <CornerStyleSettings embedded />
      </div>

      {/* 6. PRESETS — save (granular), your presets, fronter themes. */}
      <SubSection title="Presets" defaultOpen={false}>
        {/* Save as preset, with element checkboxes. */}
        <div className="space-y-2">
          {showSaveForm ? (
            <div className="space-y-2.5 rounded-xl border border-border/50 p-3 bg-muted/10">
              <input
                autoFocus
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveForm(false); }}
                placeholder="Preset name…"
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div>
                <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Include in this preset</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_PARTS.map((part) => {
                    const on = !!presetParts[part.id];
                    return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => togglePart(part.id)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-colors ${
                          on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/50 text-muted-foreground hover:bg-muted/30'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                          {on && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        <span className="truncate">{part.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
                >
                  <Save className="w-4 h-4" /> Save preset
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveForm(false)}
                  className="px-3 h-9 rounded-xl bg-muted text-muted-foreground text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Save className="w-4 h-4" /> Save current look as a preset
            </button>
          )}
        </div>

        {/* Your presets. */}
        {userPresetNames.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your presets</p>
            <div className="space-y-1.5">
              {userPresetNames.map(name => {
                const preset = userCustomPresets[name];
                const isActive = selectedTheme === name;
                const linkedAlters = alters.filter(a => alterThemeLinks[a.id] === name);
                return (
                  <div key={name}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                      isActive ? 'border-primary/60 bg-primary/10' : 'border-border/40 bg-card'
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 border border-border/30"
                      style={{ background: `linear-gradient(135deg, ${preset.light?.bg || '#888'}, ${preset.light?.primary || '#aaa'})` }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isActive ? 'text-primary' : ''}`}>{name}</p>
                      {preset.terms && (
                        <p className="text-[0.625rem] text-muted-foreground truncate">
                          {preset.terms.alter} · {preset.terms.front}ing · {preset.terms.system}
                        </p>
                      )}
                      {linkedAlters.length > 0 && (
                        <p className="text-[0.625rem] text-muted-foreground truncate">
                          Linked: {linkedAlters.map(a => a.alias || a.name).join(', ')}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(name)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0 ${
                        isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {isActive ? 'Active' : 'Apply'}
                    </button>
                    <button
                      type="button"
                      title="Delete preset"
                      onClick={() => { if (confirm(`Delete preset "${name}"?`)) deleteUserPreset(name); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fronter-linked themes. */}
        {alters.length > 0 && allPresetNames.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.Fronter} themes</p>
            <p className="text-xs text-muted-foreground">
              When a {t.alter} becomes primary {t.fronter}, their linked theme (including light/dark mode) switches automatically.
            </p>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-input bg-background">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                value={alterSearch}
                onChange={e => setAlterSearch(e.target.value)}
                placeholder={`Search ${t.alters}…`}
                className="flex-1 bg-transparent text-xs outline-none"
              />
              {alterSearch && (
                <button type="button" onClick={() => setAlterSearch('')} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="max-h-[240px] overflow-y-auto space-y-1 pr-0.5">
              {alters.filter(a => !a.is_archived && (alterSearch === '' || (a.alias || a.name).toLowerCase().includes(alterSearch.toLowerCase()))).map(alter => {
                const linked = alterThemeLinks[alter.id];
                return (
                  <div key={alter.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/40 bg-card">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: alter.color || '#8b5cf6' }} />
                    <span className="flex-1 text-xs truncate min-w-0">{alter.alias || alter.name}</span>
                    <select
                      value={linked || ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (val) linkAlterTheme(alter.id, val);
                        else unlinkAlterTheme(alter.id);
                      }}
                      className="text-xs rounded-md border border-input bg-background px-1.5 py-1 focus:outline-none max-w-[130px]"
                    >
                      <option value="">No theme</option>
                      <optgroup label="Built-in">
                        {builtInNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </optgroup>
                      {userPresetNames.length > 0 && (
                        <optgroup label="Your presets">
                          {userPresetNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </optgroup>
                      )}
                    </select>
                    {linked ? (
                      <button
                        type="button"
                        title="Remove link"
                        onClick={() => unlinkAlterTheme(alter.id)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0"
                      >
                        <Unlink className="w-3 h-3" />
                      </button>
                    ) : (
                      <div className="w-5 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SubSection>

      {/* 7. LAYOUT — one expandable card holding Dashboard, the bottom bar,
              and Upcoming plans surfaces. */}
      <SubSection title="Layout" defaultOpen={false}>
        <SubSection title="Dashboard" defaultOpen={false}>
          <DashboardLayoutSettings />
        </SubSection>
        {/* Mobile bottom bar (+ top bar only where it's shown). No heading /
            description / save button — it autosaves like everything else. */}
        <NavigationSettings settings={systemSettings} showTopBar={showTopBarConfig} />
        <SubSection title="Upcoming plans surfaces" defaultOpen={false}>
          <UpcomingPlansSurfacesSection />
        </SubSection>
      </SubSection>

      {/* ── Color editor modal ────────────────────────────────── */}
      {editingColor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80]">
          <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{COLOR_LABELS[editingColor]}</h3>
              <button type="button" onClick={() => setEditingColor(null)}
                className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <HexColorPicker color={hexInput} onChange={handleColorChange} style={{ width: '100%' }} />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={hexInput}
                onChange={e => { const v = e.target.value.toUpperCase(); if (/^#?[0-9A-F]{0,6}$/.test(v)) { setHexInput(v.startsWith('#') ? v : '#' + v); } }}
                className="flex-1 h-9 px-3 rounded-xl border border-input bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="w-9 h-9 rounded-xl border-2 border-border flex-shrink-0" style={{ backgroundColor: hexInput }} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditingColor(null)}
                className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">
                Cancel
              </button>
              <button type="button" onClick={handleSaveColor}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
