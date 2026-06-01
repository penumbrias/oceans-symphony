// Optional "extra fonts" pack — kept OUT of the bundled app so it doesn't
// bloat the install. The 14 extra display/handwriting/serif/etc. fonts are
// fetched on demand from Google Fonts only when the user opts in
// (Settings → Appearance → "Extra fonts"). After the first download the
// browser/service-worker caches them, so they keep working offline.
//
// The family list here MUST stay in sync with EXTRA_FONT_OPTIONS in
// useAccessibility.js (same families, same spelling).

const LS_KEY = "symphony_extra_fonts_installed_v1";
const LINK_ID = "symphony-extra-fonts";

// One Google Fonts request for every extra family (latin; weight 400).
const GF_URL =
  "https://fonts.googleapis.com/css2" +
  "?family=Abril+Fatface" +
  "&family=Bangers" +
  "&family=Bebas+Neue" +
  "&family=Bitter" +
  "&family=Comfortaa" +
  "&family=EB+Garamond" +
  "&family=Indie+Flower" +
  "&family=JetBrains+Mono" +
  "&family=Josefin+Sans" +
  "&family=Patrick+Hand" +
  "&family=Permanent+Marker" +
  "&family=Quicksand" +
  "&family=Shadows+Into+Light" +
  "&family=Work+Sans" +
  "&display=swap";

export function isExtraFontsInstalled() {
  try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
}

// Inject the stylesheet <link> if it isn't already present. Returns the
// link element (or null when there's no document, e.g. SSR/tests).
function injectLink() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(LINK_ID);
  if (existing) return existing;
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = GF_URL;
  document.head.appendChild(link);
  return link;
}

// Called on boot — only injects when the user has previously opted in.
export function loadExtraFontsIfInstalled() {
  if (isExtraFontsInstalled()) injectLink();
}

// User opts in: persist the flag and inject. Resolves once the stylesheet
// has loaded (so the UI can confirm), rejects if it fails to download.
export function installExtraFonts() {
  return new Promise((resolve, reject) => {
    const link = injectLink();
    if (!link) { reject(new Error("Fonts can't be installed here")); return; }
    try { localStorage.setItem(LS_KEY, "true"); } catch { /* storage off */ }
    if (link.sheet) { resolve(); return; }              // already loaded
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      ok ? resolve() : reject(new Error("Couldn't download the fonts — check your connection."));
    };
    link.addEventListener("load", () => done(true), { once: true });
    link.addEventListener("error", () => done(false), { once: true });
    // Safety net: if neither event fires within 8s, treat it as a SUCCESS
    // only if the stylesheet actually parsed (link.sheet is set); otherwise
    // fail so the UI doesn't claim "downloaded" while offline/blocked.
    setTimeout(() => done(!!link.sheet), 8000);
  });
}

// User opts out: drop the flag and remove the stylesheet. Their selected
// font (if it was an extra one) will fall back to the system default until
// they re-download.
export function uninstallExtraFonts() {
  try { localStorage.removeItem(LS_KEY); } catch { /* storage off */ }
  const link = typeof document !== "undefined" && document.getElementById(LINK_ID);
  if (link) link.remove();
}
