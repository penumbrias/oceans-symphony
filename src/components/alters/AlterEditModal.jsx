import React, { useState, useEffect, useRef } from "react";
import { PS } from "@/lib/profileStyle";
import { base44 } from "@/api/base44Client";
import { createAlter, refreshAlter, extractYear } from "@/lib/alterEntry";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Upload, Pin, X, Link2, Palette, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { saveLocalImage, createLocalImageUrl, isLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { registerAlterUpload } from "@/lib/assetFolders";
import BioEditor from "@/components/alters/BioEditor";
import { IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import { useProfileFonts, fontStackFor } from "@/lib/profileFonts";
import AlterPreferencesEditor from "@/components/alters/AlterPreferencesEditor";
import RotationModeControl from "@/components/shared/RotationModeControl";
import { PictureFramingRow } from "@/components/shared/PictureFramingRow";
import { withImageFraming, pictureStyle } from "@/lib/imageFraming";

// Profile-style custom_field keys — shared with the profile renderer
// (AlterProfile.jsx / ProfileTab.jsx). Storing these here lets the
// add/edit modal style the profile up-front instead of forcing a second
// trip into the in-profile editor.


// Small system-safe font picker reused for the header and the body.
function FontSelect({ value, onChange, ariaLabel }) {
  const fonts = useProfileFonts(); // built-ins + the user's uploaded fonts
  const builtIn = fonts.filter((f) => !f.isUpload);
  const uploads = fonts.filter((f) => f.isUpload);
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="w-full text-sm rounded-md border border-input bg-background px-2 py-2"
      style={{ fontFamily: fontStackFor(value) || undefined }}
    >
      {builtIn.map((f) => (
        <option key={f.id || "default"} value={f.id} style={{ fontFamily: f.stack || undefined }}>{f.label}</option>
      ))}
      {uploads.length > 0 && (
        <optgroup label="Your uploads">
          {uploads.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.stack || undefined }}>{f.label}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// THE "new alter" sheet (v0.279.11). Editing an existing alter happens on
// their profile (ProfileTab), which saves through alterEntry.saveAlterEdits;
// this sheet only creates, through alterEntry.createAlter.
export default function AlterEditModal({ open, onClose, initialGroupIds = [] }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const [form, setForm] = useState({
    name: "", alias: "", pronouns: "", role: "",
    description: "", color: "", avatar_url: "", avatar_rotation_mode: "off",
    birthday: "", origin_year: "", is_pinned: false, emoji: "", use_emoji_as_alias: false,
    custom_fields: {}, preferences: [], profile_song: null, image_framing: {},
  });
  // "Advanced" pronouns/preferences drawer (pronouns.cc-style comfort
  // levels). Auto-opens when the alter already has entries.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAvatarUrl, setShowAvatarUrl] = useState(false);
  // Which profile-style colour field has the picker open. We use the
  // fixed-position ColorPickerModal (not the inline ColorPicker dropdown)
  // for these because they live inside overflow-hidden SubSections, which
  // would clip an absolutely-positioned popover.
  const [colorPickerFor, setColorPickerFor] = useState(null);
  // Main alter colour swatch — also uses the portaled modal (the old inline
  // ColorPicker popover was clipped by the dialog and clicks fell through to
  // the page behind it).
  const [mainColorOpen, setMainColorOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const avatarFileRef = useRef(null);
  const headerFileRef = useRef(null);
  const bgFileRef = useRef(null);

  // Group/subsystem membership for the new alter. Prefilled from initialGroupIds — e.g. when
  // "create a new member" is launched from a subsystem.
  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  useEffect(() => {
    if (open) setSelectedGroupIds(new Set(initialGroupIds || []));
  }, [open, JSON.stringify(initialGroupIds)]);
  const addGroup = (id) => setSelectedGroupIds((s) => new Set(s).add(id));
  const removeGroup = (id) => setSelectedGroupIds((s) => { const n = new Set(s); n.delete(id); return n; });

  useEffect(() => {
    setForm({ name: "", alias: "", pronouns: "", role: "", description: "", color: "", avatar_url: "", avatar_rotation_mode: "off", birthday: "", origin_year: "", is_pinned: false, emoji: "", use_emoji_as_alias: false, custom_fields: {}, preferences: [], profile_song: null, image_framing: {} });
    setPrefsOpen(false);
    setShowAvatarUrl(false);
    // Reset only when the sheet opens — never on a background refresh.
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const cf = form.custom_fields || {};
  const setCF = (key, val) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));
  const clearCF = (key) => setForm((f) => { const c = { ...f.custom_fields }; delete c[key]; return { ...f, custom_fields: c }; });

  // First-appearance is one field that feeds both birthday (display) and
  // origin_year (timeline). Re-derive the year on every edit.
  const setFirstAppearance = (val) => setForm((f) => ({ ...f, birthday: val, origin_year: extractYear(val) }));

  // ── Image resolution for previews (header / background may be local-image://) ──
  const avatarPreview = useResolvedAvatarUrl(form.avatar_url);
  const headerImage = cf[PS.HEADER_IMAGE] || "";
  const bgImage = cf[PS.BG_IMAGE] || "";
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

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      if (isLocalMode()) {
        const { dataUrl, sizeKB } = await processUploadedImage(file, 512, 0.82);
        if (sizeKB > 500) toast.warning(`Compressed to ${sizeKB}KB — very large images may slow the app.`);
        const imageId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        set("avatar_url", createLocalImageUrl(imageId));
        registerAlterUpload({ url: createLocalImageUrl(imageId), role: "avatar", name: file.name.replace(/\.[^.]+$/, "") });
        toast.success(`Avatar saved locally! (${sizeKB}KB)`);
      } else {
        toast.error("Avatar upload requires cloud mode. Paste an image URL instead.");
      }
    } catch (err) {
      console.error("Avatar upload error:", err);
      toast.error("Failed to process avatar");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  // Profile song upload — raw audio file straight into the local blob
  // store (it's MIME-generic and its backup export walks every blob, so
  // songs travel in backups exactly like avatars). No image processing.
  const handleHeaderUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingHeader(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 1200, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `header-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setCF(PS.HEADER_IMAGE, createLocalImageUrl(imageId));
        registerAlterUpload({ url: createLocalImageUrl(imageId), role: "header" });
      } else {
        setCF(PS.HEADER_IMAGE, dataUrl);
      }
      toast.success(isGif ? "Header GIF saved!" : "Header image saved!");
    } catch { toast.error("Failed to process header image"); }
    finally { setUploadingHeader(false); e.target.value = ""; }
  };

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingBg(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 1200, 0.8);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setCF(PS.BG_IMAGE, createLocalImageUrl(imageId));
        registerAlterUpload({ url: createLocalImageUrl(imageId), role: "background" });
      } else {
        setCF(PS.BG_IMAGE, dataUrl);
      }
      toast.success(isGif ? "Background GIF saved!" : "Background image saved!");
    } catch { toast.error("Failed to process background image"); }
    finally { setUploadingBg(false); e.target.value = ""; }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await createAlter(form, { groupIds: [...selectedGroupIds] });
      if (selectedGroupIds.size) queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`✅ ${t.Alter} created!`);
      refreshAlter(queryClient);
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const hideHeader = !!cf[PS.HIDE_HEADER];

  // A colour field that opens the fixed-position picker modal (clip-safe
  // inside the overflow-hidden Profile-style subsections).
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
        {cf[fieldKey] && <IconButton icon={X} title={`Clear ${label.toLowerCase()}`} onClick={() => clearCF(fieldKey)} danger />}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0">

        {/* Fixed header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50">
          <DialogHeader>
            <DialogTitle>{`Add New ${t.Alter}`}</DialogTitle>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {form.color && (
            <div className="h-2 rounded-full w-full" style={{ backgroundColor: form.color }} />
          )}

          {/* Name + Alias on the left, Avatar on the right */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Display name" />
              </div>
              <div className="space-y-1.5">
                <Label>Alias</Label>
                <div className="flex gap-2">
                  <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="For mentions" className="flex-1 min-w-0" />
                  <Input
                    value={form.emoji}
                    onChange={(e) => set("emoji", e.target.value)}
                    placeholder="😀"
                    maxLength={8}
                    aria-label="Emoji"
                    className="w-14 flex-shrink-0 text-center text-lg"
                  />
                </div>
                <label className={`flex items-center gap-2 text-xs ${form.emoji ? "text-muted-foreground cursor-pointer" : "text-muted-foreground/40"}`}>
                  <Switch checked={!!form.use_emoji_as_alias} onCheckedChange={(v) => set("use_emoji_as_alias", !!v)} disabled={!form.emoji} className="scale-90" />
                  <span>Use emoji as an alias for mentions{form.emoji ? <> — type <span className="font-medium">@{form.emoji}</span></> : ""}</span>
                </label>
              </div>
            </div>
            <div className="flex-shrink-0 w-[76px] flex flex-col items-center gap-1.5">
              <Label className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">Avatar</Label>
              <div className="w-[68px] h-[68px] rounded-full border-2 border-border/60 overflow-hidden flex items-center justify-center bg-muted/40">
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" style={pictureStyle(form, form.avatar_url)} />
                  : <User className="w-7 h-7 text-muted-foreground" />}
              </div>
              {/* Wrap to stay within the avatar's width (2 per row). */}
              <div className="flex flex-wrap justify-center gap-0.5 w-[68px]">
                <IconButton icon={Upload} title="Upload image" onClick={() => avatarFileRef.current?.click()} busy={uploadingAvatar} />
                <AssetButton onPick={(url) => set("avatar_url", url)} className={iconBtnClass()} allowFolders ownerAlterId={null} ownerAlterName="" />
                <IconButton icon={Link2} title="Image URL" onClick={() => setShowAvatarUrl((s) => !s)} />
                <IconButton icon={X} title="Remove avatar" onClick={() => set("avatar_url", "")} danger disabled={!form.avatar_url} />
              </div>
              <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </div>
          </div>
          {showAvatarUrl && (
            <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://… or paste an image URL" />
          )}
          {form.avatar_url && (isLocalImageUrl(form.avatar_url) || form.avatar_url.startsWith("data:")) && (
            <LocalImageFixer value={form.avatar_url} maxWidth={400} quality={0.85} onFixed={(url) => set("avatar_url", url)} />
          )}
          <PictureFramingRow url={form.avatar_url} value={form.image_framing?.[form.avatar_url]} shape="circle" label="Framing"
            onChange={(f) => set("image_framing", withImageFraming(form.image_framing, form.avatar_url, f))} />

          <RotationModeControl
            mode={form.avatar_rotation_mode}
            onChange={(m) => set("avatar_rotation_mode", m)}
            disabled
            showManage={false}
            hint={`Save this ${t.alter} first to set up multiple avatar images to rotate through.`}
          />

          {/* Pronouns + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pronouns</Label>
              <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
              <button
                type="button"
                onClick={() => setPrefsOpen((v) => !v)}
                className="text-[0.6875rem] text-muted-foreground hover:text-primary transition-colors"
              >
                {prefsOpen ? "▾" : "▸"} Advanced — preferences &amp; boundaries
                {form.preferences.length > 0 ? ` (${form.preferences.length})` : ""}
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMainColorOpen(true)}
                  className="w-9 h-9 rounded-lg border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: form.color || "#8b5cf6" }}
                  title="Pick colour"
                  aria-label="Pick colour"
                />
                <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{form.color || "#8b5cf6"}</span>
              </div>
            </div>
          </div>

          {/* Advanced preferences & boundaries — pronouns.cc-style comfort
              levels for pronouns, names, terms. Stored on the alter and
              shareable with friends (opt-in, Friends page settings). */}
          {prefsOpen && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Rate how each pronoun set, name, or term feels — from hate to love. Shows on the profile, and can optionally be shared with friends so they know what to use (and what to avoid).
              </p>
              <AlterPreferencesEditor value={form.preferences} onChange={(next) => set("preferences", next)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host…" />
          </div>

          {/* First appearance — one field, feeds the lineage/timeline. */}
          <div className="space-y-1.5">
            <Label>First appearance</Label>
            <Input
              value={form.birthday}
              onChange={(e) => setFirstAppearance(e.target.value)}
              placeholder={`e.g. ${new Date().getFullYear() - 5}, March ${new Date().getFullYear() - 5}, or a full date`}
            />
            <p className="text-[0.6875rem] text-muted-foreground leading-snug">When this {t.alter} first appeared — just a year, or a specific month/day. Feeds the {t.Alter} History timeline.</p>
          </div>

          {/* New alters have no groups field — groups & subsystems are
              assigned from the profile after the alter is saved. (When a new
              alter is created from within a subsystem, it's still added to
              that group silently via initialGroupIds.) */}


          {/* Description / Bio */}
          <div className="space-y-1.5">
            <Label>Description / Bio</Label>
            <BioEditor value={form.description} onChange={(val) => set("description", val)} />
          </div>

          {/* No look here: the page's colours, pictures, fonts and song are
              set on the profile page itself (Display options → the profile,
              v0.310.0), not while creating an {alter}. */}

          {/* Pin shortcut — surfaces this {alter} in a quick-access gallery at
              the top of the {alters} page (and the Set Front modal). */}
          <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5">
            <Label htmlFor="alter-pin-toggle" className="flex items-center gap-1.5 cursor-pointer">
              <Pin className={`w-3.5 h-3.5 ${form.is_pinned ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              Pin to top of {t.alters} page
            </Label>
            <Switch
              id="alter-pin-toggle"
              checked={!!form.is_pinned}
              onCheckedChange={(v) => set("is_pinned", v)}
            />
          </div>
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-border/50 flex flex-col gap-2">
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {`Add New ${t.Alter}`}
          </Button>
        </div>
      </DialogContent>


      {colorPickerFor && (
        <ColorPickerModal
          color={cf[colorPickerFor] || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => setCF(colorPickerFor, hex)}
          onClose={() => setColorPickerFor(null)}
        />
      )}

      {mainColorOpen && (
        <ColorPickerModal
          color={form.color || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => set("color", hex)}
          onClose={() => setMainColorOpen(false)}
        />
      )}

    </Dialog>
  );
}
