import React, { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Folder, Upload, X, Link2, Users, Crown, Search, Palette, Settings2, Check } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import ProfileStyleEditor from "@/components/shared/ProfileStyleEditor";
import GroupConfigToggles from "@/components/groups/GroupConfigToggles";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import GroupSelect from "@/components/groups/GroupSelect";
import { SubSection, IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import BioEditor from "@/components/alters/BioEditor";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { pickGroupConfig } from "@/lib/groupConfig";

export default function CreateGroupModal({ open, onClose, parentGroup = null }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;

  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isSub, setIsSub] = useState(false);
  const [ownerAlterId, setOwnerAlterId] = useState("");
  const [parent, setParent] = useState(parentGroup ? (parentGroup.sp_id || parentGroup.id) : "");
  const [selectedMembers, setSelectedMembers] = useState(() => new Set());
  const [showMembers, setShowMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [description, setDescription] = useState("");
  const [customFields, setCustomFields] = useState({});
  const [config, setConfig] = useState(() => pickGroupConfig({}));
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAvatarUrl, setShowAvatarUrl] = useState(false);
  const avatarFileRef = useRef(null);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: open });
  const { data: allGroups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: open });

  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const avatarPreview = useResolvedAvatarUrl(avatarUrl);

  const setCF = (key, val) => setCustomFields((c) => ({ ...c, [key]: val }));
  const clearCF = (key) => setCustomFields((c) => { const n = { ...c }; delete n[key]; return n; });

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return liveAlters;
    return liveAlters.filter((a) =>
      (a.name || "").toLowerCase().includes(q) || (a.alias || "").toLowerCase().includes(q)
    );
  }, [liveAlters, memberQuery]);

  const toggleMember = (id) => setSelectedMembers((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try {
      const { dataUrl } = await processUploadedImage(file, 400, 0.82);
      if (isLocalMode()) {
        const imageId = `group-avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setAvatarUrl(createLocalImageUrl(imageId));
      } else {
        setAvatarUrl(dataUrl);
      }
      toast.success("Avatar saved!");
    } catch {
      toast.error("Failed to process avatar");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const reset = () => {
    setName(""); setColor("#8b5cf6"); setAvatarUrl("");
    setIsSub(false); setOwnerAlterId("");
    setParent(parentGroup ? (parentGroup.sp_id || parentGroup.id) : "");
    setSelectedMembers(new Set()); setShowMembers(false); setMemberQuery("");
    setDescription(""); setCustomFields({}); setConfig(pickGroupConfig({}));
    setShowAvatarUrl(false);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const member_sp_ids = [...selectedMembers]
        .map((id) => { const a = liveAlters.find((x) => x.id === id); return a ? (a.sp_id || a.id) : null; })
        .filter(Boolean);
      await base44.entities.Group.create({
        name: name.trim(),
        color,
        avatar_url: avatarUrl,
        description,
        owner_alter_id: isSub ? (ownerAlterId || "") : "",
        parent: parent || "",
        member_sp_ids,
        custom_fields: customFields,
        ...pickGroupConfig(config),
      });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success("Group created!");
      reset();
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to create group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50">
          <DialogHeader>
            <DialogTitle>Add New Group{parentGroup ? ` in ${parentGroup.name}` : ""}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {/* Name + Avatar */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Age, Gender, Role…" />
            </div>
            <div className="flex-shrink-0 w-[76px] flex flex-col items-center gap-1.5">
              <Label className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">Avatar</Label>
              <div className="w-[68px] h-[68px] rounded-xl border-2 border-border/60 overflow-hidden flex items-center justify-center" style={{ backgroundColor: color ? `${color}22` : "hsl(var(--muted))" }}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : <Folder className="w-7 h-7" style={{ color: color || "hsl(var(--muted-foreground))" }} />}
              </div>
              {/* Wrap to stay within the avatar's width (2 per row). */}
              <div className="flex flex-wrap justify-center gap-0.5 w-[68px]">
                <IconButton icon={Upload} title="Upload image" onClick={() => avatarFileRef.current?.click()} busy={uploadingAvatar} />
                <AssetButton onPick={(url) => setAvatarUrl(url)} className={iconBtnClass()} />
                <IconButton icon={Link2} title="Image URL" onClick={() => setShowAvatarUrl((s) => !s)} />
                <IconButton icon={X} title="Remove avatar" onClick={() => setAvatarUrl("")} danger disabled={!avatarUrl} />
              </div>
              <button type="button" onClick={() => setShowColorPicker(true)} title="Group colour"
                className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground hover:text-foreground">
                <span className="w-4 h-4 rounded border border-border" style={{ backgroundColor: color }} /> Colour
              </button>
              <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </div>
          </div>
          {showAvatarUrl && (
            <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://… or paste an image URL" />
          )}

          {/* Manage members — opens the same full "Manage members" modal used
              everywhere else (selection-only here since the group doesn't
              exist yet), instead of a bare dropdown. Pulled up directly under
              the name so the form doesn't leave a tall gap. */}
          <div>
            <button type="button" onClick={() => setShowMembers(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 text-sm font-medium transition-colors">
              <Users className="w-4 h-4" /> Manage members{selectedMembers.size ? ` (${selectedMembers.size})` : ""}
            </button>
            {showMembers && (
              <GroupMembersModal
                selectionMode
                isOpen={showMembers}
                onClose={() => setShowMembers(false)}
                group={{ id: "__new__", name: name.trim() || "New group", color }}
                allGroups={allGroups}
                selectedIds={selectedMembers}
                onToggleSelection={(id) => toggleMember(id)}
              />
            )}
          </div>

          {/* Subsystem — collapses to just the toggle when off */}
          <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="group-is-sub" className="flex items-center gap-1.5 cursor-pointer text-sm font-medium">
                <Crown className="w-3.5 h-3.5 text-amber-500" /> {subTerm.charAt(0).toUpperCase() + subTerm.slice(1)}
              </Label>
              <Switch id="group-is-sub" checked={isSub} onCheckedChange={(v) => { setIsSub(v); if (!v) setOwnerAlterId(""); }} />
            </div>
            {isSub && (
              <div className="space-y-1.5">
                <Label className="text-xs">Group root</Label>
                <AlterSearchSelect
                  alters={liveAlters}
                  value={ownerAlterId || null}
                  onChange={(id) => setOwnerAlterId(id || "")}
                  terms={t}
                  zIndex={10000}
                  placeholder={`Choose the root ${t.alter}…`}
                  noneLabel="No root yet"
                />
                <p className="text-[0.6875rem] text-muted-foreground leading-snug">
                  The root becomes the parent / host of this {subTerm}; its members are their inner {t.alters}.
                </p>
              </div>
            )}
          </div>

          {/* Parent group — nested, parent-respecting single-select */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Parent group</Label>
            <GroupSelect groups={allGroups} value={parent} onChange={setParent} zIndex={10000} />
          </div>

          {/* Description / Bio */}
          <div className="space-y-1.5">
            <Label>Description / Bio</Label>
            <BioEditor value={description} onChange={setDescription} />
          </div>

          {/* Profile style */}
          <SubSection title="Profile style" icon={Palette} defaultOpen={false}>
            <ProfileStyleEditor customFields={customFields} setField={setCF} clearField={clearCF} />
          </SubSection>

          {/* Group config */}
          <SubSection title="Group config" icon={Settings2} defaultOpen={false}>
            <GroupConfigToggles values={config} onChange={(key, val) => setConfig((c) => ({ ...c, [key]: val }))} />
          </SubSection>
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-border/50">
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Create Group
          </Button>
        </div>
      </DialogContent>

      {showColorPicker && (
        <ColorPickerModal color={color} label="Group colour" onSave={setColor} onClose={() => setShowColorPicker(false)} />
      )}
    </Dialog>
  );
}
