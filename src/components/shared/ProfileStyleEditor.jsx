import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Upload, X, Palette, Eye, ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { SubSection, IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import { PROFILE_FONTS, fontStackFor } from "@/lib/profileFonts";
import { isLocalMode } from "@/lib/storageMode";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";

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
  { key: THEME_WAVE_KEY, label: "Wave" },
];
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

  // The Settings → Appearance "Custom Colours" swatch grid, reused for the
  // header and body colour palettes. Tap a swatch to pick; "clear" reverts that
  // colour to the app theme.
  const paletteGrid = (palette) => (
    <div className="flex flex-wrap gap-3 p-3 bg-muted/20 rounded-xl border border-border/40">
      {palette.map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setColorPickerFor(key)}
            title={`Edit ${label}`}
            className="w-10 h-10 rounded-xl border-2 border-border/50 hover:border-primary/60 transition-colors shadow-sm flex items-center justify-center"
            style={{ backgroundColor: cf[key] || "transparent" }}
          >
            {!cf[key] && <Palette className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <span className="text-[0.625rem] text-muted-foreground">{label}</span>
          {cf[key]
            ? <button type="button" onClick={() => clearField(key)} className="text-[0.5625rem] text-muted-foreground hover:text-destructive leading-none">clear</button>
            : <span className="h-[0.5625rem]" />}
        </div>
      ))}
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

  // Sync header ↔ body STYLE values (background colour, text colour, font,
  // background opacity) — but deliberately NOT the images, which are usually
  // meant to differ between the banner and the page. Pairs are [bodyKey,
  // headerKey]. A set value on the "from" side is copied; an unset value on
  // the "from" side clears the corresponding "to" key so the two truly match.
  // Reuses the same setField / clearField the rest of the editor writes
  // through, so it goes straight into the profile's custom_fields.
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
      </SubSection>

      {/* BODY — rendered inline within "Profile style" (NOT its own collapsible
          dropdown; only the Header collapses). */}
      <div className="space-y-3 pt-3 mt-1 border-t border-border/40">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
        {/* Body colour palette — the full custom-colour set INCLUDING the wave.
            Same colours as Settings → Appearance, applied to the whole page. */}
        {paletteGrid(BODY_PALETTE)}
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

      {/* SYNC HEADER ↔ BODY — copy style values (background colour, text
          colour, font, background opacity) between the header and body in
          either direction. Images are intentionally left out — they're
          usually meant to differ between the banner and the page. */}
      <div className="space-y-2 pt-3 mt-1 border-t border-border/40">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Sync header ↔ body</p>
        <p className="text-[0.625rem] text-muted-foreground leading-snug -mt-1">
          Copy the background colour, text colour, font, and opacity from one to the other. Images are not copied.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => syncStyles("headerToBody")}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 text-xs font-medium transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> Header → Body
          </button>
          <button
            type="button"
            onClick={() => syncStyles("bodyToHeader")}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 text-xs font-medium transition-colors"
          >
            <ArrowUpToLine className="w-3.5 h-3.5" /> Body → Header
          </button>
        </div>
      </div>

      {colorPickerFor && (
        <ColorPickerModal
          color={cf[colorPickerFor] || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => setField(colorPickerFor, hex)}
          onClose={() => setColorPickerFor(null)}
        />
      )}
    </div>
  );
}
