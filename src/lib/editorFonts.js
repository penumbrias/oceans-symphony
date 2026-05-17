// Editor/content fonts — bundled locally for offline-first use.
// Imported lazily by MiniToolbar so they only load when the editor is opened.
//
// Latin + Latin-Ext subsets only to keep the bundle small. A handful of
// packages don't ship a latin-ext subset (satisfy, orbitron, nanum-gothic,
// tajawal) — we import latin-only for those. Users typing in non-Latin
// scripts (Cyrillic, Arabic, Japanese, Korean, Devanagari, etc.) will see
// the editor fall back to a system font for those characters. Opt-in
// download of additional subsets is planned for a future release.

import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-ext-400.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-ext-400.css';
import '@fontsource/raleway/latin-400.css';
import '@fontsource/raleway/latin-ext-400.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-ext-400.css';
import '@fontsource/merriweather/latin-400.css';
import '@fontsource/merriweather/latin-ext-400.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-ext-400.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-ext-400.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat/latin-ext-400.css';
import '@fontsource/dancing-script/latin-400.css';
import '@fontsource/dancing-script/latin-ext-400.css';
import '@fontsource/pacifico/latin-400.css';
import '@fontsource/pacifico/latin-ext-400.css';
import '@fontsource/satisfy/latin-400.css'; // latin-ext not published
import '@fontsource/righteous/latin-400.css';
import '@fontsource/righteous/latin-ext-400.css';
import '@fontsource/lobster/latin-400.css';
import '@fontsource/lobster/latin-ext-400.css';
import '@fontsource/bungee/latin-400.css';
import '@fontsource/bungee/latin-ext-400.css';
import '@fontsource/orbitron/latin-400.css'; // latin-ext not published
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/latin-ext-400.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/vt323/latin-ext-400.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-ext-400.css';
import '@fontsource/noto-serif/latin-400.css';
import '@fontsource/noto-serif/latin-ext-400.css';
import '@fontsource/sawarabi-mincho/latin-400.css';
import '@fontsource/sawarabi-mincho/latin-ext-400.css';
import '@fontsource/nanum-gothic/latin-400.css'; // latin-ext not published
import '@fontsource/amiri/latin-400.css';
import '@fontsource/amiri/latin-ext-400.css';
import '@fontsource/tajawal/latin-400.css'; // latin-ext not published
