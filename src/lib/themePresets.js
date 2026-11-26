// The built-in colour themes (8 colours per light and dark mode), moved
// out of ThemeContext.jsx unchanged so pure code (the new house's paint
// translator, src/house/paint/translate.js) and its tests can read them.
// ThemeContext imports and re-exports ALL_PRESETS, so nothing else moved.

// The theme a fresh install shows (ThemeContext's fallback).
export const DEFAULT_THEME = "cool";

export const THEME_PRESETS = {
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
export const CUSTOM_PRESETS = {
  // The pixel look's own colours (owner, 2026-11-25): a deep-sea base drawn
  // from Penumblob's sprite (#26293e shade, #343853 body, #454b6c highlight)
  // with the mockups' warm amber for actions and selected things and a soft
  // periwinkle beside it (owner, 2026-11-26: the bright teal was "cheap gum").
  pixel: {
    light: { bg: '#E3E8F1', surface: '#F1F4F9', primary: '#A8692B', secondary: '#D2D9E7', accent: '#565D86', muted: '#B8C0D6', 'text-primary': '#1A1C2B', 'text-secondary': '#3B405D' },
    dark: { bg: '#1C1F31', surface: '#26293E', primary: '#E8A65D', secondary: '#343853', accent: '#6D73B0', muted: '#454B6C', 'text-primary': '#E7EAF6', 'text-secondary': '#C4CAE3' }
  },
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
