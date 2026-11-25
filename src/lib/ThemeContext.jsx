import React, { createContext, useContext, useEffect, useState } from 'react';
import { recordPresetRemoved, clearPresetRemoved } from '@/lib/presetSync';
import { onColorVars } from "@/lib/contrast";
import { ALL_PRESETS, THEME_PRESETS } from "@/lib/themePresets";


// A corrupt value in one of the theme keys used to throw inside the
// provider's mount effect and blank the whole app on boot.
const safeParse = (raw, fallback) => { try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; } };
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

// The built-in colour themes live in themePresets.js (pure data, so the new
// house's paint translator and its tests can read them without React).
export { ALL_PRESETS };

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
  // Three modes: 'dark' (default), 'light', and 'system' (mirrors the OS
  // prefers-color-scheme). The earlier OS-follow bug came from preserving
  // 'system' as the saved value but reading the OS at the wrong time and
  // sometimes inverting the result. This implementation just reads
  // matchMedia('(prefers-color-scheme: dark)').matches whenever the mode
  // is 'system' and toggles the document.documentElement.dark class
  // accordingly, with a live listener so the app updates if the OS
  // setting flips while it's running. No legacy quirks.
  const [themeMode, setThemeMode] = useState('dark');
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

    // Accept 'light' | 'dark' | 'system'. Default 'dark' on first run.
    const normalized = ['light', 'dark', 'system'].includes(saved) ? saved : 'dark';
    setThemeMode(normalized);
    setSelectedTheme(savedTheme || 'cool');
    if (savedCustom) setCustomColors(safeParse(savedCustom, null));
    if (savedFont) setSelectedFont(savedFont);
    if (savedUserPresets) setUserCustomPresets(safeParse(savedUserPresets, {}));
    if (savedLinks) setAlterThemeLinks(safeParse(savedLinks, {}));
    
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkOS(darkMq.matches);
    const handler = (e) => setIsDarkOS(e.matches);
    darkMq.addEventListener('change', handler);

    // Allow external code (e.g. Preview Mode) to update theme/font/mode/
    // user-presets/alter-links by writing to localStorage and dispatching
    // this event. We re-read all of the theme keys so the running app
    // reflects the change immediately.
    const reload = () => {
      const raw = localStorage.getItem('symphony_themeMode');
      setThemeMode(['light', 'dark', 'system'].includes(raw) ? raw : 'dark');
      setSelectedTheme(localStorage.getItem('symphony_selectedTheme') || 'cool');
      const cc = localStorage.getItem('symphony_customColors');
      setCustomColors(cc ? safeParse(cc, null) : null);
      setSelectedFont(localStorage.getItem('symphony_selectedFont') || 'inter');
      const presetsRaw = localStorage.getItem('symphony_userCustomPresets');
      setUserCustomPresets(presetsRaw ? safeParse(presetsRaw, {}) : {});
      const linksRaw = localStorage.getItem('symphony_alterThemeLinks');
      setAlterThemeLinks(linksRaw ? safeParse(linksRaw, {}) : {});
    };
    window.addEventListener('symphony-theme-storage-change', reload);

    setMounted(true);
    return () => {
      darkMq.removeEventListener('change', handler);
      window.removeEventListener('symphony-theme-storage-change', reload);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    localStorage.setItem('symphony_themeMode', themeMode);
    // The untouched default is not written down, so "never picked a theme"
    // stays readable (the new house paints the mockups' palette then). The
    // old house reads the same 'cool' either way; any real pick is written.
    if (selectedTheme !== 'cool' || localStorage.getItem('symphony_selectedTheme') !== null) {
      localStorage.setItem('symphony_selectedTheme', selectedTheme);
    }
    // Persist customColors when set, REMOVE the localStorage entry when
    // cleared. The old "if (customColors) localStorage.setItem(...)" only
    // wrote when truthy, never deleted when falsy — so once a user set
    // custom colours, picking a preset later didn't actually undo them on
    // the next reload; the stale localStorage value would override the
    // preset.
    if (customColors) localStorage.setItem('symphony_customColors', JSON.stringify(customColors));
    else localStorage.removeItem('symphony_customColors');
    localStorage.setItem('symphony_selectedFont', selectedFont);
    localStorage.setItem('symphony_userCustomPresets', JSON.stringify(userCustomPresets));
    localStorage.setItem('symphony_alterThemeLinks', JSON.stringify(alterThemeLinks));
    
    // In 'system' mode, mirror the OS's current prefers-color-scheme. In
    // 'light' or 'dark' mode, ignore the OS entirely and honour the user
    // pick. The matchMedia listener mounted up in the init effect keeps
    // isDarkOS fresh, so this re-runs whenever the OS flips.
    const isDark = themeMode === 'dark' || (themeMode === 'system' && isDarkOS);
    document.documentElement.classList.toggle('dark', isDark);

    // Tell the browser explicitly which colour scheme this page handles.
    // Without this, Android Chrome's "force-dark" / iOS Safari's auto-dark
    // would invert the page when the OS is in dark mode — that's the
    // "light mode looks dark when phone is dark" bug the user reported.
    // `only light` / `only dark` disable the OS-level override outright;
    // for system mode we keep `light dark` (browser-correct) and rely on
    // our own class toggle above.
    document.documentElement.style.colorScheme =
      themeMode === 'system' ? 'light dark' : (isDark ? 'only dark' : 'only light');
    
    let colors;
    if (customColors) {
      colors = isDark ? customColors.dark : customColors.light;
    } else {
      const theme = ALL_PRESETS[selectedTheme] || userCustomPresets[selectedTheme];
      colors = isDark ? theme?.dark : theme?.light;
    }

    if (colors) {
      // Convert a hex to an "H S% L%" triplet so legacy inline styles written as
      // `hsl(var(--key))` actually render. The theme only ever set
      // --color-${key} (a hex) and left --${key} empty, so the many
      // `hsl(var(--primary))` / `hsl(var(--muted-foreground))` usages across the
      // app resolved to an invalid hsl() → transparent. Exposing both (themed)
      // fixes every one of those at once.
      const hexToHslTriplet = (hex) => {
        if (typeof hex !== "string") return null;
        let h = hex.trim().replace(/^#/, "");
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        // 8-digit hex (per-color opacity from the unified edit popup):
        // the alpha rides in --color-* where CSS consumes it directly;
        // the HSL triplet drops it, since hsl(var(--x)) can't carry alpha.
        if (h.length === 8) h = h.slice(0, 6);
        if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
        const r = parseInt(h.slice(0, 2), 16) / 255;
        const g = parseInt(h.slice(2, 4), 16) / 255;
        const b = parseInt(h.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let hue = 0, sat = 0; const lum = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
          else if (max === g) hue = (b - r) / d + 2;
          else hue = (r - g) / d + 4;
          hue /= 6;
        }
        return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
      };
      const triplets = {};
      for (const [key, value] of Object.entries(colors)) {
        document.documentElement.style.setProperty(`--color-${key}`, value);
        const triplet = hexToHslTriplet(value);
        if (triplet) { triplets[key] = triplet; document.documentElement.style.setProperty(`--${key}`, triplet); }
      }
      // shadcn-style ALIASES (v0.190.2). ~120 files write inline
      // `hsl(var(--border))`, `hsl(var(--muted-foreground))`, `hsl(var(--
      // background))`… — names this app never defined, so every one of them
      // computed to transparent (invisible borders, missing tints: the
      // "name pushed off the card" chip, the see-through alters bar…).
      // Define them from the real palette, once, here.
      const alias = {
        background: triplets.bg, foreground: triplets["text-primary"],
        card: triplets.surface, "card-foreground": triplets["text-primary"],
        popover: triplets.surface, "popover-foreground": triplets["text-primary"],
        border: triplets.muted, input: triplets.surface, ring: triplets.primary,
        "muted-foreground": triplets["text-secondary"],
        "secondary-foreground": triplets["text-primary"],
        destructive: "0 84% 60%", "destructive-foreground": "0 0% 100%",
      };
      for (const [k, v] of Object.entries(alias)) if (v) document.documentElement.style.setProperty(`--${k}`, v);
      // The new UI's Highlight (ui_v2.tokens.accent → --v2-accent), when
      // set, IS the primary colour everywhere — page dots, focus rings,
      // buttons, links. AppLayout applies the token vars in its own effect
      // and this one used to run after it, silently putting the theme's
      // primary back — so a set Highlight painted the v2 chrome only and
      // the rest of the app disagreed. Re-assert it here, last.
      try {
        const hl = document.documentElement.style.getPropertyValue("--v2-accent").trim();
        const realHl = hl && !/^var\(/.test(hl) ? hl : "";
        if (realHl) {
          document.documentElement.style.setProperty("--color-primary", realHl);
          const t = hexToHslTriplet(realHl);
          if (t) document.documentElement.style.setProperty("--primary", t);
        }
        // Accent is merged with the highlight (the user's call — nothing
        // visibly rendered a separate accent): Highlight if set, else the
        // theme's Primary. Preset `accent` values are ignored on purpose.
        const acc = realHl || colors.primary;
        if (acc) {
          document.documentElement.style.setProperty("--color-accent", acc);
          const ta = hexToHslTriplet(acc);
          if (ta) document.documentElement.style.setProperty("--accent", ta);
        }
        // Text on the primary/accent: white only where it can be read,
        // otherwise near-black (UI critique C2 — white on amber/green/sky
        // was ~2:1).
        for (const [k, v] of Object.entries(onColorVars(realHl || colors.primary, acc))) {
          document.documentElement.style.setProperty(k, v);
        }
      } catch { /* non-fatal */ }
    }

    // Update theme-color meta tag to match the app background (for APK status bar).
    // Guard `colors` — it can be undefined when the user has cleared their
    // customColors but selectedTheme still points at "custom" (no real
    // preset to read). Without this guard, `colors.bg` throws.
    const bgColor = colors?.bg;
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

  // alter → theme links are saved on their own: the look effect above
  // doesn't list them, so a new link (or an unlink) used to be lost on the
  // next restart unless something else about the look changed too.
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('symphony_alterThemeLinks', JSON.stringify(alterThemeLinks));
  }, [alterThemeLinks, mounted]);

  const updateCustomColors = (newLight) => {
    const newDark = generateDarkTheme(newLight);
    setCustomColors({ light: newLight, dark: newDark });
    setSelectedTheme('custom');
  };

  const updateCustomColorsFull = (newLight, newDark) => {
    setCustomColors({ light: newLight, dark: newDark });
    setSelectedTheme('custom');
  };

  // Name of the auto-stash preset that keeps unsaved live colour edits
  // recoverable when something AUTOMATIC replaces them (a fronter-linked
  // preset switching in). Overwritten each time — it's a safety net, not
  // a history.
  const UNSAVED_STASH = "Unsaved colours (auto-kept)";

  const clearCustomColors = () => {
    setCustomColors(null);
  };

  // Clear the live custom colours BUT keep them: used by paths the user
  // did not trigger by hand. A tester "edited my theme all nice and now
  // it's just gone" — the fronter-linked preset switch had discarded
  // their unsaved edits. Now they land in the presets list under
  // UNSAVED_STASH, one tap from coming back.
  const stashAndClearCustomColors = () => {
    setCustomColors((cur) => {
      if (cur && (cur.light || cur.dark)) {
        setUserCustomPresets((prev) => ({ ...prev, [UNSAVED_STASH]: { light: { ...(cur.light || {}) }, dark: { ...(cur.dark || {}) } } }));
      }
      return null;
    });
  };

  // `_ut` stamps each save so device sync can tell which copy of a preset
  // is newer (src/lib/presetSync.js).
  const saveCustomPreset = (name, colors) => {
    clearPresetRemoved(name);
    setUserCustomPresets(prev => ({ ...prev, [name]: { ...colors, _ut: Date.now() } }));
  };

  const deleteUserPreset = (name) => {
    recordPresetRemoved(name);
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
    // Three-state cycle: Dark → Light → System (follow OS) → Dark.
    const order = ['dark', 'light', 'system'];
    const idx = order.indexOf(themeMode);
    setThemeMode(order[(idx + 1) % order.length]);
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
      stashAndClearCustomColors,
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