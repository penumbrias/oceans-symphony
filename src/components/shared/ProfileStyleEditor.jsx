import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Upload, X, Palette, Eye } from "lucide-react";
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
const HIDE_HEADER_KEY = "_hide_header";
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";

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

  return (
    <>
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
        {/* Background + text colour side by side to save vertical space. */}
        <div className="grid grid-cols-2 gap-3">
          {colorRow("Background", HEADER_BG_KEY)}
          {colorRow("Text", HEADER_TEXT_KEY)}
        </div>
        {imageRow("Image", HEADER_IMAGE_KEY, headerFileRef, uploadingHeader, (e) => { uploadImage(e.target.files?.[0], HEADER_IMAGE_KEY, setUploadingHeader, 1200, 0.85); e.target.value = ""; }, resolvedHeaderImg)}
        {headerImageSet && slider("Header opacity", HEADER_OPACITY_KEY, 0.45, "Header image opacity")}
        <div className="space-y-1.5">
          <Label className="text-xs">Font style</Label>
          <FontSelect value={cf[HEADER_FONT_KEY] || ""} onChange={(v) => setField(HEADER_FONT_KEY, v)} ariaLabel="Header font style" />
        </div>
      </SubSection>

      {/* BODY — rendered inline within "Profile style" (NOT its own collapsible
          dropdown; only the Header collapses). */}
      <div className="space-y-3 pt-3 mt-1 border-t border-border/40">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
        <div className="grid grid-cols-2 gap-3">
          {colorRow("Background", BG_COLOR_KEY)}
          {colorRow("Text", PAGE_TEXT_KEY)}
        </div>
        {bgImageSet && cf[BG_COLOR_KEY] && (
          <p className="text-[0.625rem] text-muted-foreground leading-snug -mt-1">
            With a background image set, this colour fills the cards (bio, sections, dropdowns) and tints the page for readability.
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
            {slider("Readability", SECTION_BG_KEY, 0.1, "Readability overlay opacity")}
          </>
        ) : cf[BG_COLOR_KEY] ? (
          slider("Background opacity", BG_OPACITY_KEY, 0.15, "Background colour opacity")
        ) : null}
      </div>

      {colorPickerFor && (
        <ColorPickerModal
          color={cf[colorPickerFor] || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => setField(colorPickerFor, hex)}
          onClose={() => setColorPickerFor(null)}
        />
      )}
    </>
  );
}
