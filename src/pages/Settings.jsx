import React, { useState, useRef, useEffect } from "react";
import { APP_VERSION, APP_RELEASE_STAGE } from "@/lib/appVersion";
import { openExternalUrl } from "@/lib/openExternalUrl";
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
import GroceryPanicTapsSettings from "@/components/settings/GroceryPanicTapsSettings";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import AdvancedAppearance from "@/components/settings/AdvancedAppearanceNew";
import AlterLabelSettings from "@/components/settings/AlterLabelSettings";
import CornerStyleSettings from "@/components/settings/CornerStyleSettings";
import UpcomingPlansSurfacesSection from "@/components/settings/UpcomingPlansSurfacesSection";
import NavigationSettings from "@/components/settings/NavigationSettings";
import DashboardLayoutSettings from "@/components/settings/DashboardLayoutSettings";
import RemindersSettings from "@/components/settings/RemindersSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import AccessibilitySettings from "@/components/settings/AccessibilitySettings";
import QuickActionsConfig from "@/components/settings/QuickActionsConfig";
import { Save, Loader2, ChevronDown, Zap, Check, BarChart2, Users, Upload, X as XIcon, Globe } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, encodeCanvasForMime } from "@/lib/localImageStorage";
import BioEditor from "@/components/alters/BioEditor";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";
import RecentUpdates from "@/components/settings/RecentUpdates";
import PreviewModeSection from "@/components/settings/PreviewModeSection";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import BugReportModal from "@/components/settings/BugReportModal";
import { Switch } from "@/components/ui/switch";
import {
  arePageTutorialsEnabled,
  setPageTutorialsEnabled,
  clearAllSeen as clearAllPageTutorialsSeen,
  subscribePageTutorials,
} from "@/lib/pageTutorials";


// React context lets the parent <Settings> drive single-accordion
// behaviour: only one Section open at a time. Drops the perceived
// scroll-length of the page from "every section's contents stacked"
// to "just one section's contents".
const SectionAccordionCtx = React.createContext(null);

function Section({ id, icon, label, defaultOpen = false, children }) {
  const ctx = React.useContext(SectionAccordionCtx);
  const isOpen = ctx
    ? ctx.openId === id
    : defaultOpen;
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = ctx ? isOpen : localOpen;

  // Stash the header's viewport-relative top BEFORE toggling so we
  // can re-anchor to the same Y position after the previously-open
  // section's body collapses. Without this, opening section B
  // (which lives below A) yanks the page UPWARD by the height of
  // A's just-collapsed contents — the user ends up staring at a
  // random section further down instead of at B.
  const handleToggle = React.useCallback(() => {
    const headerEl = document.getElementById(id)?.querySelector("button");
    const beforeTop = headerEl?.getBoundingClientRect().top ?? null;
    if (ctx) ctx.toggle(id);
    else setLocalOpen(o => !o);
    if (beforeTop == null) return;
    // Layout reflows synchronously after state updates flush.
    // requestAnimationFrame waits until React has painted, then we
    // measure the new top and compensate.
    requestAnimationFrame(() => {
      const after = document.getElementById(id)?.querySelector("button");
      if (!after) return;
      const afterTop = after.getBoundingClientRect().top;
      const delta = afterTop - beforeTop;
      if (Math.abs(delta) > 1) {
        // App's actual scrolling container is the <main> element
        // (the document body is `overflow: hidden`). Walk up the
        // tree until we find an element whose computed style is
        // scrollable — that's the one whose scrollTop matters.
        const findScroller = (el) => {
          let cur = el;
          while (cur && cur !== document.body) {
            const cs = window.getComputedStyle(cur);
            const oy = cs.overflowY;
            if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
            cur = cur.parentElement;
          }
          return document.scrollingElement || document.documentElement;
        };
        const scroller = findScroller(after);
        scroller.scrollTop += delta;
      }
    });
  }, [ctx, id]);

  return (
    <div id={id} data-tour={`settings-${id}`} className="border border-border/50 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
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

  // Top-of-page TOC. Order follows the "commonly-tweaked first" rule —
  // Profile is anchored at the top because the user said so, then the
  // surfaces people change most (look & feel, notifications, accessibility)
  // come before the heavier customisation pages (alter setup, tracking
  // setup) and the rarely-touched trailing stuff (data & privacy, about).
  const SECTIONS = [
    { id: "system", label: "Profile", icon: "⚙️" },
    { id: "appearance", label: "Appearance", icon: "🎨" },
    { id: "notifications", label: "Notifications & reminders", icon: "🔔" },
    { id: "accessibility", label: "Accessibility", icon: "♿" },
    { id: "alters", label: `${terms.Alter} setup`, icon: "👥" },
    { id: "checkin", label: "Tracking setup", icon: "⚡" },
    { id: "data", label: "Data & privacy", icon: "💾" },
    { id: "about", label: "About & help", icon: "ℹ️" },
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
  const [systemAvatarUrl, setSystemAvatarUrl] = useState("");
  const [uploadingSysAvatar, setUploadingSysAvatar] = useState(false);
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
  const [showBugReport, setShowBugReport] = useState(false);

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
          <span onClick={() => openExternalUrl("https://www.notion.so/709a266d2e0f4da7a4aaa02e180ee1ad?v=e950ba087a1d42bea4ee0784dc8307b1")}
            className="text-primary underline hover:text-primary/80 cursor-pointer">
            Template gallery →
          </span><p>
          <span onClick={() => openExternalUrl("https://github.com/penumbrias/oceans-symphony/releases")}
                className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
          {" · "}
          <span onClick={() => openExternalUrl("https://discord.gg/S5rFXjrfWG")}
                className="text-primary underline cursor-pointer">Discord support server →</span>
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
            <span onClick={() => openExternalUrl("https://github.com/penumbrias/oceans-symphony/releases")}
              className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
          </p>
        </div>
      </details>

      {/* Quick Nav */}
      <div data-tour="settings-quick-nav" className="flex flex-wrap gap-2 mb-6 p-3 bg-muted/20 border border-border/40 rounded-xl">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border/40 hover:bg-muted/50 hover:border-primary/40 transition-colors text-xs font-medium">
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      <SectionsAccordion>
      <div data-tour="settings-content" className="space-y-3 max-w-2xl">

        {/* ── PROFILE ── */}
        <Section id="system" icon="⚙️" label="Profile">
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
              <Label className="text-sm font-medium">{terms.System} Banner</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                A wide image shown edge-to-edge behind the top of your pages.
              </p>
              <div className="mt-2 rounded-xl overflow-hidden border border-border/50 bg-muted flex items-center justify-center" style={{ height: 96 }}>
                {resolvedSysBanner ? (
                  <img src={resolvedSysBanner} alt={`${terms.system} banner`} className="w-full h-full object-cover" style={{ objectPosition: `50% ${systemBannerPosition}%` }} />
                ) : (
                  <span className="text-xs text-muted-foreground">No banner yet</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border/60 hover:bg-muted/40 cursor-pointer">
                  {uploadingSysBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploadingSysBanner ? "Uploading…" : "Upload"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleSystemBannerUpload} />
                </label>
                {systemBannerUrl && (
                  <button
                    type="button"
                    onClick={() => setSystemBannerUrl("")}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                  >
                    <XIcon className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
              <Input
                placeholder="Or paste an image URL…"
                value={systemBannerUrl}
                onChange={e => setSystemBannerUrl(e.target.value)}
                className="mt-2 text-xs"
              />
              {systemBannerUrl && (
                <div className="mt-3 space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Banner height</Label>
                      <span className="text-xs text-muted-foreground">{systemBannerHeight}px</span>
                    </div>
                    <input type="range" min={80} max={360} step={10} value={systemBannerHeight}
                      onChange={e => setSystemBannerHeight(Number(e.target.value))}
                      className="w-full mt-1 accent-primary" />
                    <p className="text-[0.625rem] text-muted-foreground">How far down the banner extends.</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Image position</Label>
                      <span className="text-xs text-muted-foreground">
                        {systemBannerPosition <= 33 ? "Top" : systemBannerPosition >= 67 ? "Bottom" : "Center"}
                      </span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={systemBannerPosition}
                      onChange={e => setSystemBannerPosition(Number(e.target.value))}
                      className="w-full mt-1 accent-primary" />
                    <p className="text-[0.625rem] text-muted-foreground">Which part of the image shows (top ↔ bottom).</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Show banner on</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {[
                        { id: "home", label: "Home pages" },
                        { id: "all", label: "All pages" },
                        { id: "off", label: "Off" },
                      ].map((opt) => (
                        <button key={opt.id} type="button" onClick={() => setSystemBannerScope(opt.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            systemBannerScope === opt.id
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "border-border/50 text-muted-foreground hover:text-foreground"
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[0.625rem] text-muted-foreground mt-1">
                      "Home pages" = your dashboard and {terms.alters} directory.
                    </p>
                  </div>
                </div>
              )}
            </div>
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
          <TermsSettings />
        </Section>

        {/* ── APPEARANCE ── */}
        <Section id="appearance" icon="🎨" label="Appearance">
          <AdvancedAppearance />
          <div className="border-t border-border/30 pt-4">
            <CornerStyleSettings />
          </div>
          <div className="border-t border-border/30 pt-4">
            <AlterLabelSettings />
          </div>
          <DashboardLayoutSettings />
          <div className="border-t border-border/30 pt-4">
            <UpcomingPlansSurfacesSection />
          </div>
          <NavigationSettings settings={settings} />
        </Section>

        {/* ── NOTIFICATIONS & REMINDERS ── */}
        <Section id="notifications" icon="🔔" label="Notifications & reminders">
          <div className="space-y-6">
            <NotificationSettings />
            <div className="pt-4 border-t border-border/40">
              <RemindersSettings />
            </div>
          </div>
        </Section>

        {/* ── ACCESSIBILITY ── */}
        <Section id="accessibility" icon="♿" label="Accessibility">
          <AccessibilitySettings />
        </Section>

        {/* ── ALTER SETUP ── */}
        <Section id="alters" icon="👥" label={`${terms.Alter} setup`}>
          <CustomFieldsManager />
          <div className="border-t border-border/30 pt-4">
            <RelationshipTypesManager />
          </div>
          <div className="border-t border-border/30 pt-4">
            <ArchivedAltersManager />
          </div>
        </Section>

        {/* ── TRACKING SETUP ── */}
        <Section id="checkin" icon="⚡" label="Tracking setup">
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

        {/* ── DATA & PRIVACY ── */}
        <Section id="data" icon="💾" label="Data & privacy">
          <p className="text-xs text-muted-foreground">
            Privacy & Data Notice has moved to the top of this page — tap the banner above to expand it.
          </p>
          {/* Backup & Export first — it's the action people open this
              section to do most often. Auto-backup follows it so both
              manual and scheduled backups live together. */}
          <div className="border-t border-border/30 pt-4">
            <DataBackupRestore />
          </div>
          <div className="border-t border-border/30 pt-4">
            <AutoBackupSettings />
          </div>
          <div className="border-t border-border/30 pt-4">
            <StorageModeSettings />
          </div>
          <div className="border-t border-border/30 pt-4">
            <GroceryPanicTapsSettings />
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

        {/* ── ABOUT & HELP ──
            Consolidates the four trailing sub-pages (medical
            disclaimer, recent updates, bug report, dev preview mode)
            into one collapsed group so the TOC isn't dominated by
            rarely-touched links. */}
        <Section id="about" icon="ℹ️" label="About & help">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Found a bug?
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                Open a bug report. Your app version, URL, and browser info are auto-attached so we can reproduce it. Reports land on the project's GitHub Issues page where they're labelled and triaged.
              </p>
              <Button onClick={() => setShowBugReport(true)} variant="outline" className="gap-2">
                <span>🐛</span> Open bug report form
              </Button>
            </div>

            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Tour & onboarding
              </p>
              <PageTutorialsControls />
            </div>

            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Medical disclaimer
              </p>
              <MedicalDisclaimer />
            </div>

            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Preview mode <span className="text-[0.625rem] font-normal text-muted-foreground/70 normal-case ml-1">(dev)</span>
              </p>
              <PreviewModeSection />
            </div>

            <div className="pt-4 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                What's new
              </p>
              <RecentUpdates />
            </div>
          </div>
        </Section>

      </div>
      </SectionsAccordion>

      <BugReportModal open={showBugReport} onClose={() => setShowBugReport(false)} />
    </motion.div>
  );
}

// Per-page tutorial banner controls — toggle the banner globally and
// reset the per-route seen-set so prompts come back on every page.
// Subscribes to pageTutorials state so a reset from elsewhere keeps
// the toggle UI in sync.
function PageTutorialsControls() {
  const [enabled, setEnabled] = useState(() => arePageTutorialsEnabled());
  useEffect(() => subscribePageTutorials(() => setEnabled(arePageTutorialsEnabled())), []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        First-visit page tutorials prompt you on each page so you can explore one at a time instead of taking the whole guided tour at once.
      </p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Show page-tutorial prompts</p>
          <p className="text-xs text-muted-foreground">"New to this page? Show me around" banner on first visit.</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(next) => {
            setPageTutorialsEnabled(next);
            setEnabled(next);
          }}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          clearAllPageTutorialsSeen();
          toast.success("Page tutorials reset — banners will reappear on every page.");
        }}
      >
        Replay all page tutorials
      </Button>
    </div>
  );
}

// Accordion provider — wraps every <Section> so opening one auto-
// closes the others. Honours URL hash on first render so TOC jumps
// and external deep-links still drop the user inside an open section.
function SectionsAccordion({ children }) {
  const [openId, setOpenId] = useState(() => {
    try {
      const h = (window.location.hash || "").replace(/^#/, "");
      return h || null;
    } catch { return null; }
  });
  const toggle = React.useCallback((id) => {
    setOpenId(prev => prev === id ? null : id);
  }, []);
  const value = React.useMemo(() => ({ openId, toggle }), [openId, toggle]);
  return (
    <SectionAccordionCtx.Provider value={value}>
      {children}
    </SectionAccordionCtx.Provider>
  );
}