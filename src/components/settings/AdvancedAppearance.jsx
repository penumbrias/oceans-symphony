import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Moon, Sun, Palette } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';

const THEMES = {
  teal: {
    name: 'Teal',
    light: { primary: '#4A9BA8', secondary: '#E8F4F7', background: '#F5FAFB' },
    dark: { primary: '#5EB5C2', secondary: '#1A3C42', background: '#0F1B1E' }
  },
  sage: {
    name: 'Sage',
    light: { primary: '#6B9B7F', secondary: '#E8F3ED', background: '#F5FAF7' },
    dark: { primary: '#8BB799', secondary: '#1E3A2F', background: '#0F1A15' }
  },
  warmtan: {
    name: 'Warm Tan',
    light: { primary: '#B8956A', secondary: '#F5EDE3', background: '#FAF8F5' },
    dark: { primary: '#D4AF86', secondary: '#3A2F25', background: '#16110A' }
  },
  clay: {
    name: 'Clay',
    light: { primary: '#C99B7C', secondary: '#F5E9E0', background: '#FAF7F4' },
    dark: { primary: '#E8B89A', secondary: '#3F2E24', background: '#17110A' }
  },
  lavender: {
    name: 'Lavender',
    light: { primary: '#A582B5', secondary: '#F0E5F5', background: '#F8F5FA' },
    dark: { primary: '#C9A8D8', secondary: '#3D2847', background: '#16110F' }
  }
};

const FONTS = [
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Playfair Display', value: 'Playfair Display, serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Comic Sans MS', value: 'Comic Sans MS, sans-serif' },
];

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` : null;
}

function applyTheme(mode, themeData) {
  const root = document.documentElement;
  const colors = themeData[mode];
  
  const primaryRgb = hexToRgb(colors.primary);
  const bgRgb = hexToRgb(colors.background);
  
  if (primaryRgb) root.style.setProperty('--primary', `${primaryRgb} / <alpha-value>`);
  if (colors.secondary) root.style.setProperty('--secondary', colors.secondary);
  if (bgRgb) root.style.setProperty('--background', bgRgb);
  
  localStorage.setItem('theme_mode', mode);
  localStorage.setItem('theme_preset', 'custom');
}

function applyPreset(presetKey, mode) {
  const theme = THEMES[presetKey];
  if (!theme) return;
  
  applyTheme(mode, theme);
  localStorage.setItem('theme_preset', presetKey);
  localStorage.setItem('theme_mode', mode);
}

export default function AdvancedAppearance() {
  const { theme, setTheme } = useTheme();
  const [mode, setMode] = useState(theme || 'light');
  const [customColor, setCustomColor] = useState(localStorage.getItem('custom_primary') || '#4A9BA8');
  const [font, setFont] = useState(localStorage.getItem('custom_font') || 'Inter');
  const colorPickerRef = useRef(null);

  useEffect(() => {
    if (theme) setMode(theme);
  }, [theme]);

  const handleModeToggle = (newMode) => {
    setMode(newMode);
    setTheme(newMode);
    const preset = localStorage.getItem('theme_preset') || 'teal';
    if (preset !== 'custom') {
      applyPreset(preset, newMode);
    } else {
      const bgHex = newMode === 'dark' ? '#0F1B1E' : '#F5FAFB';
      applyTheme(newMode, { light: { primary: customColor, background: bgHex }, dark: { primary: customColor, background: bgHex } });
    }
  };

  const handleFontChange = (fontValue) => {
    setFont(fontValue);
    localStorage.setItem('custom_font', fontValue);
    document.documentElement.style.setProperty('--font-sans', fontValue);
  };

  const handleCustomColorChange = (hex) => {
    setCustomColor(hex);
    localStorage.setItem('custom_primary', hex);
    const bgHex = mode === 'dark' ? '#0F1B1E' : '#F5FAFB';
    applyTheme(mode, { light: { primary: hex, background: bgHex }, dark: { primary: hex, background: bgHex } });
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">Appearance</CardTitle>
        <CardDescription>Customize colors, fonts, and dark mode</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dark Mode Toggle */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Theme Mode</Label>
          <div className="flex gap-2">
            <Button
              variant={mode === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeToggle('light')}
              className="gap-2"
            >
              <Sun className="w-4 h-4" /> Light
            </Button>
            <Button
              variant={mode === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleModeToggle('dark')}
              className="gap-2"
            >
              <Moon className="w-4 h-4" /> Dark
            </Button>
          </div>
        </div>

        {/* Font Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Font</Label>
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map(f => (
              <Button
                key={f.value}
                variant={font === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFontChange(f.value)}
                style={{ fontFamily: f.value }}
              >
                {f.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Theme Presets */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Color Presets</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(THEMES).map(([key, theme]) => (
              <button
                key={key}
                onClick={() => applyPreset(key, mode)}
                className="p-3 rounded-lg border-2 border-transparent hover:border-primary/50 transition-all"
                title={theme.name}
              >
                <div className="flex gap-1.5 mb-2">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: theme.light.primary }}
                    title="Light"
                  />
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: theme.dark.primary }}
                    title="Dark"
                  />
                </div>
                <p className="text-xs font-medium">{theme.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Color */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Custom Color</Label>
          <div className="flex gap-2">
            <div
              className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer hover:border-primary/50 transition-colors"
              style={{ backgroundColor: customColor }}
              onClick={() => colorPickerRef.current?.click()}
              onDoubleClick={() => colorPickerRef.current?.click()}
              title="Double-click to pick from palette"
            />
            <input
              type="color"
              value={customColor}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              className="hidden"
              ref={colorPickerRef}
            />
            <Input
              type="text"
              placeholder="#000000"
              value={customColor}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-F]{6}$/i.test(val)) {
                  handleCustomColorChange(val);
                }
              }}
              className="font-mono text-sm flex-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}