import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme, FONT_OPTIONS } from '@/lib/ThemeContext';
import { HexColorPicker } from 'react-colorful';
import { Palette, ChevronDown, Save, X } from 'lucide-react';

export default function AdvancedAppearance() {
  const { themeMode, selectedTheme, customColors, updateCustomColors, cycleThemeMode, presets, setSelectedTheme, userCustomPresets, saveCustomPreset, allPresets } = useTheme();
  
  const [editingColor, setEditingColor] = useState(null);
  const [hexInput, setHexInput] = useState('');
  const [showCustomDropdown, setShowCustomDropdown] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [pendingColors, setPendingColors] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Determine current display mode
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

  // Get current display colors (what's actually showing)
  const getCurrentColors = () => {
    if (customColors) {
      return isDark ? customColors.dark : customColors.light;
    }
    const preset = allPresets[selectedTheme];
    return isDark ? preset.dark : preset.light;
  };

  const currentColors = getCurrentColors();

  const handleSelectPreset = (themeName) => {
    // If user was editing custom colors, save them first
    if (isEditing && pendingColors) {
      saveCustomPreset(presetName || `Custom ${new Date().toLocaleTimeString()}`, pendingColors);
    }
    
    // Clear custom colors and apply preset
    setSelectedTheme(themeName);
    setPendingColors(null);
    setIsEditing(false);
    setEditingColor(null);
    setShowSavePreset(false);
  };

  const handleStartEditColor = (key) => {
    if (!isEditing) {
      // Start editing - clone current colors
      const lightColors = allPresets[selectedTheme]?.light || {};
      const darkColors = allPresets[selectedTheme]?.dark || {};
      setPendingColors({
        light: { ...lightColors },
        dark: { ...darkColors }
      });
      setIsEditing(true);
    }
    setEditingColor(key);
    const mode = isDark ? 'dark' : 'light';
    setHexInput(pendingColors?.[mode]?.[key] || currentColors[key]);
  };

  const handleHexChange = (e) => {
    const val = e.target.value.toUpperCase();
    if (/^#?[0-9A-F]{0,6}$/.test(val)) setHexInput(val);
  };

  const handleColorPickerChange = (newHex) => {
    setHexInput(newHex);
    if (isEditing && pendingColors && editingColor) {
      const mode = isDark ? 'dark' : 'light';
      const updated = {
        ...pendingColors,
        [mode]: {
          ...pendingColors[mode],
          [editingColor]: newHex
        }
      };
      setPendingColors(updated);
      // Apply live
      updateCustomColors(updated.light);
    }
  };

  const handleSaveColor = () => {
    if (editingColor && /^#[0-9A-F]{6}$/i.test(hexInput)) {
      const mode = isDark ? 'dark' : 'light';
      const updated = {
        ...pendingColors,
        [mode]: {
          ...pendingColors[mode],
          [editingColor]: hexInput
        }
      };
      setPendingColors(updated);
      updateCustomColors(updated.light);
      setEditingColor(null);
    }
  };

  const handleSaveCustomPreset = () => {
    if (presetName.trim() && pendingColors) {
      saveCustomPreset(presetName, pendingColors);
      setPresetName('');
      setShowSavePreset(false);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setPendingColors(null);
    setIsEditing(false);
    setEditingColor(null);
    setShowSavePreset(false);
    setPresetName('');
    // Revert to current theme's colors
    const preset = allPresets[selectedTheme];
    if (preset) {
      updateCustomColors(preset.light);
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
            <CardDescription>Customize colors and theme</CardDescription>
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
                  onClick={() => handleSelectPreset(theme)}
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
                        setSelectedTheme(name);
                        setShowCustomDropdown(false);
                        setIsEditing(false);
                        setPendingColors(null);
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
            Custom Colors {customColors && '(Editing)'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(colorLabels).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-foreground">{label}</label>
                <div
                  className="w-full h-10 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary"
                  style={{ backgroundColor: currentColors[key] }}
                  onClick={() => handleStartEditColor(key)}
                  title="Click to edit"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save/Cancel for Custom Editing */}
        {isEditing && customColors && (
          <div className="flex gap-2">
            <Button
              onClick={() => setShowSavePreset(!showSavePreset)}
              variant="outline"
              className="flex-1"
            >
              Save as Preset
            </Button>
            <Button
              onClick={handleCancelEdit}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
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
              
              <HexColorPicker color={hexInput} onChange={handleColorPickerChange} />
              
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