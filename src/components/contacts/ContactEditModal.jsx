import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Upload, X, Palette, User, Plus, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { saveLocalImage, createLocalImageUrl, isLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import {
  DEFAULT_SAFETY_KEY,
  AWARENESS_OPTIONS,
  DEFAULT_AWARENESS_KEY,
  CONTACT_METHOD_TYPES,
  getSafetyLevels,
} from "@/lib/contacts";

// Create / edit an external Contact. Mirrors the AlterEditModal patterns
// (avatar upload → local image store, ColorPickerModal, Dialog shell) but for
// the separate Contacts directory. Rich per-alter links / custom fields /
// categories are later phases — this covers the system-wide core.
const BLANK = {
  name: "",
  nickname: "",
  avatar_url: "",
  color: "",
  safety: DEFAULT_SAFETY_KEY,
  relationship_label: "",
  awareness: DEFAULT_AWARENESS_KEY,
  contact_methods: [],
  is_emergency_support: false,
  about: "",
  safe_to_share: "",
  boundaries: "",
  system_rules: "",
  custom_fields: {},
};

export default function ContactEditModal({ open, onClose, contact = null, onSaved }) {
  const queryClient = useQueryClient();
  const isNew = !contact;
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const avatarFileRef = useRef(null);

  // Custom safety labels (Phase 2) — keep the shared cache an ARRAY.
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;
  const safetyLevels = getSafetyLevels(settings);

  // Separate custom-field definitions for contacts (NOT the alter CustomField set).
  const { data: fieldDefs = [] } = useQuery({ queryKey: ["contactCustomFields"], queryFn: () => base44.entities.ContactCustomField.list() });
  const sortedDefs = [...fieldDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""));

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setForm({
        name: contact.name || "",
        nickname: contact.nickname || "",
        avatar_url: contact.avatar_url || "",
        color: contact.color || "",
        safety: contact.safety || DEFAULT_SAFETY_KEY,
        relationship_label: contact.relationship_label || "",
        awareness: contact.awareness || DEFAULT_AWARENESS_KEY,
        contact_methods: Array.isArray(contact.contact_methods) ? contact.contact_methods : [],
        is_emergency_support: !!contact.is_emergency_support,
        about: contact.about || "",
        safe_to_share: contact.safe_to_share || "",
        boundaries: contact.boundaries || "",
        system_rules: contact.system_rules || "",
        custom_fields: contact.custom_fields && typeof contact.custom_fields === "object" ? { ...contact.custom_fields } : {},
      });
    } else {
      setForm(BLANK);
    }
    setNewFieldName("");
  }, [open, contact]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const avatarPreview = useResolvedAvatarUrl(form.avatar_url);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      if (isLocalMode()) {
        const { dataUrl, sizeKB } = await processUploadedImage(file, 512, 0.82);
        if (sizeKB > 500) toast.warning(`Compressed to ${sizeKB}KB — very large images may slow the app.`);
        const imageId = `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        set("avatar_url", createLocalImageUrl(imageId));
        toast.success(`Photo saved locally! (${sizeKB}KB)`);
      } else {
        toast.error("Photo upload requires local mode. Paste an image URL instead.");
      }
    } catch (err) {
      console.error("Contact photo upload error:", err);
      toast.error("Failed to process photo");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  // Contact-method rows
  const addMethod = () => set("contact_methods", [...form.contact_methods, { type: "phone", label: "", value: "" }]);
  const updateMethod = (i, patch) =>
    set("contact_methods", form.contact_methods.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMethod = (i) => set("contact_methods", form.contact_methods.filter((_, idx) => idx !== i));

  // Custom fields — value map keyed by field-definition id, stored on the Contact.
  const setFieldValue = (defId, value) => set("custom_fields", { ...form.custom_fields, [defId]: value });
  const addFieldDef = async () => {
    const fname = newFieldName.trim();
    if (!fname) return;
    try {
      await base44.entities.ContactCustomField.create({ name: fname, order: fieldDefs.length, created_date: new Date().toISOString() });
      setNewFieldName("");
      queryClient.invalidateQueries({ queryKey: ["contactCustomFields"] });
    } catch (err) { toast.error(err?.message || "Couldn't add field"); }
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Give this contact a name"); return; }
    setSaving(true);
    try {
      const cleanMethods = form.contact_methods
        .map((m) => ({ type: m.type || "other", label: (m.label || "").trim(), value: (m.value || "").trim() }))
        .filter((m) => m.value);
      const payload = {
        name,
        nickname: form.nickname.trim() || null,
        avatar_url: form.avatar_url || null,
        color: form.color || null,
        safety: form.safety || DEFAULT_SAFETY_KEY,
        relationship_label: form.relationship_label.trim() || null,
        awareness: form.awareness || DEFAULT_AWARENESS_KEY,
        contact_methods: cleanMethods,
        is_emergency_support: !!form.is_emergency_support,
        about: form.about.trim() || null,
        safe_to_share: form.safe_to_share.trim() || null,
        boundaries: form.boundaries.trim() || null,
        system_rules: form.system_rules.trim() || null,
        custom_fields: Object.fromEntries(
          Object.entries(form.custom_fields || {}).filter(([, v]) => v != null && String(v).trim() !== "")
        ),
      };
      let saved;
      if (isNew) {
        saved = await base44.entities.Contact.create({ ...payload, is_archived: false, is_pinned: false });
      } else {
        saved = await base44.entities.Contact.update(contact.id, payload);
      }
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(isNew ? "Contact added!" : "Contact updated");
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      console.error("Save contact error:", err);
      toast.error(err?.message || "Failed to save contact");
    } finally {
      setSaving(false);
    }
  };

  const initial = (form.nickname || form.name || "?").trim()[0]?.toUpperCase() || "?";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add contact" : "Edit contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-xl text-white flex-shrink-0 border border-border"
              style={{ backgroundColor: form.color || "#8b5cf6" }}
            >
              {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : initial}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => avatarFileRef.current?.click()} disabled={uploadingAvatar} className="gap-1.5">
                  {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Photo
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setColorOpen(true)} className="gap-1.5">
                  <Palette className="w-3.5 h-3.5" /> Colour
                </Button>
                {form.avatar_url && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => set("avatar_url", "")} className="text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
              {form.avatar_url && !isLocalImageUrl(form.avatar_url) && !form.avatar_url.startsWith("data:") && (
                <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://… image URL" className="text-xs h-7" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mark" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Nickname / saved as <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={form.nickname} onChange={(e) => set("nickname", e.target.value)} placeholder="Mark from class" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Relationship <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.relationship_label} onChange={(e) => set("relationship_label", e.target.value)} placeholder="College classmate, therapist, mom…" />
          </div>

          {/* Safety */}
          <div>
            <Label className="text-xs mb-1.5 block">Safety</Label>
            <div className="flex flex-wrap gap-1.5">
              {safetyLevels.map((lvl) => {
                const active = form.safety === lvl.key;
                return (
                  <button
                    key={lvl.key}
                    type="button"
                    onClick={() => set("safety", lvl.key)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? "text-white border-transparent" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`}
                    style={active ? { backgroundColor: lvl.color } : undefined}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Awareness */}
          <div>
            <Label className="text-xs mb-1.5 block">Do they know we're a system?</Label>
            <div className="flex flex-wrap gap-1.5">
              {AWARENESS_OPTIONS.map((opt) => {
                const active = form.awareness === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => set("awareness", opt.key)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Emergency support */}
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 cursor-pointer">
            <span className="flex items-center gap-2 text-sm">
              <LifeBuoy className="w-4 h-4 text-rose-500" />
              Emergency support contact
            </span>
            <Switch checked={form.is_emergency_support} onCheckedChange={(v) => set("is_emergency_support", v)} />
          </label>

          {/* Contact methods */}
          <div>
            <Label className="text-xs mb-1.5 block">Contact info</Label>
            <div className="space-y-2">
              {form.contact_methods.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={m.type}
                    onChange={(e) => updateMethod(i, { type: e.target.value })}
                    className="h-9 px-2 rounded-lg border border-input bg-background text-sm flex-shrink-0"
                  >
                    {CONTACT_METHOD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                  <Input value={m.value} onChange={(e) => updateMethod(i, { value: e.target.value })} placeholder="number / handle / address" className="flex-1" />
                  <button type="button" onClick={() => removeMethod(i)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" onClick={addMethod} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add contact method
              </button>
            </div>
          </div>

          {/* Text blocks (system-wide) */}
          <TextBlock label="About" value={form.about} onChange={(v) => set("about", v)} placeholder="Who they are, how we know them…" />
          <TextBlock label="Safe to share" value={form.safe_to_share} onChange={(v) => set("safe_to_share", v)} placeholder="What's okay to tell / show them…" />
          <TextBlock label="Boundaries" value={form.boundaries} onChange={(v) => set("boundaries", v)} placeholder="Boundaries we keep with them…" />
          <TextBlock label="System rules" value={form.system_rules} onChange={(v) => set("system_rules", v)} placeholder="Rules for the whole system about this person…" />

          {/* Custom fields — a separate set from alter custom fields. */}
          <div>
            <Label className="text-xs mb-1.5 block">Custom fields <span className="text-muted-foreground">(optional)</span></Label>
            <div className="space-y-2">
              {sortedDefs.map((def) => (
                <div key={def.id}>
                  <Label className="text-[0.6875rem] text-muted-foreground">{def.name}</Label>
                  <Input
                    value={form.custom_fields[def.id] || ""}
                    onChange={(e) => setFieldValue(def.id, e.target.value)}
                    placeholder={`${def.name}…`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <Input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFieldDef(); } }}
                  placeholder="New field name (e.g. Birthday, How we met)"
                  className="h-8 text-sm flex-1"
                />
                <Button type="button" size="sm" variant="outline" onClick={addFieldDef} disabled={!newFieldName.trim()} className="gap-1 flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
              {sortedDefs.length === 0 && (
                <p className="text-[0.6875rem] text-muted-foreground">Add fields like Birthday, Address, or How we met — they'll appear for every contact.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isNew ? "Add contact" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {colorOpen && (
        <ColorPickerModal
          color={form.color || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => set("color", hex)}
          onClose={() => setColorOpen(false)}
        />
      )}
    </Dialog>
  );
}

function TextBlock({ label, value, onChange, placeholder }) {
  return (
    <div>
      <Label className="text-xs">{label} <span className="text-muted-foreground">(optional)</span></Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-sm text-foreground resize-y outline-none mt-0.5"
      />
    </div>
  );
}
