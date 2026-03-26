import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

const THEME_PRESETS = {
  warm: {
    light: {
      bg: '#FFF7ED',
      surface: '#FFE8D6',
      primary: '#F59E0B',
      secondary: '#FFEDD5',
      accent: '#FB923C',
      muted: '#E5C9A8',
      'text-primary': '#3B2F2F',
      'text-secondary': '#7C6A5D',
    },
    dark: {
      bg: '#1A120B',
      surface: '#2A1B12',
      primary: '#F59E0B',
      secondary: '#4A2E1F',
      accent: '#FB923C',
      muted: '#5A4636',
      'text-primary': '#FFF7ED',
      'text-secondary': '#D6C2B8',
    },
  },
  cool: {
    light: {
      bg: '#F0F9FF',
      surface: '#E0F2FE',
      primary: '#3B82F6',
      secondary: '#DBEAFE',
      accent: '#38BDF8',
      muted: '#B6D4E3',
      'text-primary': '#1E293B',
      'text-secondary': '#64748B',
    },
    dark: {
      bg: '#0B1220',
      surface: '#121A2A',
      primary: '#3B82F6',
      secondary: '#1E3A5F',
      accent: '#38BDF8',
      muted: '#334155',
      'text-primary': '#E0F2FE',
      'text-secondary': '#94A3B8',
    },
  },
  forest: {
    light: {
      bg: '#F0FDF4',
      surface: '#DCFCE7',
      primary: '#22C55E',
      secondary: '#BBF7D0',
      accent: '#4ADE80',
      muted: '#A7D7B5',
      'text-primary': '#052E16',
      'text-secondary': '#3F6B4F',
    },
    dark: {
      bg: '#071A12',
      surface: '#0F2419',
      primary: '#22C55E',
      secondary: '#14532D',
      accent: '#4ADE80',
      muted: '#2F4F3E',
      'text-primary': '#DCFCE7',
      'text-secondary': '#86EFAC',
    },
  },
  sunset: {
    light: {
      bg: '#FEF3C7',
      surface: '#FED7AA',
      primary: '#EF4444',
      secondary: '#FCA5A5',
      accent: '#F97316',
      muted: '#E8B4A8',
      'text-primary': '#7C2D12',
      'text-secondary': '#92400E',
    },
    dark: {
      bg: '#1F0F0B',
      surface: '#2A1810',
      primary: '#EF4444',
      secondary: '#7F1D1D',
      accent: '#F97316',
      muted: '#5A3D36',
      'text-primary': '#FED7AA',
      'text-secondary': '#FDBA74',
    },
  },
  ocean: {
    light: {
      bg: '#F0F9FF',
      surface: '#CFF0FF',
      primary: '#0369A1',
      secondary: '#BAE6FD',
      accent: '#06B6D4',
      muted: '#7DD3C0',
      'text-primary': '#082F49',
      'text-secondary': '#0C4A6E',
    },
    dark: {
      bg: '#082F49',
      surface: '#0C4A6E',
      primary: '#0369A1',
      secondary: '#164E63',
      accent: '#06B6D4',
      muted: '#155E75',
      'text-primary': '#CFF0FF',
      'text-secondary': '#A5F3FC',
    },
  },
  berry: {
    light: {
      bg: '#FDF2F8',
      surface: '#FBCFE8',
      primary: '#EC4899',
      secondary: '#F472B6',
      accent: '#D946EF',
      muted: '#E8B4E0',
      'text-primary': '#500724',
      'text-secondary': '#831843',
    },
    dark: {
      bg: '#1F0B2E',
      surface: '#2D1645',
      primary: '#EC4899',
      secondary: '#6B1B47',
      accent: '#D946EF',
      muted: '#5A3668',
      'text-primary': '#FBCFE8',
      'text-secondary': '#F0ABFC',
    },
  },
};

// Convert HEX to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

// Convert RGB to HEX
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

// Convert HEX to HSL
function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Convert HSL to HEX
function hslToHex(h, s, l) {
  h = h / 360; s = s / 100; l = l / 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

// Auto-generate dark mode from light mode
function generateDarkTheme(lightColors) {
  const dark = {};
  for (const [key, hex] of Object.entries(lightColors)) {
    const hsl = hexToHsl(hex);
    if (!hsl) continue;
    let newL = 100 - hsl.l;
    let newS = Math.round(hsl.s * 0.85);
    
    if (key === 'bg') newL = Math.max(6, Math.min(12, newL));
    else if (key === 'surface') newL = Math.max(10, Math.min(18, newL));
    else if (key.includes('text')) newL = Math.max(85, newL);
    
    dark[key] = hslToHex(hsl.h, newS, newL);
  }
  return dark;
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeMode] = useState('system');
  const [selectedTheme, setSelectedTheme] = useState('cool');
  const [customColors, setCustomColors] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [isDarkOS, setIsDarkOS] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('symphony_themeMode');
    const savedTheme = localStorage.getItem('symphony_selectedTheme');
    const savedCustom = localStorage.getItem('symphony_customColors');
    
    setThemeMode(saved || 'system');
    setSelectedTheme(savedTheme || 'cool');
    if (savedCustom) setCustomColors(JSON.parse(savedCustom));
    
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkOS(darkMq.matches);
    const handler = (e) => setIsDarkOS(e.matches);
    darkMq.addEventListener('change', handler);
    setMounted(true);
    return () => darkMq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    localStorage.setItem('symphony_themeMode', themeMode);
    localStorage.setItem('symphony_selectedTheme', selectedTheme);
    if (customColors) localStorage.setItem('symphony_customColors', JSON.stringify(customColors));
    
    const isDark = themeMode === 'dark' || (themeMode === 'system' && isDarkOS);
    document.documentElement.classList.toggle('dark', isDark);
    
    let colors;
    if (customColors) {
      colors = isDark ? customColors.dark : customColors.light;
    } else {
      colors = isDark ? THEME_PRESETS[selectedTheme].dark : THEME_PRESETS[selectedTheme].light;
    }
    
    for (const [key, value] of Object.entries(colors)) {
      document.documentElement.style.setProperty(`--color-${key}`, value);
    }
  }, [themeMode, selectedTheme, customColors, mounted, isDarkOS]);

  const updateCustomColors = (newLight) => {
    const newDark = generateDarkTheme(newLight);
    setCustomColors({ light: newLight, dark: newDark });
    setSelectedTheme('custom');
  };

  const cycleThemeMode = () => {
    const modes = ['system', 'light', 'dark'];
    const idx = modes.indexOf(themeMode);
    setThemeMode(modes[(idx + 1) % modes.length]);
  };

  return (
    <ThemeContext.Provider value={{
      themeMode,
      selectedTheme,
      customColors,
      updateCustomColors,
      cycleThemeMode,
      presets: THEME_PRESETS,
      setSelectedTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}