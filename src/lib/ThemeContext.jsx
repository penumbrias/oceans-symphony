import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const FONT_OPTIONS = [
  { label: 'Inter', value: 'inter' },
  { label: 'Playfair Display', value: 'display' },
  { label: 'System Sans', value: 'system-sans' },
  { label: 'Georgia', value: 'georgia' },
  { label: 'Courier', value: 'courier' },
  { label: 'Trebuchet MS', value: 'trebuchet' },
  { label: 'Verdana', value: 'verdana' },
  { label: 'Comic Sans', value: 'comic-sans' },
];

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
  charcoal: {
    light: {
      bg: '#FAFAFA',
      surface: '#F3F3F3',
      primary: '#4A4A4A',
      secondary: '#E5E5E5',
      accent: '#6B6B6B',
      muted: '#CCCCCC',
      'text-primary': '#0D0D0D',
      'text-secondary': '#4A4A4A',
    },
    dark: {
      bg: '#0F0F0F',
      surface: '#1A1A1A',
      primary: '#808080',
      secondary: '#2A2A2A',
      accent: '#9D9D9D',
      muted: '#404040',
      'text-primary': '#F0F0F0',
      'text-secondary': '#BFBFBF',
    },
  },
  ivory: {
    light: {
      bg: '#FFFEF9',
      surface: '#F8F6F1',
      primary: '#8B7355',
      secondary: '#E8E5DC',
      accent: '#A68B7E',
      muted: '#D4CEC3',
      'text-primary': '#3E3E38',
      'text-secondary': '#6B6660',
    },
    dark: {
      bg: '#2A2824',
      surface: '#37332D',
      primary: '#8B7355',
      secondary: '#4A4641',
      accent: '#A68B7E',
      muted: '#5A5550',
      'text-primary': '#E8E5DC',
      'text-secondary': '#C4BFB4',
    },
  },
};

// Custom preset themes (from user screenshots)
const CUSTOM_PRESETS = {
  antiquePeach: { 
    light: { bg: '#FFE8D1', surface: '#FFE8D1', primary: '#F4A460', secondary: '#FFE8D1', accent: '#D2691E', muted: '#DEB887', 'text-primary': '#5C4033', 'text-secondary': '#8B6F47' },
    dark: { bg: '#3E2723', surface: '#5D4037', primary: '#FF8C42', secondary: '#4E342E', accent: '#FF6F00', muted: '#795548', 'text-primary': '#EFEBE9', 'text-secondary': '#BCAAA4' }
  },
  oceanBlue: {
    light: { bg: '#5E8EA3', surface: '#6BA3B8', primary: '#4A7BA7', secondary: '#B8E1F0', accent: '#2F5C7D', muted: '#7DADCF', 'text-primary': '#0D2D44', 'text-secondary': '#1A4D6B' },
    dark: { bg: '#0D2D44', surface: '#1A4D6B', primary: '#4A7BA7', secondary: '#2F5C7D', accent: '#6BA3B8', muted: '#3A6B8F', 'text-primary': '#B8E1F0', 'text-secondary': '#7DADCF' }
  },
  amethyst: {
    light: { bg: '#E8D5F2', surface: '#D4B5E8', primary: '#9B59B6', secondary: '#D4B5E8', accent: '#8E44AD', muted: '#C9AFDE', 'text-primary': '#4A235A', 'text-secondary': '#6B3A7D' },
    dark: { bg: '#2C1A3E', surface: '#441A5E', primary: '#BA68C8', secondary: '#6B3A7D', accent: '#CE93D8', muted: '#7B4A8F', 'text-primary': '#E8D5F2', 'text-secondary': '#D4B5E8' }
  },
  salmonSunset: {
    light: { bg: '#FFD4CC', surface: '#FFCFC5', primary: '#FF6B4A', secondary: '#FFDDD4', accent: '#FF9A6E', muted: '#FFBFA7', 'text-primary': '#8B3A2B', 'text-secondary': '#B8594A' },
    dark: { bg: '#3D1F1A', surface: '#5A2F27', primary: '#FF9A6E', secondary: '#7A4033', accent: '#FFAC81', muted: '#8B5F52', 'text-primary': '#FFCFC5', 'text-secondary': '#FFBFA7' }
  },
  dustyRose: {
    light: { bg: '#E8CCC7', surface: '#D9B8B1', primary: '#B98580', secondary: '#E8CCC7', accent: '#A67C78', muted: '#D4A49F', 'text-primary': '#5C3F39', 'text-secondary': '#8B5A54' },
    dark: { bg: '#3D2928', surface: '#522F2A', primary: '#C9A8A3', secondary: '#6B4743', accent: '#D4A49F', muted: '#8B6962', 'text-primary': '#E8CCC7', 'text-secondary': '#D9B8B1' }
  },
  forestGreen: {
    light: { bg: '#D4E8D4', surface: '#C4DEC4', primary: '#5BA65B', secondary: '#DCEAE0', accent: '#4A8F4A', muted: '#B8D4B8', 'text-primary': '#234A23', 'text-secondary': '#3A6B3A' },
    dark: { bg: '#1A3A1A', surface: '#2D4A2D', primary: '#7BC87B', secondary: '#3A6B3A', accent: '#9ACD9A', muted: '#5A8F5A', 'text-primary': '#D4E8D4', 'text-secondary': '#C4DEC4' }
  },
  softLavender: {
    light: { bg: '#F0E8F5', surface: '#E8DFF0', primary: '#B8A3D4', secondary: '#E8DFF0', accent: '#9B8DB8', muted: '#D9CCEB', 'text-primary': '#5A3F75', 'text-secondary': '#7B5A99' },
    dark: { bg: '#3A2D52', surface: '#4A3A63', primary: '#C9AFDB', secondary: '#6B5483', accent: '#DAC5EB', muted: '#8B7BA3', 'text-primary': '#F0E8F5', 'text-secondary': '#E8DFF0' }
  },
  mintGreen: {
    light: { bg: '#D4EDEA', surface: '#C4E4E0', primary: '#5BB8A8', secondary: '#DFF0EE', accent: '#4A9A8F', muted: '#B8D9D1', 'text-primary': '#1A5A52', 'text-secondary': '#2D8B78' },
    dark: { bg: '#1A3A38', surface: '#2D5A54', primary: '#7BC9B8', secondary: '#3D7B6F', accent: '#9ADCD9', muted: '#5A9B90', 'text-primary': '#D4EDEA', 'text-secondary': '#C4E4E0' }
  },
};

export const ALL_PRESETS = { ...THEME_PRESETS, ...CUSTOM_PRESETS };

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
  const [selectedFont, setSelectedFont] = useState('inter');
  const [userCustomPresets, setUserCustomPresets] = useState({});
  const [alterThemeLinks, setAlterThemeLinks] = useState({}); // { alterId: presetName }
  const [mounted, setMounted] = useState(false);
  const [isDarkOS, setIsDarkOS] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('symphony_themeMode');
    const savedTheme = localStorage.getItem('symphony_selectedTheme');
    const savedCustom = localStorage.getItem('symphony_customColors');
    const savedFont = localStorage.getItem('symphony_selectedFont');
    const savedUserPresets = localStorage.getItem('symphony_userCustomPresets');
    const savedLinks = localStorage.getItem('symphony_alterThemeLinks');

    setThemeMode(saved || 'system');
    setSelectedTheme(savedTheme || 'cool');
    if (savedCustom) setCustomColors(JSON.parse(savedCustom));
    if (savedFont) setSelectedFont(savedFont);
    if (savedUserPresets) setUserCustomPresets(JSON.parse(savedUserPresets));
    if (savedLinks) setAlterThemeLinks(JSON.parse(savedLinks));
    
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
    localStorage.setItem('symphony_selectedFont', selectedFont);
    localStorage.setItem('symphony_userCustomPresets', JSON.stringify(userCustomPresets));
    localStorage.setItem('symphony_alterThemeLinks', JSON.stringify(alterThemeLinks));
    
    const isDark = themeMode === 'dark' || (themeMode === 'system' && isDarkOS);
    document.documentElement.classList.toggle('dark', isDark);
    
    let colors;
    if (customColors) {
      colors = isDark ? customColors.dark : customColors.light;
    } else {
      const theme = ALL_PRESETS[selectedTheme] || userCustomPresets[selectedTheme];
      colors = isDark ? theme?.dark : theme?.light;
    }

    if (colors) {
      for (const [key, value] of Object.entries(colors)) {
        document.documentElement.style.setProperty(`--color-${key}`, value);
      }
    }

    // Update theme-color meta tag to match the app background (for APK status bar)
    const bgColor = colors.bg || colors['bg'];
    if (bgColor) {
      let metaTag = document.querySelector('meta[name="theme-color"]:not([media])');
      if (!metaTag) {
        // Remove media-conditional ones and add a single one
        document.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove());
        metaTag = document.createElement('meta');
        metaTag.name = 'theme-color';
        document.head.appendChild(metaTag);
      }
      metaTag.content = bgColor;
    }
  }, [themeMode, selectedTheme, customColors, mounted, isDarkOS, selectedFont, userCustomPresets]);

  const updateCustomColors = (newLight) => {
    const newDark = generateDarkTheme(newLight);
    setCustomColors({ light: newLight, dark: newDark });
    setSelectedTheme('custom');
  };

  const updateCustomColorsFull = (newLight, newDark) => {
    setCustomColors({ light: newLight, dark: newDark });
    setSelectedTheme('custom');
  };

  const clearCustomColors = () => {
    setCustomColors(null);
  };

  const saveCustomPreset = (name, colors) => {
    setUserCustomPresets(prev => ({ ...prev, [name]: colors }));
  };

  const deleteUserPreset = (name) => {
    setUserCustomPresets(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    // Clear alter links pointing to this deleted preset
    setAlterThemeLinks(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => { if (next[id] === name) delete next[id]; });
      return next;
    });
  };

  const linkAlterTheme = (alterId, presetName) => {
    setAlterThemeLinks(prev => ({ ...prev, [alterId]: presetName }));
  };

  const unlinkAlterTheme = (alterId) => {
    setAlterThemeLinks(prev => {
      const next = { ...prev };
      delete next[alterId];
      return next;
    });
  };

  const cycleThemeMode = () => {
    const modes = ['system', 'light', 'dark'];
    const idx = modes.indexOf(themeMode);
    setThemeMode(modes[(idx + 1) % modes.length]);
  };

  return (
    <ThemeContext.Provider value={{
      themeMode,
      setThemeMode,
      selectedTheme,
      customColors,
      updateCustomColors,
      updateCustomColorsFull,
      clearCustomColors,
      cycleThemeMode,
      presets: THEME_PRESETS,
      setSelectedTheme,
      selectedFont,
      setSelectedFont,
      userCustomPresets,
      saveCustomPreset,
      deleteUserPreset,
      alterThemeLinks,
      linkAlterTheme,
      unlinkAlterTheme,
      allPresets: ALL_PRESETS,
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