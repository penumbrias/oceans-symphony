import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Trash2, Archive, ArchiveRestore, Users, Upload, Pin, Crown, Folder, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import { useTerms } from "@/lib/useTerms";
import ColorPicker from "@/components/shared/ColorPicker";
import { saveLocalImage, createLocalImageUrl, isLocalImageUrl, getLocalImageId, deleteLocalImage, encodeCanvasForMime } from "@/lib/localImageStorage";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { Link2 } from "lucide-react";

// Pull a 4-digit year out of a free-form birthday string so we can keep
// the integer origin_year (used by Alter History / lineage) in sync
// with whatever the user typed in Birthday — even if it's just "2018"
// or "around 2018, age 7".
function extractYear(str) {
  if (!str) return "";
  const m = String(str).match(/\b(1[89]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? m[1] : "";
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
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
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
      let birthday = alter.birthday || "";
      let origin_year = alter.origin_year ? String(alter.origin_year) : "";
      // Default a blank field from the filled one — birthday and
      // origin_year are conceptually "when did this alter first
      // appear", so if the user only set one, mirror it into the
      // other on load. They can still edit either independently
      // afterwards.
      if (!birthday && origin_year) birthday = origin_year;
      if (!origin_year && birthday) origin_year = extractYear(birthday);
      setForm({
        name: alter.name || "", alias: alter.alias || "",
        pronouns: alter.pronouns || "", role: alter.role || "",
        description: alter.description || "", color: alter.color || "",
        avatar_url: alter.avatar_url || "",
        birthday, origin_year, is_pinned: !!alter.is_pinned, emoji: alter.emoji || "",
      });
    } else {
      setForm({ name: "", alias: "", pronouns: "", role: "", description: "", color: "", avatar_url: "", birthday: "", origin_year: "", is_pinned: false, emoji: "" });
    }
  }, [alter, open, isNew]);

const handleAvatarUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setUploadingAvatar(true);
  try {
    let localMode = false;
    try {
      const { isLocalMode } = await import("@/lib/storageMode");
      localMode = !!isLocalMode();
    } catch {
      localMode = false;
    }

    if (localMode) {
      const sizeMB = file.size / (1024 * 1024);

      const compressImage = (file, maxDim = 512, quality = 0.82) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            let { width, height } = img;
            const longest = Math.max(width, height);
            if (longest > maxDim) {
              const scale = maxDim / longest;
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            // Preserve PNG transparency — JPEG would flatten it to black.
            resolve(encodeCanvasForMime(canvas, file.type, quality));
          };
          img.onerror = reject;
          img.src = url;
        });
      };

      if (sizeMB > 0.5) {
        toast.info(`Image is ${sizeMB.toFixed(1)}MB — compressing for local storage...`);
      }

      const dataUrl = await compressImage(file);
      const compressedSizeKB = Math.round((dataUrl.length * 0.75) / 1024);

      if (compressedSizeKB > 500) {
        toast.warning(`Compressed to ${compressedSizeKB}KB — very large images may slow the app. Consider using a smaller image.`);
      }

      // Generate unique ID and store in local image storage
      const imageId = `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(imageId, dataUrl);
      const localImageUrl = createLocalImageUrl(imageId);

      setForm(f => ({ ...f, avatar_url: localImageUrl }));
      toast.success(`Avatar saved locally! (${compressedSizeKB}KB)`);
    } else {
      toast.error("Avatar upload requires cloud mode. Switch to cloud mode or paste an image URL instead.");
    }
  } catch (err) {
    console.error("Avatar upload error:", err);
    toast.error("Failed to process avatar");
  } finally {
    setUploadingAvatar(false);
    e.target.value = "";
  }
};

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const formData = { ...form, origin_year: form.origin_year ? parseInt(form.origin_year, 10) : null };
    try {
      if (isNew) {
        const created = await base44.entities.Alter.create({ ...formData, is_archived: false });
        // Apply selected group / subsystem memberships to the new alter.
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
      // Clean up local image if it exists
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Birthday/Origin-Year linking: when one is blank, typing into the
  // other auto-fills it. Once both are populated, edits stay
  // independent — the explicit "sync year from birthday" button
  // below re-links them if the user wants.
  const setBirthday = (val) => setForm((f) => {
    const update = { ...f, birthday: val };
    if (!f.origin_year && val) {
      const y = extractYear(val);
      if (y) update.origin_year = y;
    }
    return update;
  });
  const setOriginYear = (val) => setForm((f) => {
    const update = { ...f, origin_year: val };
    if (!f.birthday && val) update.birthday = val;
    return update;
  });
  const birthdayYear = extractYear(form.birthday);
  const canSyncYear = form.birthday && form.origin_year && birthdayYear && birthdayYear !== form.origin_year;

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

          <div className="flex gap-2">
            <div className="space-y-2 w-20 flex-shrink-0">
              <Label>Emoji</Label>
              <Input
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                placeholder="✨"
                maxLength={8}
                className="text-center text-lg"
                aria-label="Profile emoji or symbol"
              />
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={`${t.Alter} name`} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Alias</Label>
            <Input value={form.alias} onChange={(e) => set("alias", e.target.value)} placeholder="Short nickname (for mentions)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pronouns</Label>
              <Input value={form.pronouns} onChange={(e) => set("pronouns", e.target.value)} placeholder="they/them" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Protector, host..." />
            </div>
          </div>

          {/* When-they-first-appeared block. Birthday and Origin Year
              are two shapes of the same idea — the helper text under
              each label spells out which surface uses which value so
              they don't read as duplicates. */}
          <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
            <p className="text-xs font-medium text-foreground">When they first appeared</p>
            <div className="space-y-1">
              <Label className="text-xs">Birthday <span className="text-muted-foreground font-normal">— shown on the profile (🎂 line)</span></Label>
              <Input
                type="text"
                value={form.birthday}
                onChange={(e) => setBirthday(e.target.value)}
                placeholder="e.g. 2018-03-15, Age 7, around middle school"
              />
              <p className="text-[0.6875rem] text-muted-foreground leading-snug">Free-form — write whatever fits (exact date, age, era).</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Origin year <span className="text-muted-foreground font-normal">— used in {t.Alter} History timeline</span></Label>
                {canSyncYear && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, origin_year: birthdayYear }))}
                    className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1"
                  >
                    <Link2 className="w-3 h-3" /> Sync from birthday ({birthdayYear})
                  </button>
                )}
              </div>
              <Input
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                value={form.origin_year}
                onChange={(e) => setOriginYear(e.target.value)}
                placeholder={`Year they appeared, e.g. ${new Date().getFullYear() - 5}`}
              />
              <p className="text-[0.6875rem] text-muted-foreground leading-snug">Just the year — feeds the lineage/timeline view. Auto-filled from Birthday when blank.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPicker value={form.color || "#8b5cf6"} onChange={(v) => set("color", v)} />
          </div>

          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="flex gap-2">
              <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://..." />
              <AssetButton onPick={(url) => set("avatar_url", url)} className="h-10 w-10 flex items-center justify-center rounded-md border border-input bg-background hover:bg-muted/60 transition-colors flex-shrink-0" />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} aria-label={uploadingAvatar ? "Uploading avatar…" : "Upload avatar image"}>
                {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </div>
            {form.avatar_url && (
              <div className="flex items-center gap-2">
                <img src={form.avatar_url} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-border" />
                <LocalImageFixer
                  value={form.avatar_url}
                  maxWidth={400}
                  quality={0.85}
                  onFixed={(url) => set("avatar_url", url)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description / Bio</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Write a description..." className="min-h-[100px] resize-none" />
          </div>

          {isNew && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Groups &amp; {subTerm}s</Label>
              {selectedGroupIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[...selectedGroupIds].map((id) => {
                    const g = allGroups.find((x) => x.id === id);
                    if (!g) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ backgroundColor: g.color ? `${g.color}18` : "hsl(var(--muted))", borderColor: g.color ? `${g.color}40` : "hsl(var(--border))", color: g.color || "hsl(var(--foreground))" }}>
                        {g.owner_alter_id ? <Crown className="w-3 h-3 text-amber-500" /> : <Folder className="w-3 h-3" />}
                        {g.name}
                        <button type="button" onClick={() => removeGroup(id)} aria-label={`Remove ${g.name}`} className="-mr-0.5 hover:text-destructive"><X className="w-3 h-3" /></button>
                      </span>
                    );
                  })}
                </div>
              )}
              <select
                value=""
                onChange={(e) => { if (e.target.value) { addGroup(e.target.value); e.target.value = ""; } }}
                className="w-full text-sm rounded-lg border border-input bg-background px-2 py-2"
              >
                <option value="">Add to a group / {subTerm}…</option>
                {allGroups.filter((g) => !selectedGroupIds.has(g.id)).map((g) => (
                  <option key={g.id} value={g.id}>{g.owner_alter_id ? "◦ " : ""}{g.name}</option>
                ))}
              </select>
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

          {/* Pin shortcut — surfaces this {alter} in a quick-access
              gallery at the top of the {alters} page (and the Set Front
              modal). Doesn't change their position anywhere else. */}
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
            {isNew ? `Create ${t.Alter}` : "Save Changes"}
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
    </Dialog>
  );
}