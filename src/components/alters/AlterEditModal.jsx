import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Trash2, Archive, ArchiveRestore, Users, Upload, Pin, Crown, Folder, X, Link2, Palette, Eye, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import GroupTreeSelect from "@/components/groups/GroupTreeSelect";
import { useTerms } from "@/lib/useTerms";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { saveLocalImage, createLocalImageUrl, isLocalImageUrl, getLocalImageId, deleteLocalImage, processUploadedImage } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import BioEditor from "@/components/alters/BioEditor";
import { SubSection, IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import { PROFILE_FONTS, fontStackFor } from "@/lib/profileFonts";

// Profile-style custom_field keys — shared with the profile renderer
// (AlterProfile.jsx / ProfileTab.jsx). Storing these here lets the
// add/edit modal style the profile up-front instead of forcing a second
// trip into the in-profile editor.
const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const HEADER_BG_KEY = "_header_bg_color";
const HEADER_IMAGE_KEY = "_header_image";
const HEADER_TEXT_KEY = "_header_text_color";
const HEADER_FONT_KEY = "_header_font";
const HIDE_HEADER_KEY = "_hide_header";
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";

// Pull a 4-digit year out of a free-form "first appeared" string so we keep
// the integer origin_year (used by Alter History / lineage / timeline) in
// sync with whatever the user typed — even if it's "March 2018" or just "2018".
function extractYear(str) {
  if (!str) return "";
  const m = String(str).match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? m[1] : "";
}

// Small system-safe font picker reused for the header and the body.
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

export default function AlterEditModal({ alter, open, onClose, mode = "edit", initialGroupIds = [] }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const isNew = mode === "create";
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const [form, setForm] = useState({
    name: "", alias: "", pronouns: "", role: "",
    description: "", color: "", avatar_url: "",
    birthday: "", origin_year: "", is_pinned: false, emoji: "",
    custom_fields: {},
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
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

  // Create-mode group/subsystem membership (edit mode uses GroupPickerModal
  // on the existing alter). Prefilled from initialGroupIds — e.g. when
  // "create a new member" is launched from a subsystem.
  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  useEffect(() => {
    if (open && isNew) setSelectedGroupIds(new Set(initialGroupIds || []));
  }, [open, isNew, JSON.stringify(initialGroupIds)]);
  const addGroup = (id) => setSelectedGroupIds((s) => new Set(s).add(id));
  const removeGroup = (id) => setSelectedGroupIds((s) => { const n = new Set(s); n.delete(id); return n; });

  useEffect(() => {
    if (alter && !isNew) {
      // Single "first appeared" field now backs both the free-form
      // birthday text and the integer origin_year. Seed the text from
      // whichever the alter already had, and keep origin_year if the
      // text itself has no parseable year (e.g. legacy "Age 7").
      const birthday = alter.birthday || (alter.origin_year ? String(alter.origin_year) : "");
      const origin_year = extractYear(birthday) || (alter.origin_year ? String(alter.origin_year) : "");
      setForm({
        name: alter.name || "", alias: alter.alias || "",
        pronouns: alter.pronouns || "", role: alter.role || "",
        description: alter.description || "", color: alter.color || "",
        avatar_url: alter.avatar_url || "",
        birthday, origin_year, is_pinned: !!alter.is_pinned, emoji: alter.emoji || "",
        custom_fields: alter.custom_fields || {},
      });
    } else {
      setForm({ name: "", alias: "", pronouns: "", role: "", description: "", color: "", avatar_url: "", birthday: "", origin_year: "", is_pinned: false, emoji: "", custom_fields: {} });
    }
    setShowAvatarUrl(false);
  }, [alter, open, isNew]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const cf = form.custom_fields || {};
  const setCF = (key, val) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));
  const clearCF = (key) => setForm((f) => { const c = { ...f.custom_fields }; delete c[key]; return { ...f, custom_fields: c }; });

  // First-appearance is one field that feeds both birthday (display) and
  // origin_year (timeline). Re-derive the year on every edit.
  const setFirstAppearance = (val) => setForm((f) => ({ ...f, birthday: val, origin_year: extractYear(val) }));

  // ── Image resolution for previews (header / background may be local-image://) ──
  const avatarPreview = useResolvedAvatarUrl(form.avatar_url);
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

  const handleHeaderUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingHeader(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 1200, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`);
      if (isLocalMode()) {
        const imageId = `header-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setCF(HEADER_IMAGE_KEY, createLocalImageUrl(imageId));
      } else {
        setCF(HEADER_IMAGE_KEY, dataUrl);
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
        setCF(BG_IMAGE_KEY, createLocalImageUrl(imageId));
      } else {
        setCF(BG_IMAGE_KEY, dataUrl);
      }
      toast.success(isGif ? "Background GIF saved!" : "Background image saved!");
    } catch { toast.error("Failed to process background image"); }
    finally { setUploadingBg(false); e.target.value = ""; }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const formData = { ...form, origin_year: form.origin_year ? parseInt(form.origin_year, 10) : null };
    try {
      if (isNew) {
        const created = await base44.entities.Alter.create({ ...formData, is_archived: false });
        if (selectedGroupIds.size > 0 && created?.id) {
          const memberKey = created.sp_id || created.id;
          const newGroups = [];
          for (const g of allGroups) {
            if (!selectedGroupIds.has(g.id)) continue;
            const members = new Set(g.member_sp_ids || []);
            members.add(memberKey);
            try { await base44.entities.Group.update(g.id, { member_sp_ids: [...members] }); } catch { /* keep going */ }
            newGroups.push({ id: g.sp_id || g.id, name: g.name, color: g.color || "" });
          }
          if (newGroups.length) {
            try { await base44.entities.Alter.update(created.id, { groups: newGroups }); } catch { /* non-fatal */ }
          }
          queryClient.invalidateQueries({ queryKey: ["groups"] });
        }
        toast.success(`✅ ${t.Alter} created!`);
      } else {
        await base44.entities.Alter.update(alter.id, formData);
        toast.success("✅ Saved!");
      }
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["alter", alter?.id] });
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setSaving(true);
    try {
      await base44.entities.Alter.update(alter.id, { is_archived: !alter.is_archived });
      toast.success(alter.is_archived ? "✅ Unarchived!" : "🗃 Archived!");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${alter?.name}? This cannot be undone. All data linked to this ${t.alter} will be removed.`)) return;
    setDeleting(true);
    try {
      if (alter.avatar_url && isLocalImageUrl(alter.avatar_url)) {
        const imageId = getLocalImageId(alter.avatar_url);
        if (imageId) await deleteLocalImage(imageId);
      }
      await base44.entities.Alter.delete(alter.id);
      toast.success(`🗑 ${t.Alter} deleted.`);
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const hideHeader = !!cf[HIDE_HEADER_KEY];

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
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0">

        {/* Fixed header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50">
          <DialogHeader>
            <DialogTitle>{isNew ? `Add New ${t.Alter}` : `Edit ${alter?.name || t.Alter}`}</DialogTitle>
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
                <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="For mentions" />
              </div>
            </div>
            <div className="flex-shrink-0 w-[76px] flex flex-col items-center gap-1.5">
              <Label className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">Avatar</Label>
              <div className="w-[68px] h-[68px] rounded-full border-2 border-border/60 overflow-hidden flex items-center justify-center bg-muted/40">
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : <User className="w-7 h-7 text-muted-foreground" />}
              </div>
              {/* Wrap to stay within the avatar's width (2 per row). */}
              <div className="flex flex-wrap justify-center gap-0.5 w-[68px]">
                <IconButton icon={Upload} title="Upload image" onClick={() => avatarFileRef.current?.click()} busy={uploadingAvatar} />
                <AssetButton onPick={(url) => set("avatar_url", url)} className={iconBtnClass()} />
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

          {/* Pronouns + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pronouns</Label>
              <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
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

          {/* Groups / Subsystems (create mode adds memberships up-front).
              Nested, parent-respecting picker — tap to toggle; selected rows
              highlight in the group's colour. */}
          {isNew && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Groups &amp; {subTerm}s</Label>
              <GroupTreeSelect
                groups={allGroups}
                selectedIds={selectedGroupIds}
                onToggle={(id) => (selectedGroupIds.has(id) ? removeGroup(id) : addGroup(id))}
                subTerm={subTerm}
              />
            </div>
          )}

          {!isNew && alter && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Groups
                </Label>
                <button type="button" onClick={() => setShowGroupPicker(true)}
                  className="text-xs text-primary hover:text-primary/80 font-medium">
                  Edit groups →
                </button>
              </div>
              {alter.groups && alter.groups.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {alter.groups.map((g) => (
                    <span key={g.id} className="px-2 py-0.5 rounded-full text-xs font-medium border"
                      style={{ backgroundColor: g.color ? `${g.color}18` : "hsl(var(--muted))", borderColor: g.color ? `${g.color}40` : "hsl(var(--border))", color: g.color || "hsl(var(--foreground))" }}>
                      {g.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Not in any groups</p>
              )}
            </div>
          )}

          {/* Description / Bio */}
          <div className="space-y-1.5">
            <Label>Description / Bio</Label>
            <BioEditor value={form.description} onChange={(val) => set("description", val)} />
          </div>

          {/* Profile style — collapsed by default. Inside, the Header
              subsection is on + expanded; the Body subsection is collapsed. */}
          <SubSection title="Profile style" icon={Palette} defaultOpen={false}>
            {/* HEADER */}
            <SubSection title="Header" defaultOpen={true}>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="alter-header-visible" className="flex items-center gap-1.5 cursor-pointer text-sm font-medium">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" /> Show header on profile
                </Label>
                <Switch
                  id="alter-header-visible"
                  checked={!hideHeader}
                  onCheckedChange={(v) => (v ? clearCF(HIDE_HEADER_KEY) : setCF(HIDE_HEADER_KEY, true))}
                />
              </div>

              {colorRow("Background colour", HEADER_BG_KEY)}

              <div className="space-y-1.5">
                <Label className="text-xs">Image</Label>
                <div className="flex items-center gap-1.5">
                  <Input value={cf[HEADER_IMAGE_KEY] || ""} onChange={(e) => setCF(HEADER_IMAGE_KEY, e.target.value)} placeholder="https://…" className="flex-1" />
                  <IconButton icon={Upload} title="Upload header image" onClick={() => headerFileRef.current?.click()} busy={uploadingHeader} />
                  <AssetButton onPick={(url) => setCF(HEADER_IMAGE_KEY, url)} className={iconBtnClass()} />
                  <IconButton icon={X} title="Remove header image" onClick={() => clearCF(HEADER_IMAGE_KEY)} danger disabled={!cf[HEADER_IMAGE_KEY]} />
                  <input ref={headerFileRef} type="file" accept="image/*" hidden onChange={handleHeaderUpload} />
                </div>
                {resolvedHeaderImg && (
                  <img src={resolvedHeaderImg} alt="header preview" className="w-full h-16 rounded-md object-cover border border-border/50" />
                )}
              </div>

              {colorRow("Text colour", HEADER_TEXT_KEY)}

              <div className="space-y-1.5">
                <Label className="text-xs">Font style</Label>
                <FontSelect value={cf[HEADER_FONT_KEY] || ""} onChange={(v) => setCF(HEADER_FONT_KEY, v)} ariaLabel="Header font style" />
              </div>
            </SubSection>

            {/* BODY */}
            <SubSection title="Body" defaultOpen={false}>
              {colorRow("Background colour", BG_COLOR_KEY)}

              <div className="space-y-1.5">
                <Label className="text-xs">Image</Label>
                <div className="flex items-center gap-1.5">
                  <Input value={cf[BG_IMAGE_KEY] || ""} onChange={(e) => setCF(BG_IMAGE_KEY, e.target.value)} placeholder="https://…" className="flex-1" />
                  <IconButton icon={Upload} title="Upload background image" onClick={() => bgFileRef.current?.click()} busy={uploadingBg} />
                  <AssetButton onPick={(url) => setCF(BG_IMAGE_KEY, url)} className={iconBtnClass()} />
                  <IconButton icon={X} title="Remove background image" onClick={() => clearCF(BG_IMAGE_KEY)} danger disabled={!cf[BG_IMAGE_KEY]} />
                  <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={handleBgUpload} />
                </div>
                {resolvedBgImg && (
                  <img src={resolvedBgImg} alt="background preview" className="w-full h-16 rounded-md object-cover border border-border/50" />
                )}
              </div>

              {colorRow("Text colour", PAGE_TEXT_KEY)}

              <div className="space-y-1.5">
                <Label className="text-xs">Font style</Label>
                <FontSelect value={cf[PAGE_FONT_KEY] || ""} onChange={(v) => setCF(PAGE_FONT_KEY, v)} ariaLabel="Body font style" />
              </div>
            </SubSection>
          </SubSection>

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
            {isNew ? `Add New ${t.Alter}` : "Save Changes"}
          </Button>
          {!isNew && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleArchive} disabled={saving} className="flex-1">
                {alter?.is_archived
                  ? <><ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive</>
                  : <><Archive className="w-4 h-4 mr-2" /> Archive</>}
              </Button>
              <Button variant="outline" onClick={handleDelete} disabled={deleting}
                className="flex-1 text-destructive hover:bg-destructive/10 border-destructive/40 hover:border-destructive/60">
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete
              </Button>
            </div>
          )}
        </div>
      </DialogContent>

      {!isNew && alter && (
        <GroupPickerModal alter={alter} open={showGroupPicker} onClose={() => setShowGroupPicker(false)} />
      )}

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
