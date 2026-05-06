import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { User, Tag, Users, Save, Archive, ArchiveRestore, Trash2, Loader2, Upload, X, Image, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import BioEditor from "@/components/alters/BioEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import LocalImageFixer from "@/components/shared/LocalImageFixer";

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const BG_OPACITY_KEY = "_bg_opacity";
const HEADER_TEXT_KEY = "_header_text_color";
const HIDE_HEADER_KEY = "_hide_header";
const HEADER_IMAGE_KEY = "_header_image";
const SECTION_BG_KEY = "_section_bg_opacity";
const PAGE_TEXT_KEY = "_page_text_color";

function AvatarModal({ src, onSave, onClose }) {
  const [url, setUrl] = useState(src || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const resolvedPreview = useResolvedAvatarUrl(url);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const compressImage = (file, maxWidth = 400, quality = 0.85) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const u = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(u);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = u;
      });
      const dataUrl = await compressImage(file);
      if (isLocalMode()) {
        const imageId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setUrl(createLocalImageUrl(imageId));
      } else {
        setUrl(dataUrl);
      }
      toast.success("Image ready!");
    } catch { toast.error("Failed to process image"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-2xl p-5 space-y-4 max-w-sm mx-4 w-full shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Avatar</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {url && (
          <div className="flex justify-center">
            <img src={resolvedPreview || url} alt="preview" className="w-24 h-24 rounded-2xl object-cover border-2 border-border" onError={e => e.target.style.display = "none"} />
          </div>
        )}
        <div className="flex gap-2">
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste image URL..." className="flex-1 text-sm" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onSave(url); onClose(); }}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export default function ProfileTab({ alter, editMode, onEditModeChange, systemFields = [], saveRef }) {
  const queryClient = useQueryClient();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showHeaderTextPicker, setShowHeaderTextPicker] = useState(false);
  const [showPageTextPicker, setShowPageTextPicker] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [form, setForm] = useState({
    name: "", alias: "", pronouns: "", role: "", birthday: "",
    description: "", color: "", avatar_url: "",
    custom_fields: {},
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const bgFileInputRef = useRef(null);
  const headerFileInputRef = useRef(null);

  useEffect(() => {
    setForm({
      name: alter.name || "",
      alias: alter.alias || "",
      pronouns: alter.pronouns || "",
      role: alter.role || "",
      birthday: alter.birthday || "",
      description: alter.description || "",
      color: alter.color || "",
      avatar_url: alter.avatar_url || "",
      custom_fields: alter.custom_fields || {},
    });
  }, [alter]);

  const bgColor = form.custom_fields?.[BG_COLOR_KEY] || "";
  const bgImage = form.custom_fields?.[BG_IMAGE_KEY] || "";
  const bgOpacity = form.custom_fields?.[BG_OPACITY_KEY] !== undefined ? form.custom_fields[BG_OPACITY_KEY] : 0.15;
  const headerTextColor = form.custom_fields?.[HEADER_TEXT_KEY] || "";
  const hideHeader = form.custom_fields?.[HIDE_HEADER_KEY] || false;
  const headerImage = form.custom_fields?.[HEADER_IMAGE_KEY] || "";
  const sectionBgOpacity = form.custom_fields?.[SECTION_BG_KEY] !== undefined ? form.custom_fields[SECTION_BG_KEY] : 0;
  const pageTextColor = form.custom_fields?.[PAGE_TEXT_KEY] || "";

  const setBgField = (key, val) => setForm(f => ({
    ...f, custom_fields: { ...f.custom_fields, [key]: val },
  }));

  const clearBg = () => setForm(f => {
    const cf = { ...f.custom_fields };
    delete cf[BG_COLOR_KEY]; delete cf[BG_IMAGE_KEY]; delete cf[BG_OPACITY_KEY];
    delete cf[HEADER_TEXT_KEY]; delete cf[HEADER_IMAGE_KEY]; delete cf[SECTION_BG_KEY]; delete cf[PAGE_TEXT_KEY];
    return { ...f, custom_fields: cf };
  });

  const handleSave = useCallback(async () => {
  if (!form.name.trim()) { toast.error("Name is required"); return; }
  setSaving(true);
  try {
    await base44.entities.Alter.update(alter.id, form);
    toast.success("Saved!");
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    onEditModeChange(false);
  } catch (e) { toast.error(e.message || "Failed to save"); }
  finally { setSaving(false); }
}, [form, alter.id]);
useEffect(() => {
  if (saveRef) saveRef.current = handleSave;
}, [handleSave]);

  const handleArchive = async () => {
    setSaving(true);
    try {
      await base44.entities.Alter.update(alter.id, { is_archived: !alter.is_archived });
      toast.success(alter.is_archived ? "Unarchived!" : "Archived!");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete ${alter?.name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await base44.entities.Alter.delete(alter.id);
      toast.success("Alter deleted.");
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    } catch (e) { toast.error(e.message || "Failed to delete"); }
    finally { setDeleting(false); }
  };

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingBg(true);
    try {
      const sizeMB = file.size / (1024 * 1024);
      const compressImage = (file, maxWidth = 1200, quality = 0.8) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = url;
      });
      if (sizeMB > 1) toast.info(`Compressing background image (${sizeMB.toFixed(1)}MB)…`);
      const dataUrl = await compressImage(file);
      if (isLocalMode()) {
        const imageId = `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setBgField(BG_IMAGE_KEY, createLocalImageUrl(imageId));
      } else {
        setBgField(BG_IMAGE_KEY, dataUrl);
      }
      toast.success("Background image saved!");
    } catch (err) {
      toast.error("Failed to process background image");
    } finally { setUploadingBg(false); e.target.value = ""; }
  };

  const handleHeaderUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingHeader(true);
    try {
      const compressImage = (file, maxWidth = 1200, quality = 0.85) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = url;
      });
      const dataUrl = await compressImage(file);
      if (isLocalMode()) {
        const imageId = `header-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setBgField(HEADER_IMAGE_KEY, createLocalImageUrl(imageId));
      } else {
        setBgField(HEADER_IMAGE_KEY, dataUrl);
      }
      toast.success("Header image saved!");
    } catch { toast.error("Failed to process header image"); }
    finally { setUploadingHeader(false); e.target.value = ""; }
  };


  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const hasColor = form.color && form.color.length > 3;
  const bgColorAlter = hasColor ? form.color : null;
  const textOnColor = hasColor ? getContrastColor(form.color) : null;

  const viewBgColor = alter.custom_fields?.[BG_COLOR_KEY] || "";
  const viewBgImage = alter.custom_fields?.[BG_IMAGE_KEY] || "";
  const viewBgOpacity = alter.custom_fields?.[BG_OPACITY_KEY] !== undefined ? alter.custom_fields[BG_OPACITY_KEY] : 0.15;
  const viewHeaderText = alter.custom_fields?.[HEADER_TEXT_KEY] || null;
  const viewHideHeader = alter.custom_fields?.[HIDE_HEADER_KEY] || false;
  const viewHeaderImage = alter.custom_fields?.[HEADER_IMAGE_KEY] || "";
  const hasBg = viewBgColor || viewBgImage;
  const alterTextContrast = alter.color ? getContrastColor(alter.color) : null;

  // Resolve background image URLs (may be local-image:// in local mode)
  const [resolvedViewBgImage, setResolvedViewBgImage] = useState(viewBgImage);
  const [resolvedEditBgImage, setResolvedEditBgImage] = useState(bgImage);
  const [resolvedViewHeaderImage, setResolvedViewHeaderImage] = useState("");

  useEffect(() => {
    if (!viewBgImage) { setResolvedViewBgImage(""); return; }
    resolveImageUrl(viewBgImage).then(r => setResolvedViewBgImage(r || "")).catch(() => setResolvedViewBgImage(""));
  }, [viewBgImage]);

  useEffect(() => {
    if (!bgImage) { setResolvedEditBgImage(""); return; }
    resolveImageUrl(bgImage).then(r => setResolvedEditBgImage(r || "")).catch(() => setResolvedEditBgImage(""));
  }, [bgImage]);

  useEffect(() => {
    if (!viewHeaderImage) { setResolvedViewHeaderImage(""); return; }
    resolveImageUrl(viewHeaderImage).then(r => setResolvedViewHeaderImage(r || "")).catch(() => setResolvedViewHeaderImage(""));
  }, [viewHeaderImage]);

  // ── VIEW MODE ──
  const viewSectionBgOpacity = parseFloat(alter.custom_fields?.[SECTION_BG_KEY] ?? 0);
  const hasSectionBg = viewSectionBgOpacity > 0 && (viewBgColor || viewBgImage || viewHeaderImage);
  const sectionCardStyle = hasSectionBg
    ? { backgroundColor: `rgba(var(--color-surface-rgb), ${viewSectionBgOpacity})` }
    : {};

  if (!editMode) {
    return (
      <div className="space-y-6">
        {!viewHideHeader && (
          <div className="relative rounded-2xl overflow-hidden">
            {hasBg && (
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                {viewBgColor && <div className="absolute inset-0" style={{ backgroundColor: viewBgColor, opacity: viewBgOpacity }} />}
                {viewBgImage && resolvedViewBgImage && <div className="absolute inset-0" style={{ backgroundImage: `url("${resolvedViewBgImage}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: viewBgOpacity }} />}
              </div>
            )}
            {viewHeaderImage && resolvedViewHeaderImage && (
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `url("${resolvedViewHeaderImage}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: 0.45,
              }} />
            )}
            {viewBgImage?.startsWith("data:") && (
              <div className="absolute top-2 right-2 z-10">
                <LocalImageFixer
                  value={viewBgImage}
                  maxWidth={1200}
                  quality={0.8}
                  label="⚠️ Fix background"
                  onFixed={async (url) => {
                    await base44.entities.Alter.update(alter.id, {
                      custom_fields: { ...alter.custom_fields, [BG_IMAGE_KEY]: url }
                    });
                    queryClient.invalidateQueries({ queryKey: ["alters"] });
                  }}
                />
              </div>
            )}
            <div className={`relative z-10 flex gap-4 items-start ${hasBg || viewHeaderImage ? "p-4" : ""}`}>
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
                  {alter.avatar_url
                    ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                    : <User className="w-10 h-10" style={{ color: alterTextContrast || "hsl(var(--muted-foreground))" }} />}
                </div>
                <div className="absolute -bottom-2 left-0 right-0 flex justify-center">
                  <LocalImageFixer
                    value={alter.avatar_url}
                    maxWidth={400}
                    quality={0.85}
                    onFixed={async (url) => {
                      await base44.entities.Alter.update(alter.id, { avatar_url: url });
                      queryClient.invalidateQueries({ queryKey: ["alters"] });
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h2 className="font-display text-2xl font-semibold" style={{ color: viewHeaderText || undefined }}>
                  {alter.name}
                </h2>
                {alter.alias && <p className="text-sm" style={{ color: viewHeaderText ? `${viewHeaderText}cc` : "hsl(var(--muted-foreground))" }}>aka {alter.alias}</p>}
                {alter.pronouns && <p className="text-sm" style={{ color: viewHeaderText ? `${viewHeaderText}cc` : "hsl(var(--muted-foreground))" }}>{alter.pronouns}</p>}
                {alter.birthday && <p className="text-xs" style={{ color: viewHeaderText ? `${viewHeaderText}99` : "hsl(var(--muted-foreground))" }}>🎂 {alter.birthday}</p>}
                {alter.role && (
                  <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full mt-1"
                    style={{
                      backgroundColor: viewHeaderText ? `${viewHeaderText}20` : (alter.color ? `${alter.color}20` : "hsl(var(--muted))"),
                      color: viewHeaderText || alter.color || "hsl(var(--muted-foreground))",
                    }}>
                    {alter.role}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {alter.description ? (() => {
          const blocks = htmlToBlocks(alter.description);
          // If all blocks are raw/text type whose content looks like encoded data, the bio is corrupted
          const looksCorrupted = blocks.length > 0 && blocks.every(b =>
            (b.type === "raw" || b.type === "text") &&
            (b.content?.includes("data-blocks=") || b.content?.match(/^%5B|^blocks=/))
          );
          if (looksCorrupted) {
            return (
              <div className="bg-muted/20 rounded-xl p-4 border border-border/40 text-center">
                <p className="text-sm text-muted-foreground italic">Bio display issue — open Edit to re-save the bio and it will display correctly.</p>
              </div>
            );
          }
          return (
            <div className="bg-muted/20 rounded-xl p-4 border border-border/40" style={sectionCardStyle}>
              <SimplePreview blocks={blocks} onBlockChange={() => {}} readOnly={true} />
            </div>
          );
        })() : (
          <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/30">
            No bio yet. Tap <strong>Edit</strong> to add one.
          </div>
        )}

        {alter.groups && alter.groups.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Groups</p>
            <div className="flex flex-wrap gap-1.5">
              {alter.groups.map((g) => (
                <span key={g.id} className="px-2.5 py-1 rounded-full text-xs font-medium border"
                  style={{ backgroundColor: g.color ? `${g.color}18` : "hsl(var(--muted))", borderColor: g.color ? `${g.color}40` : "hsl(var(--border))", color: g.color || "hsl(var(--foreground))" }}>
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {alter.tags && alter.tags.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {alter.tags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const customFieldValues = alter.custom_fields || {};
const FIELD_ORDER_KEY = "_field_order";
const perAlterOrder = customFieldValues[FIELD_ORDER_KEY] || null;
const orderedFields = perAlterOrder
  ? [...systemFields].sort((a, b) => {
      const ai = perAlterOrder.indexOf(a.id);
      const bi = perAlterOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    })
  : systemFields;
const visibleFilled = orderedFields.filter(f => f.is_visible !== false && customFieldValues[f.id]);          const alterSpecific = (alter.alter_custom_fields || []).filter(f => f.value);
          if (visibleFilled.length === 0 && alterSpecific.length === 0) return null;
          return (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Info</p>
              <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden" style={sectionCardStyle}>
                {visibleFilled.map((field, i) => (
                  <div key={field.id} className={`flex gap-3 px-3 py-2.5 ${i < visibleFilled.length + alterSpecific.length - 1 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5 leading-relaxed">{field.name}</span>
                    <span className="text-xs text-foreground flex-1 leading-relaxed">
                      {field.field_type === "boolean" ? (customFieldValues[field.id] === "true" ? "Yes" : "No") : customFieldValues[field.id]}
                    </span>
                  </div>
                ))}
                {alterSpecific.map((field, idx) => (
                  <div key={idx} className={`flex gap-3 px-3 py-2.5 ${idx < alterSpecific.length - 1 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5 leading-relaxed">{field.name}</span>
                    <span className="text-xs text-foreground flex-1 leading-relaxed">{field.value}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── EDIT MODE ──
  return (
    <div className="space-y-4">
      {form.color && <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: form.color }} />}

      {/* Avatar */}
      <div className="flex justify-center">
        <button type="button" onClick={() => setShowAvatarModal(true)}
          className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors overflow-hidden group"
          style={{ backgroundColor: bgColorAlter || "hsl(var(--muted))" }}>
          {form.avatar_url
            ? <img src={form.avatar_url} alt={form.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center" style={{ color: textOnColor || "hsl(var(--muted-foreground))" }}><User className="w-10 h-10" /></div>}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Upload className="w-5 h-5 text-white" />
          </div>
        </button>
      </div>

      {/* Name + Alias row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Name *</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Alter name" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Alias</label>
          <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short nickname" />
        </div>
      </div>

      {/* Pronouns + Role + Color row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Pronouns</label>
          <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Role</label>
          <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector..." />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Color</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowColorPicker(true)}
              className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
              style={{ backgroundColor: form.color || "#8b5cf6" }} />
            <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="#8b5cf6" className="font-mono text-xs" />
          </div>
        </div>
      </div>

      {/* Birthday */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Birthday / Split date</label>
        <Input
          type="date"
          value={form.birthday || ""}
          onChange={(e) => set("birthday", e.target.value)}
          className="text-sm"
        />
      </div>

      {/* Profile Background — compact */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Image className="w-3.5 h-3.5 text-primary" /> Profile Style
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setBgField(HIDE_HEADER_KEY, !hideHeader)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {hideHeader ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {hideHeader ? "Header hidden" : "Header visible"}
            </button>
            {(bgColor || bgImage || headerTextColor) && (
              <button type="button" onClick={clearBg} className="text-xs text-destructive hover:text-destructive/80 transition-colors">Clear</button>
            )}
          </div>
        </div>

        {/* Compact bg preview */}
        <div className="relative w-full h-12 rounded-lg overflow-hidden border border-border/40 bg-muted/20">
          {bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor, opacity: bgOpacity }} />}
          {bgImage && resolvedEditBgImage && <div className="absolute inset-0" style={{ backgroundImage: `url("${resolvedEditBgImage}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgOpacity }} />}
          <div className="absolute inset-0 flex items-center justify-center gap-3">
            <span className="text-sm font-semibold" style={{ color: headerTextColor || "hsl(var(--foreground)/0.6)" }}>{form.name || "Name"}</span>
            <span className="text-xs" style={{ color: headerTextColor ? `${headerTextColor}cc` : "hsl(var(--muted-foreground))" }}>{form.pronouns || "they/them"}</span>
          </div>
        </div>

        {/* Colors grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Background color</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowBgColorPicker(true)}
                className="w-7 h-7 rounded-md border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0 relative"
                style={{ backgroundColor: bgColor || "transparent" }}>
                {!bgColor && <span className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">+</span>}
              </button>
              <Input value={bgColor} onChange={e => setBgField(BG_COLOR_KEY, e.target.value)}
                placeholder="#1a0a2e" className="font-mono text-xs flex-1 h-7" />
              {bgColor && <button type="button" onClick={() => setBgField(BG_COLOR_KEY, "")} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="w-3 h-3" /></button>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Page text color</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowPageTextPicker(true)}
                className="w-7 h-7 rounded-md border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: pageTextColor || "transparent" }}>
                {!pageTextColor && <span className="text-muted-foreground text-xs font-bold">A</span>}
              </button>
              <Input value={pageTextColor} onChange={e => setBgField(PAGE_TEXT_KEY, e.target.value)}
                placeholder="Default" className="font-mono text-xs flex-1 h-7" />
              {pageTextColor && <button type="button" onClick={() => setBgField(PAGE_TEXT_KEY, "")} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="w-3 h-3" /></button>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Header text color</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowHeaderTextPicker(true)}
                className="w-7 h-7 rounded-md border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: headerTextColor || "transparent" }}>
                {!headerTextColor && <span className="text-muted-foreground text-xs font-bold">A</span>}
              </button>
              <Input value={headerTextColor} onChange={e => setBgField(HEADER_TEXT_KEY, e.target.value)}
                placeholder="Default" className="font-mono text-xs flex-1 h-7" />
              {headerTextColor && <button type="button" onClick={() => setBgField(HEADER_TEXT_KEY, "")} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="w-3 h-3" /></button>}
            </div>
          </div>
        </div>

        {/* Header banner image */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Header image <span className="text-muted-foreground/50">(banner at top)</span></label>
          <div className="flex gap-2">
            <Input value={headerImage} onChange={e => setBgField(HEADER_IMAGE_KEY, e.target.value)}
              placeholder="https://… or upload →" className="flex-1 text-xs h-7" />
            <button type="button" onClick={() => headerFileInputRef.current?.click()} disabled={uploadingHeader}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0">
              {uploadingHeader ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 text-muted-foreground" />}
            </button>
            <input ref={headerFileInputRef} type="file" accept="image/*" hidden onChange={handleHeaderUpload} />
            {headerImage && <button type="button" onClick={() => setBgField(HEADER_IMAGE_KEY, "")} className="text-muted-foreground hover:text-destructive flex-shrink-0"><X className="w-3 h-3" /></button>}
          </div>
        </div>

        {/* Full-page background image */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Background image <span className="text-muted-foreground/50">(covers whole page)</span></label>
          <div className="flex gap-2">
            <Input value={bgImage} onChange={e => setBgField(BG_IMAGE_KEY, e.target.value)}
              placeholder="https://… or upload →" className="flex-1 text-xs h-7" />
            <button type="button" onClick={() => bgFileInputRef.current?.click()} disabled={uploadingBg}
              className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0">
              {uploadingBg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 text-muted-foreground" />}
            </button>
            <input ref={bgFileInputRef} type="file" accept="image/*" hidden onChange={handleBgUpload} />
            {bgImage && <button type="button" onClick={() => setBgField(BG_IMAGE_KEY, "")} className="text-muted-foreground hover:text-destructive flex-shrink-0"><X className="w-3 h-3" /></button>}
          </div>
        </div>

        {/* Opacity — only show if bg set */}
        {(bgColor || bgImage) && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground font-medium flex-shrink-0">BG opacity</label>
            <input type="range" min={0.02} max={1} step={0.01} value={bgOpacity}
              onChange={e => setBgField(BG_OPACITY_KEY, parseFloat(e.target.value))}
              className="flex-1 h-1 accent-primary" />
            <span className="text-xs text-muted-foreground flex-shrink-0">{Math.round(bgOpacity * 100)}%</span>
          </div>
        )}

        {/* Section readability — always show when any bg is set */}
        {(bgColor || bgImage) && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground font-medium flex-shrink-0">Readability</label>
            <input type="range" min={0} max={0.97} step={0.01} value={sectionBgOpacity}
              onChange={e => setBgField(SECTION_BG_KEY, parseFloat(e.target.value))}
              className="flex-1 h-1 accent-primary" />
            <span className="text-xs text-muted-foreground flex-shrink-0">{Math.round(sectionBgOpacity * 100)}%</span>
          </div>
        )}
      </div>

      <BioEditor value={form.description} onChange={(val) => set("description", val)} />

      {/* Groups */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-primary flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Groups</label>
          <button type="button" onClick={() => setShowGroupPicker(true)} className="text-xs text-primary hover:text-primary/80 font-medium">Edit →</button>
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
        ) : <p className="text-xs text-muted-foreground">Not in any groups</p>}
      </div>

      {alter.tags && alter.tags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-2"><Tag className="w-3.5 h-3.5" /> Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {alter.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">{tag}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleArchive} disabled={saving} className="flex-1">
            {alter?.is_archived ? <><ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive</> : <><Archive className="w-4 h-4 mr-2" /> Archive</>}
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={deleting} className="flex-1 text-destructive hover:text-destructive border-destructive/30">
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete
          </Button>
        </div>
      </div>

      <GroupPickerModal alter={alter} open={showGroupPicker} onClose={() => setShowGroupPicker(false)} />
      {showAvatarModal && <AvatarModal src={form.avatar_url} onSave={(url) => set("avatar_url", url)} onClose={() => setShowAvatarModal(false)} />}
      {showColorPicker && <ColorPickerModal color={form.color || "#8b5cf6"} label="Alter Color" onSave={(hex) => set("color", hex)} onClose={() => setShowColorPicker(false)} />}
      {showBgColorPicker && <ColorPickerModal color={bgColor || "#1a0a2e"} label="Background Color" onSave={(hex) => setBgField(BG_COLOR_KEY, hex)} onClose={() => setShowBgColorPicker(false)} />}
      {showHeaderTextPicker && <ColorPickerModal color={headerTextColor || "#ffffff"} label="Header Text Color" onSave={(hex) => setBgField(HEADER_TEXT_KEY, hex)} onClose={() => setShowHeaderTextPicker(false)} />}
      {showPageTextPicker && <ColorPickerModal color={pageTextColor || "#ffffff"} label="Page Text Color" onSave={(hex) => setBgField(PAGE_TEXT_KEY, hex)} onClose={() => setShowPageTextPicker(false)} />}
    </div>
  );
}