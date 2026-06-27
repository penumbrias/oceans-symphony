import React, { useState, useEffect } from "react";
import { APP_VERSION, APP_RELEASE_STAGE } from "@/lib/appVersion";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import CustomTriggerTypesManager from "@/components/settings/CustomTriggerTypesManager";
import { useTerms } from "@/lib/useTerms";
import TermsSettings from "@/components/settings/TermsSettings";
import CustomFieldsManager from "@/components/settings/CustomFieldsManager";
import ArchivedAltersManager from "@/components/settings/ArchivedAltersManager";
import DuplicateAltersManager from "@/components/settings/DuplicateAltersManager";
import RelationshipTypesManager from "@/components/settings/RelationshipTypesManager";
import SimplyPluralConnect from "@/components/settings/SimplyPluralConnect";
import SimplyPluralFileImport from "@/components/settings/SimplyPluralFileImport";
import PluralKitConnect from "@/components/settings/PluralKitConnect";
import OpenPluralConnect from "@/components/settings/OpenPluralConnect";
import OctoconConnect from "@/components/settings/OctoconConnect";
import OpenPluralExport from "@/components/settings/OpenPluralExport";
import SimplyPluralExport from "@/components/settings/SimplyPluralExport";
import StorageModeSettings from "@/components/settings/StorageModeSettings";
import GroceryPanicTapsSettings from "@/components/settings/GroceryPanicTapsSettings";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import { runAutoBackupNow } from "@/lib/autoBackup";
// AdvancedAppearance now renders the ENTIRE Appearance section body
// (UI size, fonts, theme, presets, corner style, dashboard layout,
// navigation, upcoming-plans surfaces) so all the shared theme/font/
// preset state stays in one component.
import AdvancedAppearance from "@/components/settings/AdvancedAppearanceNew";
import RemindersSettings from "@/components/settings/RemindersSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import AccessibilitySettings from "@/components/settings/AccessibilitySettings";
import QuickActionsConfig from "@/components/settings/QuickActionsConfig";
import { Save, Loader2, ChevronDown, Check, BarChart2, Users, Upload, Download, X as XIcon, Globe, Images, IdCard, Palette, Bell, Accessibility, Activity, Database, Info, Link2, Bug } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, encodeCanvasForMime } from "@/lib/localImageStorage";
import BioEditor from "@/components/alters/BioEditor";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";
import { getInferPresenceEnabled, setInferPresenceEnabled, getInferPresenceWindowMinutes, setInferPresenceWindowMinutes } from "@/lib/inferredPresence";
import RecentUpdates from "@/components/settings/RecentUpdates";
import { SubSection, IconButton, iconBtnClass } from "@/components/settings/SettingsUI";
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

function Section({ id, icon: Icon, label, defaultOpen = false, headerRight = null, children }) {
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
      {/* Header row. The label and chevron toggle; `headerRight` (e.g. the
          view-count control) is a sibling so it stays interactive without
          nesting a button inside a button. */}
      <div className="w-full flex items-center gap-2 px-4 py-4 bg-muted/20 hover:bg-muted/30 transition-colors">
        <button type="button" onClick={handleToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          {Icon && <Icon className="w-[1.125rem] h-[1.125rem] text-muted-foreground flex-shrink-0" />}
          <span className="font-semibold text-sm truncate">{label}</span>
        </button>
        {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
        <button type="button" onClick={handleToggle} aria-label={open ? "Collapse" : "Expand"} className="flex-shrink-0 text-muted-foreground">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="px-4 py-4 space-y-6 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}

// Brand marks for the community links. lucide-react dropped brand icons, so
// these inline SVGs keep the GitHub / Discord glyphs faithful and dependency-
// free. They inherit the current text colour via fill="currentColor".
function GithubIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
function DiscordIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const { mode: analyticsGrouping, setMode: setAnalyticsGrouping } = useAnalyticsGrouping();
  const [inferPresence, setInferPresence] = useState(getInferPresenceEnabled);
  const [inferWindow, setInferWindow] = useState(getInferPresenceWindowMinutes);
  const [backingUp, setBackingUp] = useState(false);

  // One-tap "Back up now" in the header — runs the same full-DB export the
  // auto-backup uses (saves to the device's Downloads on native, share /
  // download on web) and toasts the result. A quick safety net without
  // scrolling all the way to Data & Privacy.
  const handleBackupNow = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try { await runAutoBackupNow(); }
    catch (e) { toast.error(e?.message || "Backup failed"); }
    finally { setBackingUp(false); }
  };

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

  // Unified "Import from file" dispatch: DataBackupRestore detects a non-Symphony
  // export and hands the file up here, which routes it to the right app's importer.
  const [externalImport, setExternalImport] = useState(null); // { file, type }

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={backingUp}
                  title="Back up or import your data" className="h-7 gap-1.5 text-xs">
                  {backingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  Backup
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={handleBackupNow} className="gap-2 cursor-pointer">
                  <Download className="w-4 h-4" /> Export a backup now
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => scrollTo("data")} className="gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" /> Import a backup…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {APP_RELEASE_STAGE && (
              <span className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30">
                {APP_RELEASE_STAGE}
              </span>
            )}
            <span className="text-[0.6875rem] font-mono text-muted-foreground">v{APP_VERSION}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Customize your {terms.system} and manage your account.{" "}
          <span onClick={() => openExternalUrl("https://www.notion.so/709a266d2e0f4da7a4aaa02e180ee1ad?v=e950ba087a1d42bea4ee0784dc8307b1")}
            className="text-primary underline hover:text-primary/80 cursor-pointer">
            Template gallery →
          </span>
        </p>
        <div className="flex items-center gap-3 mt-2">
          <button type="button" onClick={() => openExternalUrl("https://penumbrialecosystem.neocities.org/os")}
            aria-label="Official website" title="Official website"
            className="text-primary/80 hover:text-primary transition-colors">
            <Globe className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => openExternalUrl("https://github.com/penumbrias/oceans-symphony/releases")}
            aria-label="Latest releases on GitHub" title="Latest releases on GitHub"
            className="text-primary/80 hover:text-primary transition-colors">
            <GithubIcon className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => openExternalUrl("https://discord.gg/S5rFXjrfWG")}
            aria-label="Discord support server" title="Discord support server"
            className="text-primary/80 hover:text-primary transition-colors">
            <DiscordIcon className="w-5 h-5" />
          </button>
        </div>
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
      <div data-tour="settings-content" className="space-y-3 os-page-shell">

        {/* ── PROFILE ── */}
        <Section id="system" icon={IdCard} label="Profile" headerRight={
          showAlterCount ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              {activeCount}{archivedCount > 0 ? ` · ${archivedCount}` : ""}
              <button type="button" onClick={() => setShowAlterCount(false)}
                className="text-[0.625rem] text-muted-foreground/70 hover:text-foreground underline underline-offset-2">hide</button>
            </span>
          ) : (
            <button type="button" onClick={() => setShowAlterCount(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Users className="w-3.5 h-3.5" /> View {terms.alter} count
            </button>
          )
        }>
          <div className="space-y-4">
            {/* Terminology — preset dropdown sits at the top of the profile. */}
            <SubSection title="Terminology" defaultOpen={false}>
              <TermsSettings embedded />
            </SubSection>
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
                  <IconButton icon={Images} title="Choose from image assets" onClick={() => setSysAvatarAssets(true)} />
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
                  <IconButton icon={Images} title="Choose from image assets" onClick={() => setSysBannerAssets(true)} />
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
                  <SubSection title="Banner display" defaultOpen={false}>
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
                  </SubSection>
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
        </Section>

        {/* ── APPEARANCE ──
            The entire Appearance body lives in AdvancedAppearance so
            the theme / font / preset state (shared via useTheme + local
            useState) stays in one component. It renders the full
            structured layout: UI size, Advanced, Fonts, Theme, Corner
            style, Presets, Dashboard layout, Navigation, Upcoming plans. */}
        <Section id="appearance" icon={Palette} label="Appearance">
          <AdvancedAppearance />
        </Section>

        {/* ── NOTIFICATIONS & REMINDERS ── */}
        <Section id="notifications" icon={Bell} label="Notifications & reminders">
          <SubSection title="In-app notifications" defaultOpen={false}><NotificationSettings /></SubSection>
          <SubSection title="Reminders" defaultOpen={false}><RemindersSettings /></SubSection>
        </Section>

        {/* ── ACCESSIBILITY ── */}
        <Section id="accessibility" icon={Accessibility} label="Accessibility">
          <AccessibilitySettings />
        </Section>

        {/* ── ALTER SETUP ── */}
        <Section id="alters" icon={Users} label={`${terms.Alter} setup`}>
          <SubSection title="Custom fields" defaultOpen={false}><CustomFieldsManager embedded /></SubSection>
          <SubSection title="Relationship types" defaultOpen={false}><RelationshipTypesManager /></SubSection>
          <SubSection title={`Archived ${terms.alters}`} defaultOpen={false}><ArchivedAltersManager /></SubSection>
          <SubSection title="Find & remove duplicates" defaultOpen={false}><DuplicateAltersManager /></SubSection>
        </Section>

        {/* ── TRACKING SETUP ── */}
        <Section id="checkin" icon={Activity} label="Tracking setup">
          <SubSection title="Quick actions" defaultOpen={false}><QuickActionsConfig /></SubSection>
          <SubSection title="Check-in manager" defaultOpen={false}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Configure the fields shown in the quick check-in.</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/manage-checkin")}>Open</Button>
            </div>
          </SubSection>
          <SubSection title="Custom emotions" defaultOpen={false}><CustomEmotionsManager /></SubSection>
          <SubSection title="Custom triggers" defaultOpen={false}><CustomTriggerTypesManager /></SubSection>
          <SubSection title="Analytics & attribution" defaultOpen={false}>
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

            <div className="mt-4 pt-4 border-t border-border/30">
              <label className="flex items-start gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={inferPresence}
                  onClick={() => { const next = !inferPresence; setInferPresence(next); setInferPresenceEnabled(next); }}
                  className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${inferPresence ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${inferPresence ? "left-[1.125rem]" : "left-0.5"}`} />
                </button>
                <span className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Infer presence from authored content</p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                    When an {terms.alter} posts a chat message, bulletin, or journal, treat that as them being present for a window around then — so activities, emotions and symptoms logged nearby get attributed to them even without {terms.fronting} tracking. Turning this off makes analytics use only tracked {terms.fronting} sessions.
                  </p>
                </span>
              </label>
              {inferPresence && (
                <div className="mt-3 pl-[3.25rem]">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Presence window — how long around each post counts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { min: 30, label: "30 min" },
                      { min: 60, label: "1 hour" },
                      { min: 120, label: "2 hours" },
                      { min: 180, label: "3 hours" },
                      { min: 240, label: "4 hours" },
                      { min: 360, label: "6 hours" },
                    ].map((opt) => {
                      const active = inferWindow === opt.min;
                      return (
                        <button
                          key={opt.min}
                          type="button"
                          onClick={() => { setInferWindow(opt.min); setInferPresenceWindowMinutes(opt.min); }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground/80 mt-1.5 leading-snug">
                    The window is centered on each post (±{inferWindow >= 60 ? `${(inferWindow / 2 / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} hour${inferWindow / 2 / 60 === 1 ? "" : "s"}` : `${inferWindow / 2} min`}). Changing it re-shapes analytics immediately.
                  </p>
                </div>
              )}
            </div>
          </SubSection>
        </Section>

        {/* ── DATA & PRIVACY ── */}
        <Section id="data" icon={Database} label="Data & privacy">
          <p className="text-xs text-muted-foreground">
            Privacy & Data Notice has moved to the top of this page — tap the banner above to expand it.
          </p>
          {/* Condensed Data & Privacy (Kane's wireframe): four boxes — Export,
              Import, Storage & encryption, Privacy cover. Everything for getting
              data OUT is grouped under Export; everything for bringing it IN is
              under Import. No features removed — just gathered where they belong. */}

          {/* ── IMPORT ──────────────────────────────────────────────────────
              The file/text restore (Add new / Replace all + "Import from file",
              which reads Symphony .json/.txt, Simply Plural, Octocon, PluralSpace
              .json and OpenPlural .zip) up top, then each live-sync token / extra
              importer nested. Import sits above Export so bringing data IN is the
              first thing users see. */}
          <SubSection title="Import" defaultOpen={false}>
            <DataBackupRestore
              section="import"
              onExternalFile={(file, type) => setExternalImport(type ? { file, type } : null)}
            />

            {/* Unified file-import dispatcher. "Import from file" above
                auto-detects the export type; for a non-Symphony export it
                hands the file up here, which routes it to the matching app's
                importer (or asks when a members-style file is ambiguous). */}
            {externalImport?.type === "ask" && (
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <p className="text-sm text-foreground">
                  We can't tell whether this file is from Simply Plural or OpenPlural. Which app is it from?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExternalImport((p) => ({ ...p, type: "simplyplural" }))}
                  >
                    Simply Plural
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExternalImport((p) => ({ ...p, type: "openplural" }))}
                  >
                    OpenPlural / PluralSpace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExternalImport(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {externalImport && externalImport.type !== "ask" && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Detected {externalImport.file.name} — importing as{" "}
                    {externalImport.type === "simplyplural"
                      ? "Simply Plural"
                      : externalImport.type === "octocon"
                      ? "Octocon"
                      : "OpenPlural / PluralSpace"}
                    .
                  </span>
                  <button
                    type="button"
                    className="underline shrink-0 hover:text-foreground"
                    onClick={() => setExternalImport(null)}
                  >
                    Use a different file
                  </button>
                </div>
                {externalImport.type === "simplyplural" && (
                  <SimplyPluralFileImport
                    presetFile={externalImport.file}
                    settings={settings}
                    onSettingsChange={() => {
                      refetch();
                      queryClient.invalidateQueries({ queryKey: ["alters"] });
                    }}
                  />
                )}
                {externalImport.type === "octocon" && (
                  <OctoconConnect
                    presetFile={externalImport.file}
                    settings={settings}
                    onSettingsChange={() => {
                      refetch();
                      queryClient.invalidateQueries({ queryKey: ["alters"] });
                    }}
                  />
                )}
                {externalImport.type === "openplural" && (
                  <OpenPluralConnect
                    presetFile={externalImport.file}
                    settings={settings}
                    onSettingsChange={() => {
                      refetch();
                      queryClient.invalidateQueries({ queryKey: ["alters"] });
                    }}
                  />
                )}
              </div>
            )}

            <SubSection title="PluralKit (live token)" defaultOpen={false}>
              <PluralKitConnect settings={settings} onSettingsChange={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ["alters"] });
              }} />
            </SubSection>
            <SubSection title="Simply Plural (live token)" defaultOpen={false}>
              <SimplyPluralConnect settings={settings} onSettingsChange={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ["alters"] });
              }} />
            </SubSection>
          </SubSection>

          {/* ── EXPORT ──────────────────────────────────────────────────────
              The main backup already carries the Advanced "choose what to
              export" picker, the Plain .json / Compact .txt format toggle, the
              Save-to-device / Share buttons, AND the copy/paste fallback. The
              cross-app export formats are inline format chips and automatic
              backups nest beneath it. */}
          <SubSection title="Export" defaultOpen={false}>
            {/* OpenPlural + Simply Plural are inline FORMAT chips alongside
                Plain .json / Compact (.txt); selecting one shows that
                exporter inline. (Portable OpenPlural carries avatars and
                imports into PluralSpace; Simply Plural is JSON only.) */}
            <DataBackupRestore
              section="export"
              exportExtras={[
                { key: "openplural", label: "OpenPlural", node: <OpenPluralExport /> },
                { key: "simplyplural", label: "Simply Plural", node: <SimplyPluralExport /> },
              ]}
            />
            <SubSection title="Automatic backups" defaultOpen={false}><AutoBackupSettings /></SubSection>
          </SubSection>

          {/* ── STORAGE & ENCRYPTION ── */}
          <SubSection title="Storage & encryption" defaultOpen={false}>
            <StorageModeSettings />
            <DataBackupRestore section="storage" />
          </SubSection>

          {/* ── PRIVACY COVER ── */}
          <SubSection title="Privacy cover" defaultOpen={false}><GroceryPanicTapsSettings /></SubSection>
        </Section>

        {/* ── ABOUT & HELP ──
            Consolidates the four trailing sub-pages (medical
            disclaimer, recent updates, bug report, dev preview mode)
            into one collapsed group so the TOC isn't dominated by
            rarely-touched links. */}
        <Section id="about" icon={Info} label="About & help">
          <SubSection title="Found a bug?" defaultOpen={false}>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              Open a bug report. Your app version, URL, and browser info are auto-attached so we can reproduce it. Reports land on the project's GitHub Issues page where they're labelled and triaged.
            </p>
            <Button onClick={() => setShowBugReport(true)} variant="outline" className="gap-2">
              <Bug className="w-4 h-4" /> Open bug report form
            </Button>
          </SubSection>
          <SubSection title="Tour & onboarding" defaultOpen={false}><PageTutorialsControls /></SubSection>
          <SubSection title="Medical disclaimer" defaultOpen={false}><MedicalDisclaimer /></SubSection>
          <SubSection title="Preview mode (dev)" defaultOpen={false}><PreviewModeSection /></SubSection>
          <SubSection title="What's new" defaultOpen={false}><RecentUpdates /></SubSection>
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