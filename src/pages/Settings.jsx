import React, { useState, useRef, useEffect } from "react";
import { APP_VERSION, APP_RELEASE_STAGE } from "@/lib/appVersion";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import CustomTriggerTypesManager from "@/components/settings/CustomTriggerTypesManager";
import { useTerms } from "@/lib/useTerms";
import TermsSettings from "@/components/settings/TermsSettings";
import CustomFieldsManager from "@/components/settings/CustomFieldsManager";
import ArchivedAltersManager from "@/components/settings/ArchivedAltersManager";
import RelationshipTypesManager from "@/components/settings/RelationshipTypesManager";
import SimplyPluralConnect from "@/components/settings/SimplyPluralConnect";
import PluralKitConnect from "@/components/settings/PluralKitConnect";
import StorageModeSettings from "@/components/settings/StorageModeSettings";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import AdvancedAppearance from "@/components/settings/AdvancedAppearanceNew";
import UpcomingPlansSurfacesSection from "@/components/settings/UpcomingPlansSurfacesSection";
import NavigationSettings from "@/components/settings/NavigationSettings";
import RemindersSettings from "@/components/settings/RemindersSettings";
import AccessibilitySettings from "@/components/settings/AccessibilitySettings";
import QuickActionsConfig from "@/components/settings/QuickActionsConfig";
import { Save, Loader2, ChevronDown, Zap, Check, BarChart2, Users, Upload, X as XIcon, Globe } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, encodeCanvasForMime } from "@/lib/localImageStorage";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";
import MigrationBanner from "@/components/shared/MigrationBanner";
import RecentUpdates from "@/components/settings/RecentUpdates";
import PreviewModeSection from "@/components/settings/PreviewModeSection";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import BugReportModal from "@/components/settings/BugReportModal";


function Section({ id, icon, label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} data-tour={`settings-${id}`} className="border border-border/50 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
      >
        <span className="text-xl">{icon}</span>
        <span className="flex-1 font-semibold text-sm">{label}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 py-4 space-y-6 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const { mode: analyticsGrouping, setMode: setAnalyticsGrouping } = useAnalyticsGrouping();

  const SECTIONS = [
    { id: "system", label: "Profile", icon: "⚙️" },
    { id: "appearance", label: "Appearance", icon: "🎨" },
    { id: "accessibility", label: "Accessibility", icon: "♿" },
    { id: "alters", label: `${terms.Alters} & Fields`, icon: "👥" },
    { id: "checkin", label: "Tracking & Analytics", icon: "⚡" },
    { id: "reminders", label: "Reminders", icon: "🔔" },
    { id: "data", label: "Data & Privacy", icon: "💾" },
    { id: "disclaimer", label: "Disclaimer", icon: "⚠️" },
    { id: "bug-report", label: "Report a Bug", icon: "🐛" },
    { id: "updates", label: "Recent Updates", icon: "📋" },
  ];

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const activeCount = alters.filter(a => !a.is_archived).length;
  const archivedCount = alters.filter(a => a.is_archived).length;

  const { data: settingsList = [], isLoading, refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;
  const [systemName, setSystemName] = useState("");
  const [systemDescription, setSystemDescription] = useState("");
  const [systemAvatarUrl, setSystemAvatarUrl] = useState("");
  const [uploadingSysAvatar, setUploadingSysAvatar] = useState(false);
  const resolvedSysAvatar = useResolvedAvatarUrl(systemAvatarUrl);
  // Alter count is hidden by default — the raw number can feel clinical or
  // invasive depending on how the user relates to their system. The reveal
  // toggle is local-only (intentionally not persisted) so each visit starts
  // hidden again.
  const [showAlterCount, setShowAlterCount] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (settings?.system_name) setSystemName(settings.system_name);
    if (settings?.system_description !== undefined) setSystemDescription(settings.system_description || "");
    if (settings?.system_avatar_url !== undefined) setSystemAvatarUrl(settings.system_avatar_url || "");
  }, [settings]);

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

  const [saved, setSaved] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);

  const handleSaveName = async () => {
    setSaving(true);
    const data = {
      system_name: systemName,
      system_description: systemDescription,
      system_avatar_url: systemAvatarUrl || null,
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


  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Auto-open the section
    el.querySelector("button")?.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-foreground mb-1">Settings</h1>
          {/* Release tag + version chip — bumped with every changelog entry
              via src/lib/appVersion.js. Stays visible so testers can
              reference the exact build when reporting issues. */}
          <div className="flex items-center gap-1.5 mt-1 flex-shrink-0">
            {APP_RELEASE_STAGE && (
              <span className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30">
                {APP_RELEASE_STAGE}
              </span>
            )}
            <span className="text-[0.6875rem] font-mono text-muted-foreground">v{APP_VERSION}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Customize your {terms.system} and manage your account. {" "}
          <span onClick={() => window.open("https://www.notion.so/709a266d2e0f4da7a4aaa02e180ee1ad?v=e950ba087a1d42bea4ee0784dc8307b1", "_blank")}
            className="text-primary underline hover:text-primary/80 cursor-pointer">
            Template gallery →
          </span><p>
          <span onClick={() => window.open("https://github.com/penumbrias/oceans-symphony/releases", "_blank")}
                className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
        </p></p>
      </div>

      {/* Privacy & Data Notice — collapsible, top of page */}
      <details className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden group" data-tour="settings-privacy-notice">
        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 text-sm select-none">
          <span className="font-semibold text-foreground flex items-center gap-1.5">🔐 Privacy & Data Notice</span>
          <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4 space-y-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">🔒 Local Storage</p>
            <p>Oceans Symphony is private by design: <strong>by default, your data stays on this device only</strong>. Nothing is uploaded, synced, or sent to any server. Records live in this browser's IndexedDB, and the only way data leaves the device is if you explicitly export a backup — <em>or</em> if you turn on Friends mode (see below). By default, those records are stored <strong>unencrypted</strong> — anyone with access to this device, or to a device backup, could read them. For an extra layer of security, enable password encryption under <em>Storage Mode</em> below: this adds <strong>on-device encryption at rest</strong> (AES-256-GCM), where the data is encrypted with a key derived from your password and only decrypted in memory while the app is open. <strong>It is not end-to-end encrypted</strong> — the protection is between this device's storage and the running app, nothing more. <strong>If you lose your encryption password, the data cannot be recovered.</strong></p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">👥 Friends Mode (opt-in)</p>
            <p>Friends mode is the <strong>only</strong> feature that sends anything off-device, and it is <strong>off until you set it up</strong>. When enabled, the only data that leaves this device is what you explicitly choose to share with friends you've added: your system name, the display name you pick, and your current front status. The granularity of that front status is governed by your privacy level — <em>full</em> (alter names + initials + colours), <em>count only</em> (just "N fronting"), or <em>hidden</em> (nothing) — and you can override the level per friend, or hide individual {terms.alters} from specific friends. Nothing else from your local data (journals, symptoms, bulletins, locations, activities, etc.) is ever sent. Disconnecting Friends mode wipes the server-side identity and stops all transmission.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">💾 Backups</p>
            <p>Use Backup & Export under Data & Privacy to save your data as a JSON file. Backups are <strong>not encrypted</strong> regardless of your storage mode — store them somewhere safe.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">🤖 Transparency</p>
            <p>Oceans Symphony is <strong>vibe-coded</strong> — built with AI assistance — and is in <strong>active development</strong>. It is a work in progress shared in good faith; bugs are likely. We do our best but cannot guarantee it is bug-free.</p>
          </div>
          <p className="text-amber-600 dark:text-amber-400 font-medium">
            🌊 Free and open source, shared by a DID system to fill a void in the community. Contact: pesturedrawing@gmail.com.{" "}
            <span onClick={() => window.open("https://github.com/penumbrias/oceans-symphony/releases", "_blank")}
              className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
          </p>
        </div>
      </details>

      {/* Migration banner */}
      <div className="mb-4"><MigrationBanner /></div>

      {/* Quick Nav */}
      <div data-tour="settings-quick-nav" className="flex flex-wrap gap-2 mb-6 p-3 bg-muted/20 border border-border/40 rounded-xl">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border/40 hover:bg-muted/50 hover:border-primary/40 transition-colors text-xs font-medium">
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      <div data-tour="settings-content" className="space-y-3 max-w-2xl">

        {/* ── PROFILE ── */}
        <Section id="system" icon="⚙️" label="Profile" defaultOpen={true}>
          <div className="space-y-4">
            <div>
              {showAlterCount ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  {activeCount} active {activeCount !== 1 ? terms.alters : terms.alter}
                  {archivedCount > 0 && (
                    <span className="text-muted-foreground/60">· {archivedCount} archived</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAlterCount(false)}
                    className="text-xs text-muted-foreground/70 hover:text-foreground underline underline-offset-2 ml-1"
                  >
                    hide
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAlterCount(true)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Users className="w-4 h-4" />
                  View {terms.alter} count
                </button>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium">{terms.System} Picture</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shown anywhere a post or vote is attributed to the {terms.system} as a whole (no specific {terms.alter}).
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border border-border/50 bg-muted flex items-center justify-center flex-shrink-0">
                  {resolvedSysAvatar ? (
                    <img src={resolvedSysAvatar} alt={`${terms.system} avatar`} className="w-full h-full object-cover" />
                  ) : (
                    <Globe className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border/60 hover:bg-muted/40 cursor-pointer">
                    {uploadingSysAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingSysAvatar ? "Uploading…" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleSystemAvatarUpload} />
                  </label>
                  {systemAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setSystemAvatarUrl("")}
                      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                    >
                      <XIcon className="w-4 h-4" /> Remove
                    </button>
                  )}
                </div>
              </div>
              <Input
                placeholder="Or paste an image URL…"
                value={systemAvatarUrl}
                onChange={e => setSystemAvatarUrl(e.target.value)}
                className="mt-2 text-xs"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">{terms.System} Name</Label>
              <Input placeholder={`Enter your ${terms.system} name...`} value={systemName}
                onChange={e => setSystemName(e.target.value)} className="mt-2" />
            </div>
            <div>
              <Label className="text-sm font-medium">{terms.System} Description</Label>
              <Textarea placeholder={`Describe your ${terms.system}...`} value={systemDescription}
                onChange={e => setSystemDescription(e.target.value)} className="mt-2 min-h-[100px]" />
            </div>
            <Button onClick={handleSaveName} disabled={saving || saved} size="sm"
              className={saved ? "bg-green-600 hover:bg-green-600 text-white" : "bg-primary hover:bg-primary/90"}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : saved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saved ? "Saved!" : "Save"}
            </Button>
          </div>
          <TermsSettings />
        </Section>

        {/* ── APPEARANCE ── */}
        <Section id="appearance" icon="🎨" label="Appearance">
          <AdvancedAppearance />
          <div className="border-t border-border/30 pt-4">
            <UpcomingPlansSurfacesSection />
          </div>
          <NavigationSettings settings={settings} />
        </Section>

        {/* ── ACCESSIBILITY ── */}
        <Section id="accessibility" icon="♿" label="Accessibility">
          <AccessibilitySettings />
        </Section>

        {/* ── ALTERS & FIELDS ── */}
        <Section id="alters" icon="👥" label={`${terms.Alters} & Fields`}>
          <CustomFieldsManager />
          <div className="border-t border-border/30 pt-4">
            <RelationshipTypesManager />
          </div>
          <div className="border-t border-border/30 pt-4">
            <ArchivedAltersManager />
          </div>
        </Section>

        {/* ── TRACKING & ANALYTICS ── */}
        <Section id="checkin" icon="⚡" label="Tracking & Analytics">
          <QuickActionsConfig />
          <div className="border-t border-border/30 pt-4 flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Check-In Manager</p>
                <p className="text-xs text-muted-foreground">Configure quick check-in fields</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/manage-checkin")}>Open</Button>
          </div>
          <div className="border-t border-border/30 pt-4">
            <CustomEmotionsManager />
          </div>
          <div className="border-t border-border/30 pt-4">
            <CustomTriggerTypesManager />
          </div>
          <div className="border-t border-border/30 pt-4">
            <div>
              <p className="text-sm font-semibold mb-1">Analytics grouping</p>
              <p className="text-xs text-muted-foreground mb-3">
                For large {terms.systems}, analytics can aggregate data by group instead of by individual {terms.alter}.
                Groups are managed from the {terms.System} Members page.
              </p>
              <div className="flex gap-2">
                {[
                  { id: "individual", label: `By ${terms.alter}`, desc: `Show each ${terms.alter} separately` },
                  { id: "group", label: "By group", desc: `Aggregate ${terms.alters} into their groups` },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setAnalyticsGrouping(opt.id)}
                    className={`flex-1 rounded-xl border p-3 text-left transition-all ${
                      analyticsGrouping === opt.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/50 bg-card hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart2 className={`w-3.5 h-3.5 ${analyticsGrouping === opt.id ? "text-primary" : "text-muted-foreground"}`} />
                      <p className={`text-xs font-semibold ${analyticsGrouping === opt.id ? "text-primary" : "text-foreground"}`}>
                        {opt.label}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{opt.desc}</p>
                  </button>
                ))}
              </div>
              {analyticsGrouping === "group" && (
                <p className="text-xs text-muted-foreground mt-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  Group mode is active. Patterns & Insights will show data aggregated by group.
                  {terms.Alters} without a group appear under "Ungrouped."
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── REMINDERS ── */}
        <Section id="reminders" icon="🔔" label="Reminders">
          <RemindersSettings />
        </Section>

        <Section id="preview" icon="👁️" label="Preview Mode">
          <PreviewModeSection />
        </Section>

        {/* ── DATA & PRIVACY ── */}
        <Section id="data" icon="💾" label="Data & Privacy">
          <p className="text-xs text-muted-foreground">
            Privacy & Data Notice has moved to the top of this page — tap the banner above to expand it.
          </p>
          <div className="border-t border-border/30 pt-4">
            <StorageModeSettings />
          </div>
          <div className="border-t border-border/30 pt-4">
            <DataBackupRestore />
          </div>
          <div className="border-t border-border/30 pt-4">
            <SimplyPluralConnect settings={settings} onSettingsChange={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["alters"] });
            }} />
          </div>
          <div className="border-t border-border/30 pt-4">
            <PluralKitConnect settings={settings} onSettingsChange={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["alters"] });
            }} />
          </div>
        </Section>

        {/* ── DISCLAIMER ── */}
        <Section id="disclaimer" icon="⚠️" label="Disclaimer" defaultOpen={false}>
          <MedicalDisclaimer />
        </Section>

        {/* ── BUG REPORT ── */}
        <Section id="bug-report" icon="🐛" label="Report a Bug" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Found something broken? Open a bug report. Your app version, URL, and browser info are auto-attached so we can reproduce it. Reports land on the project's GitHub Issues page where they're labelled and triaged.
            </p>
            <Button onClick={() => setShowBugReport(true)} variant="outline" className="gap-2">
              <span>🐛</span> Open bug report form
            </Button>
          </div>
        </Section>

        {/* ── RECENT UPDATES ── */}
        <Section id="updates" icon="📋" label="Recent Updates" defaultOpen={false}>
          <RecentUpdates />
        </Section>

      </div>

      <BugReportModal open={showBugReport} onClose={() => setShowBugReport(false)} />
    </motion.div>
  );
}