import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { HexColorPicker } from 'react-colorful';
import {
  APP_FONT_OPTIONS, FONT_CATEGORY_LABELS,
  getAccessibilitySettings, setAccessibilityFontFamily, setAccessibilityFontSize, findFontOption,
} from '@/lib/useAccessibility';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Palette, X, ChevronDown, Search, Check, Trash2, Link2, Unlink, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTerms } from '@/lib/useTerms';
import '@/lib/editorFonts.js'; // ensure all fonts are loaded

const BASIC_THEMES = ['warm', 'cool', 'forest', 'sunset', 'ocean', 'berry', 'charcoal', 'ivory'];

const COLOR_LABELS = {
  bg: 'Background', surface: 'Surface', primary: 'Primary',
  secondary: 'Secondary', accent: 'Accent', muted: 'Muted',
  'text-primary': 'Text', 'text-secondary': 'Text 2nd',
};

const FONT_SIZE_OPTIONS = [
  { value: 'sm',      label: 'Small',       desc: '87.5%' },
  { value: 'default', label: 'Default',     desc: '100%' },
  { value: 'lg',      label: 'Large',       desc: '112.5%' },
  { value: 'xl',      label: 'Extra Large', desc: '125%' },
];

// ── Font Picker ──────────────────────────────────────────────────────────────
function FontPicker({ currentFont, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  const currentOption = findFontOption(currentFont);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const result = {};
    for (const f of APP_FONT_OPTIONS) {
      if (q && !f.label.toLowerCase().includes(q)) continue;
      if (!result[f.category]) result[f.category] = [];
      result[f.category].push(f);
    }
    return result;
  }, [search]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!panelRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isSelected = (f) =>
    f.value === currentFont || (f.legacy && f.legacy === currentFont);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-input bg-background hover:bg-muted/30 transition-colors text-sm"
        style={{ fontFamily: currentOption.value }}
      >
        <span className="font-medium">{currentOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-[80] bg-background border-2 border-border rounded-xl shadow-2xl overflow-hidden">
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
                <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
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
                    style={{ fontFamily: f.value }}
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
      )}
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
      className="flex flex-col items-center gap-1.5 group"
    >
      <div
        className="w-10 h-10 rounded-xl border-2 border-border/50 group-hover:border-primary/60 transition-colors shadow-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] text-muted-foreground group-hover:text-foreground">{label}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdvancedAppearance() {
  const t = useTerms();
  const {
    themeMode, setThemeMode, cycleThemeMode,
    selectedTheme, setSelectedTheme,
    customColors, updateCustomColors, updateCustomColorsFull, clearCustomColors,
    presets, allPresets,
    userCustomPresets, saveCustomPreset, deleteUserPreset,
    alterThemeLinks, linkAlterTheme, unlinkAlterTheme,
  } = useTheme();

  const a11y = getAccessibilitySettings();
  const [currentFont, setCurrentFont] = useState(a11y.fontFamily);
  const [currentSize, setCurrentSize] = useState(a11y.fontSize);

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

  // Alter data for fronter linking
  const { data: alters = [] } = useQuery({
    queryKey: ['alters'],
    queryFn: () => base44.entities.Alter.list(),
  });

  const isDark = themeMode === 'dark' ||
    (themeMode === 'system' && document.documentElement.classList.contains('dark'));

  const readCssColors = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.keys(COLOR_LABELS).map(k => [k, style.getPropertyValue(`--color-${k}`).trim() || '#888888'])
    );
  };

  const getCurrentColors = () => {
    const src = customColors || allPresets[selectedTheme] || userCustomPresets[selectedTheme];
    if (src) return isDark ? src.dark : src.light;
    return readCssColors();
  };

  const currentColors = pendingColors
    ? (isDark ? pendingColors.dark : pendingColors.light)
    : getCurrentColors();

  const modeIcon = { light: '☀️', dark: '🌙', system: '💻' }[themeMode] || '💻';

  // ── Font handlers ────────────────────────────────────────────
  const handleFontSelect = (value) => {
    setCurrentFont(value);
    setAccessibilityFontFamily(value);
  };

  const handleSizeSelect = (value) => {
    setCurrentSize(value);
    setAccessibilityFontSize(value);
  };

  // ── Preset handlers ──────────────────────────────────────────
  const handleSelectPreset = (name) => {
    clearCustomColors();
    setSelectedTheme(name);
    setPendingColors(null);
    setEditingColor(null);
    const preset = allPresets[name] || userCustomPresets[name];
    if (preset?.font) { setCurrentFont(preset.font); setAccessibilityFontFamily(preset.font); }
    if (preset?.themeMode) setThemeMode(preset.themeMode);
    if (preset?.fontSize) { setCurrentSize(preset.fontSize); setAccessibilityFontSize(preset.fontSize); }
  };

  // ── Color editing ────────────────────────────────────────────
  const handleStartEdit = (key) => {
    if (!pendingColors) {
      setOriginalTheme(selectedTheme);
      const presetColors = allPresets[selectedTheme] || userCustomPresets[selectedTheme];
      const light = { ...(customColors?.light || presetColors?.light || {}) };
      const dark  = { ...(customColors?.dark  || presetColors?.dark  || {}) };
      // Seed any missing keys from the currently applied CSS variables
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

  // ── Save as named preset ─────────────────────────────────────
  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const colors = customColors || allPresets[selectedTheme] || userCustomPresets[selectedTheme];
    if (!colors) return;
    saveCustomPreset(name, { ...colors, font: currentFont, themeMode, fontSize: currentSize });
    setPresetName('');
    setShowSaveForm(false);
    toast.success(`Theme "${name}" saved`);
  };

  // Collect all presets for display
  const builtInNames = BASIC_THEMES;
  const userPresetNames = Object.keys(userCustomPresets);
  const allPresetNames = [...builtInNames, ...userPresetNames];

  return (
    <>
      {/* ── Theme Mode ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Theme Mode</p>
        <button
          type="button"
          onClick={cycleThemeMode}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left"
        >
          <span className="text-xl">{modeIcon}</span>
          <span className="text-sm font-medium capitalize">{themeMode === 'system' ? 'System (follow OS)' : themeMode}</span>
          <span className="ml-auto text-xs text-muted-foreground">tap to cycle</span>
        </button>
      </div>

      {/* ── Font Family ────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Font Family</p>
        <FontPicker currentFont={currentFont} onSelect={handleFontSelect} />
        <p className="text-xs text-muted-foreground">
          Preview: <span style={{ fontFamily: findFontOption(currentFont).value }}>
            The quick brown fox jumps over the lazy dog
          </span>
        </p>
      </div>

      {/* ── Text & UI Size ─────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Text & UI Size</p>
        <div className="grid grid-cols-4 gap-1.5">
          {FONT_SIZE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSizeSelect(opt.value)}
              className={`rounded-xl border px-2 py-2 text-center transition-all ${
                currentSize === opt.value
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border/50 bg-card hover:bg-muted/30'
              }`}
            >
              <p className={`text-sm font-semibold ${currentSize === opt.value ? 'text-primary' : ''}`}>{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Built-in Theme Presets ─────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Built-in Presets</p>
        <div className="grid grid-cols-3 gap-2">
          {builtInNames.map(name => {
            const preset = presets[name];
            const isActive = selectedTheme === name && !customColors;
            return (
              <button
                key={name}
                type="button"
                onClick={() => handleSelectPreset(name)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                  isActive ? 'ring-2 ring-offset-2 ring-primary' : ''
                }`}
                style={{
                  backgroundImage: `linear-gradient(135deg, ${preset.light.bg}, ${preset.light.primary})`,
                  color: preset.light['text-primary'],
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Custom Color Editor ────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Colors</p>
          {customColors && (
            <button
              type="button"
              onClick={() => { clearCustomColors(); setPendingColors(null); setSelectedTheme(originalTheme); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Revert to preset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
          {Object.entries(COLOR_LABELS).map(([key, label]) => (
            <ColorSwatch
              key={key}
              label={label}
              color={currentColors[key] || '#888'}
              onClick={() => handleStartEdit(key)}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Tap a color swatch to edit it.</p>
      </div>

      {/* ── Save as Named Preset ───────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Save as Preset</p>
        {showSaveForm ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveForm(false); }}
              placeholder="Preset name…"
              className="flex-1 h-9 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={handleSavePreset}
              className="px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowSaveForm(false)}
              className="px-3 h-9 rounded-xl bg-muted text-muted-foreground text-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Save className="w-4 h-4" /> Save current theme as preset
          </button>
        )}
      </div>

      {/* ── User-saved Presets ────────────────────────────────────*/}
      {userPresetNames.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Presets</p>
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
                  {/* Color preview */}
                  <div
                    className="w-7 h-7 rounded-lg flex-shrink-0 border border-border/30"
                    style={{ background: `linear-gradient(135deg, ${preset.light?.bg || '#888'}, ${preset.light?.primary || '#aaa'})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-primary' : ''}`}>{name}</p>
                    {linkedAlters.length > 0 && (
                      <p className="text-[10px] text-muted-foreground truncate">
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

      {/* ── Fronter-linked Themes ─────────────────────────────── */}
      {alters.length > 0 && allPresetNames.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.Fronter} Themes</p>
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
    </>
  );
}
