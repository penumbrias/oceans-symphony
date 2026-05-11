import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/ThemeContext';
import { Moon, Sun, Monitor, Palette } from 'lucide-react';

export default function AdvancedAppearance() {
  const { themeMode, selectedTheme, customColors, updateCustomColors, cycleThemeMode, presets, setSelectedTheme } = useTheme();
  const [editingColor, setEditingColor] = useState(null);
  const [hexInput, setHexInput] = useState('');
  const [showPicker, setShowPicker] = useState(false);

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

  const currentColors = customColors ? customColors.light : presets[selectedTheme].light;

  const handleColorDoubleClick = (key, value) => {
    setEditingColor(key);
    setHexInput(value);
    setShowPicker(true);
  };

  const handleHexChange = (e) => {
    const val = e.target.value.toUpperCase();
    if (/^#?[0-9A-F]{0,6}$/.test(val)) setHexInput(val);
  };

  const handleColorPickerChange = (e) => {
    setHexInput(e.target.value);
  };

  const handleSaveColor = () => {
    if (editingColor && /^#[0-9A-F]{6}$/i.test(hexInput)) {
      const newColors = { ...currentColors, [editingColor]: hexInput };
      updateCustomColors(newColors);
      setEditingColor(null);
      setShowPicker(false);
    }
  };

  const themeModeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? Moon : Monitor;
  const ModeIcon = themeModeIcon;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Palette className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Advanced Appearance</CardTitle>
            <CardDescription>Customize colors and theme mode</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme Mode Toggle */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Theme Mode</p>
          <Button
            variant="outline"
            onClick={cycleThemeMode}
            className="w-full gap-2 justify-start"
          >
            <ModeIcon className="w-4 h-4" />
            <span className="capitalize">{themeMode === 'system' ? 'System' : themeMode}</span>
          </Button>
        </div>

        {/* Preset Themes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Presets</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.keys(presets).map(preset => (
              <button
                key={preset}
                onClick={() => setSelectedTheme(preset)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all capitalize ${
                  selectedTheme === preset && !customColors
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Custom Colors {customColors && '(Active)'}
          </p>
          <div className="space-y-2">
            {Object.entries(colorLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="w-32 text-sm font-medium text-foreground">{label}</label>
                <div
                  className="w-12 h-12 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary"
                  style={{ backgroundColor: currentColors[key] }}
                  onDoubleClick={() => handleColorDoubleClick(key, currentColors[key])}
                  title="Double-click to edit"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Color Editor Modal */}
        {editingColor && showPicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
            <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4">
              <h3 className="font-semibold">{colorLabels[editingColor]}</h3>
              
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">HEX</label>
                <input
                  type="text"
                  value={hexInput}
                  onChange={handleHexChange}
                  placeholder="#000000"
                  className="w-full px-3 py-2 rounded-lg border-2 border-border bg-surface font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Color Picker</label>
                <input
                  type="color"
                  value={hexInput}
                  onChange={handleColorPickerChange}
                  className="w-full h-12 rounded-lg cursor-pointer"
                />
              </div>

              <div
                className="w-full h-12 rounded-lg border-2 border-border"
                style={{ backgroundColor: hexInput }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPicker(false)}
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