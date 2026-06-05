import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Upload, X, Palette, Eye, ArrowRight, ArrowLeft, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { SubSection, IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import { PROFILE_FONTS, fontStackFor } from "@/lib/profileFonts";
import { isLocalMode } from "@/lib/storageMode";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { profileThemeCss, profileSurfaceCss } from "@/lib/profileStyle";

// Shared profile-style editor for alter AND group profiles. Renders the
// collapsible Header + Body sub-blocks that the hand-drawn redesign calls for:
// each with a background colour, image, text colour, and font. The header also
// carries a visibility toggle. Everything writes to the profile's
// `custom_fields` via the supplied setField/clearField callbacks, using the
// same keys the profile renderers consume (AlterProfile / ProfileTab /
// GroupProfile).
//
// Header subsection is open by default; Body is collapsed — matching the
// wireframe ("header on + expanded; body off").

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
// _bg_opacity = opacity of the BODY background layer. With an image set it's
// the image's opacity (default 0.5); with only a colour it's that colour's
// opacity (default 0.15).
const BG_OPACITY_KEY = "_bg_opacity";
// _section_bg_opacity = "Readability". When a background image is set, this is
// the opacity of the _bg_color tint laid over the image so text stays legible
// (default 0.1 / 10%).
const SECTION_BG_KEY = "_section_bg_opacity";
const HEADER_BG_KEY = "_header_bg_color";
const HEADER_IMAGE_KEY = "_header_image";
const HEADER_TEXT_KEY = "_header_text_color";
const HEADER_FONT_KEY = "_header_font";
// _header_opacity = opacity of the header background image (default 0.45).
const HEADER_OPACITY_KEY = "_header_opacity";
// _header_bg_opacity = opacity of the header background COLOUR fill (default 1
// / fully opaque). Mirrors the Body's bg-colour opacity slider so the header
// colour can be made translucent.
const HEADER_BG_OPACITY_KEY = "_header_bg_opacity";
const HIDE_HEADER_KEY = "_hide_header";
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";

// Per-profile theme palette keys (mirror PS.* in profileStyle.js). Eight theme
// colours + a wave colour. When set they override the app theme for this
// profile's pages via profileThemeCss().
const THEME_KEYS = [
  { key: "_theme_bg", label: "Background" },
  { key: "_theme_surface", label: "Surface" },
  { key: "_theme_primary", label: "Primary" },
  { key: "_theme_secondary", label: "Secondary" },
  { key: "_theme_accent", label: "Accent" },
  { key: "_theme_muted", label: "Muted" },
  { key: "_theme_text", label: "Text" },
  { key: "_theme_text2", label: "Text 2nd" },
];
const THEME_WAVE_KEY = "_theme_wave";

// BODY palette — the full custom-colour set (same as Settings → Appearance),
// INCLUDING the wave. Background + Text keep the existing body keys (so existing
// profiles render unchanged); the deeper colours use the per-profile theme keys
// (rendered page-wide by profileThemeCss on .os-pf). Wave is body-only.
const BODY_PALETTE = [
  { key: BG_COLOR_KEY, label: "Background" },
  { key: "_theme_surface", label: "Surface" },
  { key: "_theme_primary", label: "Primary" },
  { key: "_theme_secondary", label: "Secondary" },
  { key: "_theme_accent", label: "Accent" },
  { key: "_theme_muted", label: "Muted" },
  { key: PAGE_TEXT_KEY, label: "Text" },
  { key: "_theme_text2", label: "Text 2nd" },
];
// Wave is body-only and shown as a tall swatch on the right (matching the
// Settings → Appearance layout).
const WAVE_ENTRY = { key: THEME_WAVE_KEY, label: "Wave" };

// Body ↔ header pairs for the Sync feature (and the live "lock" link). Each
// pair is [bodyKey, headerKey]; the palette colours + font + bg-opacity.
// Images are deliberately NOT synced (banner vs page usually differ).
const SYNC_PAIRS = [
  [BG_COLOR_KEY, HEADER_BG_KEY],                      // background
  ["_theme_surface", "_header_theme_surface"],        // surface
  ["_theme_primary", "_header_theme_primary"],        // primary
  ["_theme_secondary", "_header_theme_secondary"],    // secondary
  ["_theme_accent", "_header_theme_accent"],          // accent
  ["_theme_muted", "_header_theme_muted"],            // muted
  [PAGE_TEXT_KEY, HEADER_TEXT_KEY],                   // text
  ["_theme_text2", "_header_theme_text2"],            // text 2nd
  [PAGE_FONT_KEY, HEADER_FONT_KEY],                   // font
  [BG_OPACITY_KEY, HEADER_BG_OPACITY_KEY],            // background opacity
];
// key → its paired key, both directions (for the live lock).
const SYNC_MAP = {};
for (const [bodyKey, headerKey] of SYNC_PAIRS) { SYNC_MAP[bodyKey] = headerKey; SYNC_MAP[headerKey] = bodyKey; }

// Each palette key → the CSS variable that colour role currently resolves to.
// When a swatch ISN'T explicitly overridden we paint it with var(<thisvar>) so
// it shows the LIVE effective colour (app theme, or this profile's theme),
// making it obvious what each swatch controls. The vars update live as the
// user edits (the editor injects the in-progress theme), so siblings reflect
// changes immediately too.
const LIVE_VAR = {
  [BG_COLOR_KEY]: "--color-bg",
  "_theme_surface": "--color-surface",
  "_theme_primary": "--color-primary",
  "_theme_secondary": "--color-secondary",
  "_theme_accent": "--color-accent",
  "_theme_muted": "--color-muted",
  [PAGE_TEXT_KEY]: "--color-text-primary",
  "_theme_text2": "--color-text-secondary",
  [THEME_WAVE_KEY]: "--color-wave",
  [HEADER_BG_KEY]: "--color-bg",
  "_header_theme_surface": "--color-surface",
  "_header_theme_primary": "--color-primary",
  "_header_theme_secondary": "--color-secondary",
  "_header_theme_accent": "--color-accent",
  "_header_theme_muted": "--color-muted",
  [HEADER_TEXT_KEY]: "--color-text-primary",
  "_header_theme_text2": "--color-text-secondary",
};
// HEADER palette — the same set MINUS the wave (the wave doesn't render in the
// header). Background + Text keep the existing header keys (so the banner paints
// exactly as before); the deeper colours use header-scoped keys applied only to
// the header via headerThemeStyleVars(). Independent of the body palette.
const HEADER_PALETTE = [
  { key: HEADER_BG_KEY, label: "Background" },
  { key: "_header_theme_surface", label: "Surface" },
  { key: "_header_theme_primary", label: "Primary" },
  { key: "_header_theme_secondary", label: "Secondary" },
  { key: "_header_theme_accent", label: "Accent" },
  { key: "_header_theme_muted", label: "Muted" },
  { key: HEADER_TEXT_KEY, label: "Text" },
  { key: "_header_theme_text2", label: "Text 2nd" },
];

function FontSelect({ value, onChange, ariaLabel }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="w-full text-sm rounded-md border border-input bg-background px-2 py-2"
      style={{ fontFamily: fontStackFor(value) || undefined }}
    >
      {PROFILE_FONTS.map((f) => (
        <option key={f.id || "default"} value={f.id} style={{ fontFamily: f.stack || undefined }}>{f.label}</option>
      ))}
    </select>
  );
}

export default function ProfileStyleEditor({ customFields, setField, clearField }) {
  const cf = customFields || {};
  const [colorPickerFor, setColorPickerFor] = useState(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const headerFileRef = useRef(null);
  const bgFileRef = useRef(null);
  // Sync controls: which way the one-tap "Sync" copies (headerToBody = →), and
  // whether the live "lock" link is on (any change to one side mirrors to the
  // other instantly).
  const [syncDir, setSyncDir] = useState("headerToBody");
  const [syncLocked, setSyncLocked] = useState(false);

  // setField/clearField that ALSO mirror to the paired header/body key while the
  // live lock is on. Used by the colour swatches so locking truly links the two
  // palettes as you edit.
  const setFieldSynced = (key, val) => {
    setField(key, val);
    if (syncLocked && SYNC_MAP[key]) setField(SYNC_MAP[key], val);
  };
  const clearFieldSynced = (key) => {
    clearField(key);
    if (syncLocked && SYNC_MAP[key]) clearField(SYNC_MAP[key]);
  };

  const headerImage = cf[HEADER_IMAGE_KEY] || "";
  const bgImage = cf[BG_IMAGE_KEY] || "";
  const [resolvedHeaderImg, setResolvedHeaderImg] = useState("");
  const [resolvedBgImg, setResolvedBgImg] = useState("");
  useEffect(() => {
    if (!headerImage) { setResolvedHeaderImg(""); return; }
    resolveImageUrl(headerImage).then((r) => setResolvedHeaderImg(r || "")).catch(() => setResolvedHeaderImg(""));
  }, [headerImage]);
  useEffect(() => {
    if (!bgImage) { setResolvedBgImg(""); return; }
    resolveImageUrl(bgImage).then((r) => setResolvedBgImg(r || "")).catch(() => setResolvedBgImg(""));
  }, [bgImage]);

  const uploadImage = async (file, key, setBusy, maxDim, quality) => {
    if (!file) return;
    setBusy(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, maxDim, quality);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `${key === HEADER_IMAGE_KEY ? "header" : "bg"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setField(key, createLocalImageUrl(imageId));
      } else {
        setField(key, dataUrl);
      }
      toast.success(isGif ? "GIF saved!" : "Image saved!");
    } catch {
      toast.error("Failed to process image");
    } finally {
      setBusy(false);
    }
  };

  const colorRow = (label, fieldKey) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setColorPickerFor(fieldKey)}
          className="w-8 h-8 rounded-lg border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0 shadow-sm flex items-center justify-center"
          style={{ backgroundColor: cf[fieldKey] || "transparent" }}
          title={`${label} — pick colour`}
          aria-label={`${label} — pick colour`}
        >
          {!cf[fieldKey] && <Palette className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{cf[fieldKey] || "Not set"}</span>
        {cf[fieldKey] && <IconButton icon={X} title={`Clear ${label.toLowerCase()}`} onClick={() => clearField(fieldKey)} danger />}
      </div>
    </div>
  );

  // One swatch cell (button + label + clear), matching Settings → Appearance.
  const swatchCell = (key, label, tall = false) => (
    <div key={key} className="flex flex-col items-center gap-1">
      {tall && <span className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>}
      <button
        type="button"
        onClick={() => setColorPickerFor(key)}
        title={cf[key] ? `Edit ${label} (overriding the app default)` : `Edit ${label} (currently the app default — tap to override)`}
        className={`${tall ? "w-10 h-[3.75rem]" : "w-10 h-10"} rounded-xl border-2 transition-colors shadow-sm flex items-center justify-center ${cf[key] ? "border-primary/60" : "border-border/50 hover:border-primary/60"}`}
        // Always paint the LIVE colour: the explicit override if set, else the
        // current effective theme value via its CSS var (so the swatch shows
        // exactly what that colour looks like right now). A set border ring
        // marks colours that are explicitly overridden vs inheriting.
        style={{ backgroundColor: cf[key] || (LIVE_VAR[key] ? `var(${LIVE_VAR[key]})` : "transparent") }}
      >
        {!cf[key] && !LIVE_VAR[key] && <Palette className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {!tall && <span className="text-[0.625rem] text-muted-foreground">{label}</span>}
      {cf[key]
        ? <button type="button" onClick={() => clearFieldSynced(key)} className="text-[0.5625rem] text-muted-foreground hover:text-destructive leading-none">clear</button>
        : <span className="h-[0.5625rem]" />}
    </div>
  );

  // The Settings → Appearance "Custom Colours" grid: the 8 colours in a 4-wide
  // grid (four on top, four on bottom), with an optional Wave swatch standing
  // tall on the right behind a divider. Live: swatches reflect the colour the
  // moment it's set (cf updates), and the page preview updates via the live
  // <style> injected in the return.
  const paletteGrid = (palette, waveEntry = null) => (
    <div className="flex gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
      <div className="grid grid-cols-4 gap-x-2 gap-y-3 flex-1">
        {palette.map(({ key, label }) => swatchCell(key, label))}
      </div>
      {waveEntry && (
        <div className="flex flex-col items-center justify-center pl-3 border-l border-border/40">
          {swatchCell(waveEntry.key, waveEntry.label, true)}
        </div>
      )}
    </div>
  );

  const imageRow = (label, fieldKey, fileRef, busy, onUpload, resolvedPreview) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input value={cf[fieldKey] || ""} onChange={(e) => setField(fieldKey, e.target.value)} placeholder="https://…" className="flex-1" />
        <IconButton icon={Upload} title={`Upload ${label.toLowerCase()}`} onClick={() => fileRef.current?.click()} busy={busy} />
        <AssetButton onPick={(url) => setField(fieldKey, url)} className={iconBtnClass()} />
        <IconButton icon={X} title={`Remove ${label.toLowerCase()}`} onClick={() => clearField(fieldKey)} danger disabled={!cf[fieldKey]} />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
      </div>
      {resolvedPreview && (
        <img src={resolvedPreview} alt={`${label} preview`} className="w-full h-16 rounded-md object-cover border border-border/50" />
      )}
    </div>
  );

  const hideHeader = !!cf[HIDE_HEADER_KEY];
  const headerImageSet = !!cf[HEADER_IMAGE_KEY];
  const bgImageSet = !!cf[BG_IMAGE_KEY];

  const slider = (label, key, fallback, ariaLabel) => (
    <div className="flex items-center gap-3">
      <Label className="text-xs flex-shrink-0 w-28">{label}</Label>
      <input
        type="range" min={0.02} max={1} step={0.01}
        value={cf[key] ?? fallback}
        onChange={(e) => setField(key, parseFloat(e.target.value))}
        className="flex-1 h-1 accent-primary"
        aria-label={ariaLabel || label}
      />
      <span className="text-xs text-muted-foreground flex-shrink-0 w-9 text-right">{Math.round((cf[key] ?? fallback) * 100)}%</span>
    </div>
  );

  // One-tap copy of the palette colours + font + opacity between header and
  // body (uses the module-level SYNC_PAIRS). Reuses setField / clearField so it
  // writes straight into the profile's custom_fields.
  const syncStyles = (direction) => {
    // direction: "headerToBody" copies header values onto the body keys;
    // "bodyToHeader" copies body values onto the header keys.
    for (const [bodyKey, headerKey] of SYNC_PAIRS) {
      const [fromKey, toKey] = direction === "headerToBody"
        ? [headerKey, bodyKey]
        : [bodyKey, headerKey];
      const val = cf[fromKey];
      if (val === undefined || val === "" || val === null) clearField(toKey);
      else setField(toKey, val);
    }
    toast.success(direction === "headerToBody" ? "Copied header style to body" : "Copied body style to header");
  };

  return (
    // data-pf-surface: when this editor is rendered ON a profile that has a bg
    // image (inside .os-pf), the WHOLE profile-style card gets the colour
    // backing so it's readable. No-op inside modals (the rule is .os-pf-scoped).
    <div data-pf-surface className="space-y-0 rounded-xl">
      {/* Live preview: re-apply the profile theme + surface tint from the
          IN-PROGRESS edits so colour changes show on the page immediately,
          before saving. Scoped to .os-pf and injected after the page-level
          style so these win. No-op outside a profile context (returns ""). */}
      {profileThemeCss("os-pf", cf) && <style>{profileThemeCss("os-pf", cf)}</style>}
      {profileSurfaceCss("os-pf", cf) && <style>{profileSurfaceCss("os-pf", cf)}</style>}
      {/* HEADER */}
      <SubSection title="Header" defaultOpen={true}>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="ps-header-visible" className="flex items-center gap-1.5 cursor-pointer text-sm font-medium">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" /> Show header on profile
          </Label>
          <Switch
            id="ps-header-visible"
            checked={!hideHeader}
            onCheckedChange={(v) => (v ? clearField(HIDE_HEADER_KEY) : setField(HIDE_HEADER_KEY, true))}
          />
        </div>
        {/* Header colour palette — the full custom-colour set EXCEPT the wave
            (it doesn't render in the header). These colours apply only to the
            header banner, independent of the body. */}
        {paletteGrid(HEADER_PALETTE)}
        {imageRow("Image", HEADER_IMAGE_KEY, headerFileRef, uploadingHeader, (e) => { uploadImage(e.target.files?.[0], HEADER_IMAGE_KEY, setUploadingHeader, 1200, 0.85); e.target.value = ""; }, resolvedHeaderImg)}
        {headerImageSet && slider("Image opacity", HEADER_OPACITY_KEY, 0.45, "Header image opacity")}
        {cf[HEADER_BG_KEY] && slider("Background opacity", HEADER_BG_OPACITY_KEY, 1, "Header background colour opacity")}
        <div className="space-y-1.5">
          <Label className="text-xs">Font style</Label>
          <FontSelect value={cf[HEADER_FONT_KEY] || ""} onChange={(v) => setField(HEADER_FONT_KEY, v)} ariaLabel="Header font style" />
        </div>

        {/* Sync header ↔ body — lives at the bottom of the Header card.
            "Sync" copies the palette + font + opacity in the arrow's
            direction; tap the arrow to flip; tap the lock to live-link so any
            change to one side mirrors to the other as you edit. */}
        <div className="flex items-center gap-2 pt-3 mt-1 border-t border-border/40 flex-wrap">
          <button
            type="button"
            onClick={() => syncStyles(syncDir)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 text-xs font-medium transition-colors"
          >
            Sync
          </button>
          <span className="text-xs text-muted-foreground">Header</span>
          <button
            type="button"
            onClick={() => setSyncDir((d) => (d === "headerToBody" ? "bodyToHeader" : "headerToBody"))}
            aria-label={syncDir === "headerToBody" ? "Direction: header to body — tap to flip" : "Direction: body to header — tap to flip"}
            title="Tap to flip direction"
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-muted/20 hover:bg-muted/40 text-foreground transition-colors"
          >
            {syncDir === "headerToBody" ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
          </button>
          <span className="text-xs text-muted-foreground">Body</span>
          <button
            type="button"
            onClick={() => setSyncLocked((v) => !v)}
            aria-pressed={syncLocked}
            aria-label={syncLocked ? "Live link on — tap to unlink" : "Live link off — tap to link"}
            title={syncLocked ? "Live-linked: colour changes mirror both ways" : "Tap to live-link header & body colours"}
            className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors ${syncLocked ? "border-primary bg-primary/15 text-primary" : "border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground"}`}
          >
            {syncLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      </SubSection>

      {/* BODY — rendered inline within "Profile style" (NOT its own collapsible
          dropdown; only the Header collapses). */}
      <div className="space-y-3 pt-3 mt-1 border-t border-border/40">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
        {/* Body colour palette — the full custom-colour set INCLUDING the wave
            (tall swatch on the right). Same layout as Settings → Appearance. */}
        {paletteGrid(BODY_PALETTE, WAVE_ENTRY)}
        {bgImageSet && cf[BG_COLOR_KEY] && (
          <p className="text-[0.625rem] text-muted-foreground leading-snug -mt-1">
            With a background image set, this colour fills the cards and entry windows (bio, sections, inputs) — not the whole page. Use "Surface opacity" below to let the image show through them.
          </p>
        )}
        {imageRow("Image", BG_IMAGE_KEY, bgFileRef, uploadingBg, (e) => { uploadImage(e.target.files?.[0], BG_IMAGE_KEY, setUploadingBg, 1200, 0.8); e.target.value = ""; }, resolvedBgImg)}
        <div className="space-y-1.5">
          <Label className="text-xs">Font style</Label>
          <FontSelect value={cf[PAGE_FONT_KEY] || ""} onChange={(v) => setField(PAGE_FONT_KEY, v)} ariaLabel="Body font style" />
        </div>
        {bgImageSet ? (
          <>
            {slider("Image opacity", BG_OPACITY_KEY, 0.5, "Background image opacity")}
            {slider("Surface opacity", SECTION_BG_KEY, 0.9, "Surface (card/input) fill opacity")}
          </>
        ) : cf[BG_COLOR_KEY] ? (
          slider("Background opacity", BG_OPACITY_KEY, 0.15, "Background colour opacity")
        ) : null}
      </div>

      {colorPickerFor && (
        <ColorPickerModal
          color={cf[colorPickerFor] || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => setFieldSynced(colorPickerFor, hex)}
          onClose={() => setColorPickerFor(null)}
        />
      )}
    </div>
  );
}
