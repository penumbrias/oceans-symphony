import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme, FONT_OPTIONS } from '@/lib/ThemeContext';
import { HexColorPicker } from 'react-colorful';
import { Monitor, Palette, ChevronDown, Save, X } from 'lucide-react';

export default function AdvancedAppearance() {
  const { themeMode, selectedTheme, customColors, updateCustomColors, cycleThemeMode, presets, setSelectedTheme, selectedFont, setSelectedFont, userCustomPresets, saveCustomPreset, allPresets, isDarkMode } = useTheme();
  
  const [editingColor, setEditingColor] = useState(null);
  const [hexInput, setHexInput] = useState('');
  const [fontSearch, setFontSearch] = useState('');
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showCustomDropdown, setShowCustomDropdown] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [pendingColors, setPendingColors] = useState(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Determine current display mode for preview
  const isDark = themeMode === 'dark' || (themeMode === 'system' && document.documentElement.classList.contains('dark'));

  const colorLabels = {
    bg: 'Background',
    surface: 'Surface',
    primary: 'Primary',
    secondary: 'Secondary',
    accent: 'Accent',
    muted: 'Muted',
    'text-primary': 'Text Primary',
    'text-secondary': 'Text Secondary',
  };

  // Show pending colors if editing, otherwise show current colors in current display mode
  const currentColors = pendingColors 
    ? (isDark ? pendingColors.dark : pendingColors.light)
    : (customColors ? (isDark ? customColors.dark : customColors.light) : (isDark ? allPresets[selectedTheme]?.dark : allPresets[selectedTheme]?.light));

  const filteredFonts = FONT_OPTIONS.filter(f => f.label.toLowerCase().includes(fontSearch.toLowerCase()));

  const handleColorDoubleClick = (key, value) => {
    if (!pendingColors) {
      // Start editing - initialize pending colors
      if (customColors) {
        setPendingColors(customColors);
      } else {
        const theme = allPresets[selectedTheme];
        setPendingColors(theme);
      }
    }
    setEditingColor(key);
    setHexInput(value);
  };

  const handleHexChange = (e) => {
    const val = e.target.value.toUpperCase();
    if (/^#?[0-9A-F]{0,6}$/.test(val)) setHexInput(val);
  };

  const handleSaveColor = () => {
    if (editingColor && /^#[0-9A-F]{6}$/i.test(hexInput)) {
      const mode = isDark ? 'dark' : 'light';
      const newColors = {
        ...pendingColors,
        [mode]: {
          ...pendingColors[mode],
          [editingColor]: hexInput
        }
      };
      setPendingColors(newColors);
      setHasPendingChanges(true);
      setEditingColor(null);
    }
  };

  const handleApplyChanges = () => {
    if (pendingColors) {
      updateCustomColors(pendingColors.light);
      setPendingColors(null);
      setHasPendingChanges(false);
    }
  };

  const handleCancelChanges = () => {
    setPendingColors(null);
    setHasPendingChanges(false);
    setEditingColor(null);
  };

  const handleSaveCustomPreset = () => {
    if (presetName.trim() && pendingColors) {
      saveCustomPreset(presetName, pendingColors);
      setPresetName('');
      setShowSavePreset(false);
    }
  };

  const basicThemes = ['warm', 'cool', 'forest', 'sunset', 'ocean', 'berry', 'charcoal', 'ivory'];
  const modeIcon = themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '💻';

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Palette className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Advanced Appearance</CardTitle>
            <CardDescription>Customize colors, fonts, and theme</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Theme Mode */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Theme Mode</p>
          <Button
            variant="outline"
            onClick={cycleThemeMode}
            className="w-full gap-2 justify-start"
          >
            <span className="text-lg">{modeIcon}</span>
            <span className="capitalize">{themeMode === 'system' ? 'System' : themeMode}</span>
          </Button>
        </div>

        {/* Font Selection */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Font</p>
          <div className="relative">
            <button
              onClick={() => setShowFontDropdown(!showFontDropdown)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-card text-left flex items-center justify-between hover:bg-muted/50"
            >
              <span>{FONT_OPTIONS.find(f => f.value === selectedFont)?.label || 'Select font'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showFontDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showFontDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50">
                <input
                  type="text"
                  placeholder="Search fonts..."
                  value={fontSearch}
                  onChange={(e) => setFontSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-b border-border bg-card"
                />
                <div className="max-h-48 overflow-y-auto">
                  {filteredFonts.map(font => (
                    <button
                      key={font.value}
                      onClick={() => {
                        setSelectedFont(font.value);
                        setShowFontDropdown(false);
                        setFontSearch('');
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                        selectedFont === font.value ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Basic Preset Themes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Theme Presets</p>
          <div className="grid grid-cols-3 gap-2">
            {basicThemes.map(theme => {
              const preset = presets[theme];
              const isSelected = selectedTheme === theme && !customColors;
              const lightBg = preset.light.bg;
              const lightPrimary = preset.light.primary;
              return (
                <button
                  key={theme}
                  onClick={() => {
                    setSelectedTheme(theme);
                    handleCancelChanges();
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all capitalize relative overflow-hidden ${
                    isSelected ? 'ring-2 ring-primary' : ''
                  }`}
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${lightBg} 0%, ${lightPrimary} 100%)`,
                    color: preset.light['text-primary'],
                  }}
                  title={theme}
                >
                  {theme}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Preset Dropdown */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custom Presets</p>
          <div className="relative">
            <button
              onClick={() => setShowCustomDropdown(!showCustomDropdown)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-card text-left flex items-center justify-between hover:bg-muted/50"
            >
              <span className="text-sm">{Object.keys(userCustomPresets).length > 0 ? 'View custom presets' : 'No custom presets'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showCustomDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showCustomDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {Object.keys(userCustomPresets).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No custom presets yet</div>
                ) : (
                  Object.keys(userCustomPresets).map(name => (
                    <button
                      key={name}
                      onClick={() => {
                        const colors = userCustomPresets[name];
                        updateCustomColors(colors.light);
                        setShowCustomDropdown(false);
                        handleCancelChanges();
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Color Customization */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Custom Colors {(customColors || pendingColors) && '(Active)'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(colorLabels).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-foreground">{label}</label>
                <div
                  className="w-full h-10 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary"
                  style={{ backgroundColor: currentColors[key] }}
                  onDoubleClick={() => handleColorDoubleClick(key, currentColors[key])}
                  title="Double-click to edit"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save/Cancel for Custom Preset */}
        {(customColors || pendingColors) && (
          <div className="flex gap-2">
            <Button
              onClick={() => setShowSavePreset(!showSavePreset)}
              variant="outline"
              className="flex-1"
            >
              Save as Preset
            </Button>
            {hasPendingChanges && (
              <>
                <Button
                  onClick={handleApplyChanges}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  Save Changes
                </Button>
                <Button
                  onClick={handleCancelChanges}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}

        {showSavePreset && (
          <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
            <Input
              placeholder="Preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowSavePreset(false)} className="flex-1">
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveCustomPreset} className="flex-1">
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Color Editor Modal */}
        {editingColor && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
            <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{colorLabels[editingColor]}</h3>
                <button onClick={() => setEditingColor(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <HexColorPicker color={hexInput} onChange={setHexInput} />
              
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">HEX</label>
                <Input
                  type="text"
                  value={hexInput}
                  onChange={handleHexChange}
                  placeholder="#000000"
                  className="font-mono text-sm"
                />
              </div>

              <div
                className="w-full h-12 rounded-lg border-2 border-border"
                style={{ backgroundColor: hexInput }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingColor(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveColor}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}