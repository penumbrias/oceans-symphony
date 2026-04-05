import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { User, Tag, Users, Save, Archive, ArchiveRestore, Trash2, Loader2, Upload, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import { HexColorPicker } from "react-colorful";
import BioEditor from "@/components/alters/BioEditor";

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const BG_OPACITY_KEY = "_bg_opacity";
const HEADER_TEXT_KEY = "_header_text_color";

function ColorPickerModal({ color = "#8b5cf6", label = "Color", onSave, onClose }) {
  const [hex, setHex] = React.useState(color);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{label}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <HexColorPicker color={hex} onChange={setHex} style={{ width: "100%" }} />
        <input type="text" value={hex}
          onChange={(e) => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setHex(e.target.value); }}
          placeholder="#000000"
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
        <div className="w-full h-12 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium text-sm cursor-pointer">Cancel</button>
          <button type="button" onClick={() => { onSave(hex); onClose(); }}
            disabled={!/^#[0-9A-F]{6}$/i.test(hex)}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm cursor-pointer disabled:opacity-50">Save</button>
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

function BgPreview({ bgColor, bgImage, bgOpacity, headerTextColor }) {
  const opacity = bgOpacity !== undefined ? bgOpacity : 0.15;
  return (
    <div className="relative w-full h-16 rounded-xl overflow-hidden border border-border/40 bg-muted/20">
      {bgColor && <div className="absolute inset-0 rounded-xl" style={{ backgroundColor: bgColor, opacity }} />}
      {bgImage && <div className="absolute inset-0 rounded-xl" style={{ backgroundImage: `url("${bgImage}")`, backgroundSize: "cover", backgroundPosition: "center", opacity }} />}
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        <span className="text-sm font-semibold" style={{ color: headerTextColor || "hsl(var(--foreground)/0.6)" }}>Name</span>
        <span className="text-xs" style={{ color: headerTextColor ? `${headerTextColor}cc` : "hsl(var(--muted-foreground))" }}>they/them</span>
      </div>
    </div>
  );
}

export default function ProfileTab({ alter, editMode, onEditModeChange, systemFields = [] }) {
  const queryClient = useQueryClient();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showHeaderTextPicker, setShowHeaderTextPicker] = useState(false);
  const [form, setForm] = useState({
    name: "", alias: "", pronouns: "", role: "",
    description: "", color: "", avatar_url: "",
    custom_fields: {},
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const fileInputRef = useRef(null);
  const bgFileInputRef = useRef(null);

  useEffect(() => {
    setForm({
      name: alter.name || "",
      alias: alter.alias || "",
      pronouns: alter.pronouns || "",
      role: alter.role || "",
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

  const setBgField = (key, val) => setForm(f => ({
    ...f,
    custom_fields: { ...f.custom_fields, [key]: val },
  }));

  const clearBg = () => setForm(f => {
    const cf = { ...f.custom_fields };
    delete cf[BG_COLOR_KEY]; delete cf[BG_IMAGE_KEY]; delete cf[BG_OPACITY_KEY]; delete cf[HEADER_TEXT_KEY];
    return { ...f, custom_fields: cf };
  });

  const handleSave = async () => {
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
  };

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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const hasColor = form.color && form.color.length > 3;
  const bgColorAlter = hasColor ? form.color : null;
  const textOnColor = hasColor ? getContrastColor(form.color) : null;

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); set("avatar_url", file_url); toast.success("Avatar uploaded!"); }
    catch { toast.error("Failed to upload avatar"); }
    finally { setUploadingAvatar(false); }
  };

  const handleBgUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingBg(true);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); setBgField(BG_IMAGE_KEY, file_url); toast.success("Background uploaded!"); }
    catch { toast.error("Failed to upload background"); }
    finally { setUploadingBg(false); e.target.value = ""; }
  };

  // View mode values
  const viewBgColor = alter.custom_fields?.[BG_COLOR_KEY] || "";
  const viewBgImage = alter.custom_fields?.[BG_IMAGE_KEY] || "";
  const viewBgOpacity = alter.custom_fields?.[BG_OPACITY_KEY] !== undefined ? alter.custom_fields[BG_OPACITY_KEY] : 0.15;
  const viewHeaderText = alter.custom_fields?.[HEADER_TEXT_KEY] || null;
  const hasBg = viewBgColor || viewBgImage;
  const alterTextContrast = alter.color ? getContrastColor(alter.color) : null;

  // ── VIEW MODE ──
  if (!editMode) {
    return (
      <div className="space-y-6">
        <div className="relative rounded-2xl overflow-hidden">
          {hasBg && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
              {viewBgColor && <div className="absolute inset-0" style={{ backgroundColor: viewBgColor, opacity: viewBgOpacity }} />}
              {viewBgImage && <div className="absolute inset-0" style={{ backgroundImage: `url("${viewBgImage}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: viewBgOpacity }} />}
            </div>
          )}
          <div className={`relative flex gap-4 items-start ${hasBg ? "p-4" : ""}`}>
            <div className="w-24 h-24 rounded-2xl border-2 border-border/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
              {alter.avatar_url
                ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                : <User className="w-10 h-10" style={{ color: alterTextContrast || "hsl(var(--muted-foreground))" }} />}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="font-display text-2xl font-semibold"
                style={{ color: viewHeaderText || undefined }}>
                {alter.name}
              </h2>
              {alter.alias && (
                <p className="text-sm" style={{ color: viewHeaderText ? `${viewHeaderText}cc` : "hsl(var(--muted-foreground))" }}>
                  aka {alter.alias}
                </p>
              )}
              {alter.pronouns && (
                <p className="text-sm" style={{ color: viewHeaderText ? `${viewHeaderText}cc` : "hsl(var(--muted-foreground))" }}>
                  {alter.pronouns}
                </p>
              )}
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

        {alter.description ? (
          <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
            <div className="text-sm leading-relaxed" style={{ wordBreak: "break-word" }}
              dangerouslySetInnerHTML={{ __html: alter.description }} />
          </div>
        ) : (
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
          const visibleFilled = systemFields.filter(f => f.is_visible !== false && customFieldValues[f.id]);
          const alterSpecific = (alter.alter_custom_fields || []).filter(f => f.value);
          if (visibleFilled.length === 0 && alterSpecific.length === 0) return null;
          return (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Info</p>
              <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden">
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
    <div className="space-y-6">
      {form.color && <div className="h-2 rounded-full w-full" style={{ backgroundColor: form.color }} />}

      <div className="flex justify-center">
        <div className="w-32 h-32 rounded-2xl border-4 border-border overflow-hidden shadow-xl"
          style={{ backgroundColor: bgColorAlter || "hsl(var(--muted))" }}>
          {form.avatar_url
            ? <img src={form.avatar_url} alt={form.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center" style={{ color: textOnColor || "hsl(var(--muted-foreground))" }}><User className="w-14 h-14" /></div>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Name *</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Alter name" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Alias</label>
          <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short nickname (for mentions)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Pronouns</label>
            <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium">Role</label>
            <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host..." />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Color</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowColorPicker(true)}
              className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
              style={{ backgroundColor: form.color || "#8b5cf6" }} />
            <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="#8b5cf6" className="font-mono text-sm" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Avatar</label>
          <div className="flex gap-2">
            <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://..." />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
              {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
          </div>
          {form.avatar_url && <img src={form.avatar_url} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-border" />}
        </div>

        {/* ── Profile Background & Style ── */}
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-primary" /> Profile Background
            </label>
            {(bgColor || bgImage || headerTextColor) && (
              <button type="button" onClick={clearBg} className="text-xs text-destructive hover:text-destructive/80 transition-colors">Clear all</button>
            )}
          </div>

          <BgPreview bgColor={bgColor} bgImage={bgImage} bgOpacity={bgOpacity} headerTextColor={headerTextColor} />

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Background color</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowBgColorPicker(true)}
                className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0 relative"
                style={{ backgroundColor: bgColor || "transparent" }}>
                {!bgColor && <span className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">+</span>}
              </button>
              <Input value={bgColor} onChange={e => setBgField(BG_COLOR_KEY, e.target.value)}
                placeholder="#1a0a2e" className="font-mono text-sm flex-1" />
              {bgColor && <button type="button" onClick={() => setBgField(BG_COLOR_KEY, "")} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Background image</label>
            <div className="flex gap-2">
              <Input value={bgImage} onChange={e => setBgField(BG_IMAGE_KEY, e.target.value)}
                placeholder="https://… or upload →" className="flex-1 text-sm" />
              <Button type="button" variant="outline" onClick={() => bgFileInputRef.current?.click()} disabled={uploadingBg} className="flex-shrink-0">
                {uploadingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input ref={bgFileInputRef} type="file" accept="image/*" hidden onChange={handleBgUpload} />
            </div>
            {bgImage && (
              <div className="flex items-center gap-2">
                <img src={bgImage} alt="bg preview" className="w-12 h-12 rounded-lg object-cover border border-border" onError={e => e.target.style.display = "none"} />
                <button type="button" onClick={() => setBgField(BG_IMAGE_KEY, "")}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            )}
          </div>

          {(bgColor || bgImage) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground font-medium">Opacity</label>
                <span className="text-xs text-muted-foreground">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <input type="range" min={0.02} max={1} step={0.01} value={bgOpacity}
                onChange={e => setBgField(BG_OPACITY_KEY, parseFloat(e.target.value))}
                className="w-full h-1 accent-primary" />
              <p className="text-xs text-muted-foreground/60">Lower opacity keeps the background subtle.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Header text color</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowHeaderTextPicker(true)}
                className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: headerTextColor || "transparent" }}>
                {!headerTextColor && <span className="text-muted-foreground text-xs font-bold">A</span>}
              </button>
              <Input value={headerTextColor} onChange={e => setBgField(HEADER_TEXT_KEY, e.target.value)}
                placeholder="Default" className="font-mono text-sm flex-1" />
              {headerTextColor && <button type="button" onClick={() => setBgField(HEADER_TEXT_KEY, "")} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        </div>

        <BioEditor value={form.description} onChange={(val) => set("description", val)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-primary flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Groups</label>
          <button type="button" onClick={() => setShowGroupPicker(true)} className="text-xs text-primary hover:text-primary/80 font-medium">Edit groups →</button>
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
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-3"><Tag className="w-3.5 h-3.5" /> Tags</p>
          <div className="flex flex-wrap gap-2">
            {alter.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">{tag}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
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

      {showColorPicker && (
        <ColorPickerModal color={form.color || "#8b5cf6"} label="Alter Color"
          onSave={(hex) => set("color", hex)} onClose={() => setShowColorPicker(false)} />
      )}
      {showBgColorPicker && (
        <ColorPickerModal color={bgColor || "#1a0a2e"} label="Background Color"
          onSave={(hex) => setBgField(BG_COLOR_KEY, hex)} onClose={() => setShowBgColorPicker(false)} />
      )}
      {showHeaderTextPicker && (
        <ColorPickerModal color={headerTextColor || "#ffffff"} label="Header Text Color"
          onSave={(hex) => setBgField(HEADER_TEXT_KEY, hex)} onClose={() => setShowHeaderTextPicker(false)} />
      )}
    </div>
  );
}