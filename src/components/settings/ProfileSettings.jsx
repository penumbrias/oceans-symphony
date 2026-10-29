// The {System}'s own profile — picture, banner, name and bio — as its
// own Settings page (v0.320.0). Moved out of Settings.jsx when the home
// became a flat list; the fields and the save are unchanged.
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Check, Upload, X as XIcon, Globe, Images, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, encodeCanvasForMime } from "@/lib/localImageStorage";
import BioEditor from "@/components/alters/BioEditor";
import { IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
import { Group, SliderRow, ChoiceRow, SwitchRow } from "@/components/shared/SettingRows";

export default function ProfileSettings() {
  const terms = useTerms();
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const activeCount = alters.filter(a => !a.is_archived).length;
  const archivedCount = alters.filter(a => a.is_archived).length;

  const { data: settingsList = [], refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  // Not settingsList[0]: a boot-created empty stub can shadow the real record
  // (e.g. after an Ampersand import), which made the profile name / bio / avatar
  // read + save against the wrong row. Pick the record that actually has profile
  // content — same resolution the switcher and useSystemIdentity use.
  const settings = pickPrimarySystemSettings(settingsList);
  const [systemName, setSystemName] = useState("");
  const [systemAvatarUrl, setSystemAvatarUrl] = useState("");
  const [uploadingSysAvatar, setUploadingSysAvatar] = useState(false);
  const [sysAvatarAssets, setSysAvatarAssets] = useState(false);
  const [sysBannerAssets, setSysBannerAssets] = useState(false);
  const resolvedSysAvatar = useResolvedAvatarUrl(systemAvatarUrl);
  // Banner + rich bio — the system's own profile, mirroring an alter's
  // header image + bio. Surfaced on the alters directory (/Home) header.
  const [systemBannerUrl, setSystemBannerUrl] = useState("");
  const [uploadingSysBanner, setUploadingSysBanner] = useState(false);
  const resolvedSysBanner = useResolvedAvatarUrl(systemBannerUrl);
  const [systemBio, setSystemBio] = useState("");
  // Banner display config: how tall it is, where the image sits vertically
  // (0 = show the top, 100 = show the bottom), and which pages it shows on.
  const [systemBannerHeight, setSystemBannerHeight] = useState(150);
  const [systemBannerPosition, setSystemBannerPosition] = useState(50);
  const [systemBannerScope, setSystemBannerScope] = useState("home");
  // Alter count is hidden by default — the raw number can feel clinical or
  // invasive depending on how the user relates to their system. The reveal
  // toggle is local-only (intentionally not persisted) so each visit starts
  // hidden again.
  const [showAlterCount, setShowAlterCount] = useState(false);
  const [saving, setSaving] = useState(false);


  React.useEffect(() => {
    if (settings?.system_name) setSystemName(settings.system_name);
    if (settings?.system_avatar_url !== undefined) setSystemAvatarUrl(settings.system_avatar_url || "");
    if (settings?.system_banner_url !== undefined) setSystemBannerUrl(settings.system_banner_url || "");
    // Bio is the single source now — fall back to the old plain description
    // so existing systems keep their text (it gets merged on next save).
    if (settings?.system_bio || settings?.system_description) {
      setSystemBio(settings.system_bio || settings.system_description || "");
    }
    if (typeof settings?.system_banner_height === "number") setSystemBannerHeight(settings.system_banner_height);
    if (typeof settings?.system_banner_position === "number") setSystemBannerPosition(settings.system_banner_position);
    if (settings?.system_banner_scope) setSystemBannerScope(settings.system_banner_scope);
    // Keyed on the settings ROW, not the object: the settings query is
    // invalidated all over the app, and re-seeding on every new object
    // overwrote whatever the user was part-way through typing — including
    // a bio they had just cleared, which then saved itself back.
  }, [settings?.id]);

  // Upload + compress a new system-wide avatar. Mirrors the alter
  // avatar uploader in ProfileTab so the user experience is identical
  // (PNG transparency preserved, local-mode images go through the
  // saveLocalImage path so they survive reload).
  const handleSystemAvatarUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingSysAvatar(true);
    try {
      const compress = (f, maxWidth = 400, quality = 0.85) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const u = URL.createObjectURL(f);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(u);
          resolve(encodeCanvasForMime(canvas, f.type, quality));
        };
        img.onerror = reject;
        img.src = u;
      });
      const dataUrl = await compress(file);
      if (isLocalMode()) {
        const imageId = `system-avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setSystemAvatarUrl(createLocalImageUrl(imageId));
      } else {
        setSystemAvatarUrl(dataUrl);
      }
    } catch { toast.error("Failed to process image"); }
    finally { setUploadingSysAvatar(false); e.target.value = ""; }
  };

  // Banner is wider than the avatar — keep more horizontal resolution.
  const handleSystemBannerUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingSysBanner(true);
    try {
      const compress = (f, maxWidth = 1200, quality = 0.82) => new Promise((resolve, reject) => {
        const img = new window.Image();
        const u = URL.createObjectURL(f);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(u);
          resolve(encodeCanvasForMime(canvas, f.type, quality));
        };
        img.onerror = reject;
        img.src = u;
      });
      const dataUrl = await compress(file);
      if (isLocalMode()) {
        const imageId = `system-banner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(imageId, dataUrl);
        setSystemBannerUrl(createLocalImageUrl(imageId));
      } else {
        setSystemBannerUrl(dataUrl);
      }
    } catch { toast.error("Failed to process image"); }
    finally { setUploadingSysBanner(false); e.target.value = ""; }
  };

  const [saved, setSaved] = useState(false);

  const handleSaveName = async () => {
    setSaving(true);
    // The bio is now the single source of truth. Keep system_description in
    // sync as a plain-text derivative so heuristics that read it (e.g. the
    // friends identity resolver) stay current.
    const bioPlain = (systemBio || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const data = {
      system_name: systemName,
      system_description: bioPlain,
      system_avatar_url: systemAvatarUrl || null,
      system_banner_url: systemBannerUrl || null,
      system_bio: systemBio || "",
      system_banner_height: systemBannerHeight,
      system_banner_position: systemBannerPosition,
      system_banner_scope: systemBannerScope,
    };
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, data);
      } else {
        await base44.entities.SystemSettings.create(data);
      }
      refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };



  return (
    <div className="space-y-4">
      {/* The count is hidden by default — the raw number can feel clinical
          or invasive depending on how the person relates to their system.
          The reveal is local-only, so each visit starts hidden again. */}
      <SwitchRow label={`Show ${terms.alter} count`}
        hint={showAlterCount ? `${activeCount} active${archivedCount > 0 ? ` · ${archivedCount} archived` : ""}` : "Hidden until you ask; starts hidden every visit"}
        checked={showAlterCount} onChange={setShowAlterCount} />
      {/* Picture + banner, side by side. URL paste lives behind the
          link icon so the row stays to just the wireframe's ↑ ⧉ ×. */}
      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Label className="text-sm font-medium">{terms.System} picture</Label>
          <div className="w-[4.5rem] h-[4.5rem] rounded-full overflow-hidden border border-border/50 bg-muted flex items-center justify-center">
            {resolvedSysAvatar ? (
              <img src={resolvedSysAvatar} alt={`${terms.system} avatar`} className="w-full h-full object-cover" />
            ) : (
              <Globe className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          {/* Buttons wrap to stay within the avatar's width (2 per row). */}
          <div className="flex flex-wrap gap-1 w-[4.5rem]">
            <label title="Upload an image" aria-label="Upload an image" className={`${iconBtnClass()} cursor-pointer`}>
              {uploadingSysAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <input type="file" accept="image/*" className="hidden" onChange={handleSystemAvatarUpload} />
            </label>
            <IconButton icon={Images} title="Choose from Assets" onClick={() => setSysAvatarAssets(true)} />
            <IconButton icon={Link2} title="Paste an image URL" onClick={() => { const u = window.prompt(`${terms.System} picture URL:`, systemAvatarUrl || ""); if (u !== null) setSystemAvatarUrl(u.trim()); }} />
            {systemAvatarUrl && (
              <IconButton icon={XIcon} title="Remove image" danger onClick={() => setSystemAvatarUrl("")} />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Label className="text-sm font-medium">{terms.System} banner</Label>
          <div className="rounded-xl overflow-hidden border border-border/50 bg-muted flex items-center justify-center relative transition-[height]" style={{ height: systemBannerUrl ? systemBannerHeight : 64 }}>
            {resolvedSysBanner ? (
              <>
                <img src={resolvedSysBanner} alt={`${terms.system} banner`} className="w-full h-full object-cover" style={{ objectPosition: `50% ${systemBannerPosition}%` }} />
                <span className="absolute bottom-1 right-2 text-[0.625rem] font-medium text-white bg-black/45 rounded px-1.5 py-0.5">{systemBannerHeight}px</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No banner</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <label title="Upload an image" aria-label="Upload an image" className={`${iconBtnClass()} cursor-pointer`}>
              {uploadingSysBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <input type="file" accept="image/*" className="hidden" onChange={handleSystemBannerUpload} />
            </label>
            <IconButton icon={Images} title="Choose from Assets" onClick={() => setSysBannerAssets(true)} />
            <IconButton icon={Link2} title="Paste an image URL" onClick={() => { const u = window.prompt(`${terms.System} banner URL:`, systemBannerUrl || ""); if (u !== null) setSystemBannerUrl(u.trim()); }} />
            {systemBannerUrl && (
              <IconButton icon={XIcon} title="Remove banner" danger onClick={() => setSystemBannerUrl("")} />
            )}
          </div>
        </div>
      </div>
      {sysAvatarAssets && (
        <AssetPickerModal open onClose={() => setSysAvatarAssets(false)} onSelect={(url) => { setSystemAvatarUrl(url); setSysAvatarAssets(false); }} />
      )}
      {sysBannerAssets && (
        <AssetPickerModal open onClose={() => setSysBannerAssets(false)} onSelect={(url) => { setSystemBannerUrl(url); setSysBannerAssets(false); }} />
      )}
      {systemBannerUrl && (
          <div>
            <Group title="Banner display">
              <SliderRow label="Banner height" hint="How far down the banner extends." value={systemBannerHeight} min={80} max={360} step={10} unit="px"
                onChange={(v) => setSystemBannerHeight(Number(v))} />
              <SliderRow label="Image position" hint="Which part of the image shows (top ↔ bottom)." value={systemBannerPosition} min={0} max={100} step={5} unit="%"
                onChange={(v) => setSystemBannerPosition(Number(v))} />
              <ChoiceRow label="Show banner on" hint={`"Home pages" = your dashboard and ${terms.alters} directory.`}
                options={[{ id: "home", label: "Home pages" }, { id: "all", label: "All pages" }, { id: "off", label: "Off" }]}
                value={systemBannerScope} onChange={setSystemBannerScope} />
            </Group>
          </div>
        )}
      <div>
        <Label className="text-sm font-medium">{terms.System} Name</Label>
        <Input placeholder={`Enter your ${terms.system} name...`} value={systemName}
          onChange={e => setSystemName(e.target.value)} className="mt-2" />
      </div>
      <div>
        <Label className="text-sm font-medium">{terms.System} Bio</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your {terms.system}'s bio — a tagline or a longer, formatted write-up. Shown on your {terms.alter} directory.
        </p>
        <div className="mt-2">
          <BioEditor value={systemBio} onChange={setSystemBio} />
        </div>
      </div>
      <Button onClick={handleSaveName} disabled={saving || saved} size="sm"
        className={saved ? "bg-green-600 hover:bg-green-600 text-white" : "bg-primary hover:bg-primary/90"}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : saved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        {saved ? "Saved!" : "Save"}
      </Button>
    </div>
  );
}
