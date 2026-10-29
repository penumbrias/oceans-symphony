// The Settings catalogue (v0.320.0): every settings page, in the group it
// belongs to, with the words people search for. Settings.jsx renders the
// flat home list from it and opens one page at a time (`/settings#<id>`).
//
// A page is `{ id, label, hint, icon, keywords, render }`; a row that opens
// something else instead (a sheet, a modal, another route) has `action`.
// `tour` is the data-tour anchor on the row. `when` hides a page on the
// platforms it doesn't apply to. Legacy hashes (the old accordion section
// ids and deep links) are mapped in LEGACY_HASHES so old links still land.
import React from "react";
import {
  IdCard, MessageSquareText, Boxes, Languages, Clock, Tag, LayoutGrid, FlaskConical, Palette, Accessibility,
  ListPlus, GitBranch, LayoutTemplate, Music, ArrowUpDown, Archive, Contact, Copy, Heart, Smile, Zap, Layers,
  Sparkles, BarChart2, BellRing, Bell, PanelTop, MessageSquare, Wrench, Server, ShieldCheck, Upload, Download,
  RefreshCw, Eraser, Lock, Table2, LifeBuoy, EyeOff, Megaphone, Map, Eye, Bug, Stethoscope,
} from "lucide-react";
import { isNative } from "@/lib/platform";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import ProfileSettings from "@/components/settings/ProfileSettings";
import TermsSettings from "@/components/settings/TermsSettings";
import SystemSwitcherPanel from "@/components/systems/SystemSwitcherPanel";
import { V2LanguageSection } from "@/components/settings/V2DisplaySettings";
import TimezoneSettings from "@/components/settings/TimezoneSettings";
import AlterLabelSettings from "@/components/settings/AlterLabelSettings";
import { NewUiToggle, HomeOpensOnRow } from "@/components/settings/DashboardLayoutSettings";
import ExperimentalFeaturesSettings from "@/components/settings/ExperimentalFeaturesSettings";
import { openDisplayOptions } from "@/components/settings/AppearanceSection";
import AccessibilitySettings from "@/components/settings/AccessibilitySettings";
import CustomFieldsManager from "@/components/settings/CustomFieldsManager";
import RelationshipTypesManager from "@/components/settings/RelationshipTypesManager";
import ProfileLayoutSettings from "@/components/settings/ProfileLayoutSettings";
import ProfileSongsSettings from "@/components/settings/ProfileSongsSettings";
import AlterOrderSettings from "@/components/settings/AlterOrderSettings";
import ArchivedAltersManager from "@/components/settings/ArchivedAltersManager";
import ArchivedContactsManager from "@/components/settings/ArchivedContactsManager";
import DuplicateAltersManager from "@/components/settings/DuplicateAltersManager";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import CustomTriggerTypesManager from "@/components/settings/CustomTriggerTypesManager";
import FrontLevelsSettings from "@/components/settings/FrontLevelsSettings";
import QuickActionsConfig from "@/components/settings/QuickActionsConfig";
import AnalyticsAttributionSettings from "@/components/settings/AnalyticsAttributionSettings";
import NotificationStatusCard from "@/components/shared/NotificationStatusCard";
import RemindersSettings from "@/components/settings/RemindersSettings";
import RelayServerSettings from "@/components/settings/RelayServerSettings";
import { PopupMessagesSection, PersistentNotificationsSection, ServerDeliverySection, NotificationTests } from "@/components/settings/NotificationSettings";
import PrivacyNotice from "@/components/settings/PrivacyNotice";
import ImportDataSection from "@/components/settings/ImportDataSection";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import OpenPluralExport from "@/components/settings/OpenPluralExport";
import DeviceSyncSettings from "@/components/settings/DeviceSyncSettings";
import ChatCleanupSettings from "@/components/settings/ChatCleanupSettings";
import StorageModeSettings from "@/components/settings/StorageModeSettings";
import DataInspector from "@/components/settings/DataInspector";
import GroceryPanicTapsSettings from "@/components/settings/GroceryPanicTapsSettings";
import RecentUpdates from "@/components/settings/RecentUpdates";
import PreviewModeSection from "@/components/settings/PreviewModeSection";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import { Group } from "@/components/shared/SettingRows";

// Cross-app export FORMAT chips (alongside Plain .json / Compact), shared by
// the Export page and the header's Backup → Export popup so they match.
export const EXPORT_FORMAT_EXTRAS = [
  { key: "openplural", label: "OpenPlural", node: <OpenPluralExport /> },
];

// Old accordion section ids and deep links → where they live now. A group
// id opens the home list scrolled to that group.
export const LEGACY_HASHES = {
  system: "profile",
  "alter-entries": "custom-fields",
  "about-updates": "whats-new",
  "recent-updates": "whats-new",
  appearance: "group:look",
  notifications: "group:notifications",
  alters: "group:alters",
  checkin: "group:tracking",
  data: "group:data",
  about: "group:about",
};

// `ctx`: { terms, navigate, settings, refetch, queryClient, openBackup(kind),
//          openRescue(), openBugReport() }
export function buildSettingsGroups(ctx) {
  const { terms: t, navigate } = ctx;
  const onChanged = () => {
    ctx.refetch?.();
    ctx.queryClient?.invalidateQueries({ queryKey: ["alters"] });
  };
  const groups = [
    {
      id: "you", label: "You", tour: "settings-you",
      pages: [
        { id: "profile", label: "Profile", hint: `${t.System} name, picture, banner and bio`, icon: IdCard, tour: "settings-system",
          keywords: `${t.system} name identity banner bio picture avatar description`, render: () => <ProfileSettings /> },
        { id: "terms", label: "Terminology", hint: `The words the app uses for your ${t.system}`, icon: MessageSquareText,
          keywords: `terms words ${t.alter} ${t.alters} ${t.fronting} ${t.switch} headmates parts collective pronouns language`,
          render: () => <TermsSettings embedded /> },
        { id: "systems", label: t.Systems, hint: `More than one ${t.system} on this device`, icon: Boxes, tour: "settings-systems",
          keywords: `multiple ${t.systems} switch between ${t.systems} add ${t.system}`, render: () => <SystemSwitcherPanel /> },
      ],
    },
    {
      id: "general", label: "General",
      pages: [
        { id: "language", label: "Language", hint: "The language the app speaks", icon: Languages,
          keywords: "language locale translation english", render: () => <V2LanguageSection /> },
        { id: "timezone", label: "Timezone", hint: "Which clock reminders and days follow", icon: Clock,
          keywords: "timezone time zone clock travel", render: () => <TimezoneSettings /> },
        { id: "alter-labels", label: `${t.Alter} labels in lists`, hint: "Name, alias or both", icon: Tag,
          keywords: `${t.alter} label name alias lists pickers dropdowns`, render: () => <AlterLabelSettings embedded /> },
        { id: "home-screen", label: "Home screen", hint: "The new home screen and which page greets you", icon: LayoutGrid,
          when: () => UI_V2_ENABLED, keywords: "new ui home screen widgets board classic home opens on dashboard",
          render: () => (<div className="space-y-2"><NewUiToggle /><HomeOpensOnRow /></div>) },
        { id: "experimental", label: "Experimental features", hint: "Things still being built", icon: FlaskConical, tour: "settings-experimental",
          keywords: "experimental beta labs features flags", render: () => <ExperimentalFeaturesSettings /> },
      ],
    },
    {
      id: "look", label: "Look", tour: "settings-appearance",
      pages: [
        { id: "display", label: "Display options", hint: "Fonts and text size, shape, bars, colours, themes and presets", icon: Palette, tour: "settings-display-options",
          keywords: "appearance theme colours colors fonts font size text size wallpaper background presets dark light corners bars navigation top bar bottom bar sidebar wave icons",
          action: () => openDisplayOptions() },
        { id: "accessibility", label: "Accessibility", hint: "Low-vision layout, reduce motion, high contrast", icon: Accessibility, tour: "settings-accessibility",
          keywords: "accessibility low vision contrast motion animations screen reader tap targets text size bar height grounding bubble",
          render: () => <AccessibilitySettings /> },
      ],
    },
    {
      id: "alters", label: t.Alters, tour: "settings-alters",
      pages: [
        { id: "custom-fields", label: "Custom fields", hint: `Fields every ${t.alter} can fill in`, icon: ListPlus,
          keywords: `custom fields entries schema ${t.alter} info text number yes no list date`, render: () => <CustomFieldsManager embedded /> },
        { id: "relationship-types", label: "Relationship types", hint: "The catalogue of relationships", icon: GitBranch,
          keywords: "relationship types lineage inverse catalogue", render: () => <RelationshipTypesManager /> },
        { id: "profile-layouts", label: "Profile layouts", hint: "Default layouts per profile type", icon: LayoutTemplate,
          keywords: "profile layouts default board pages widgets new profile old profile", render: () => <ProfileLayoutSettings /> },
        { id: "profile-songs", label: "Profile songs", hint: "Music on profiles", icon: Music,
          keywords: "profile songs music audio theme song", render: () => <ProfileSongsSettings /> },
        { id: "alter-order", label: `Order your ${t.alters}`, hint: "How the directory sorts", icon: ArrowUpDown,
          keywords: `order sort arrange ${t.alters} directory`, render: () => <AlterOrderSettings /> },
        { id: "archived-alters", label: `Archived ${t.alters}`, hint: "Bring one back", icon: Archive,
          keywords: `archived ${t.alters} restore unarchive dormant`, render: () => <ArchivedAltersManager /> },
        { id: "archived-contacts", label: "Archived contacts", hint: "Bring one back", icon: Contact,
          keywords: "archived contacts restore unarchive", render: () => <ArchivedContactsManager /> },
        { id: "duplicates", label: "Find & remove duplicates", hint: `${t.Alters} that were imported twice`, icon: Copy,
          keywords: `duplicates merge imported twice ${t.alters}`, render: () => <DuplicateAltersManager /> },
      ],
    },
    {
      id: "tracking", label: "Tracking", tour: "settings-checkin",
      pages: [
        { id: "checkin-manager", label: "Check-in manager", hint: "The fields in the quick check-in", icon: Heart,
          keywords: "check-in checkin fields symptoms diary card templates quick check in manage", action: () => navigate("/manage-checkin") },
        { id: "emotions", label: "Custom emotions", hint: "Your own entries on the emotion wheel", icon: Smile,
          keywords: "custom emotions feelings wheel", render: () => <CustomEmotionsManager /> },
        { id: "triggers", label: "Custom triggers", hint: `${t.Switch} trigger categories`, icon: Zap,
          keywords: `custom triggers ${t.switch} categories`, render: () => <CustomTriggerTypesManager /> },
        { id: "front-levels", label: `${t.Fronting} levels`, hint: "Levels and what they mean", icon: Layers,
          keywords: `${t.fronting} levels co-front co-con ${t.front}`, render: () => <FrontLevelsSettings /> },
        { id: "shortcuts", label: "Shortcuts", hint: "The buttons on the hold-menu and quick actions", icon: Sparkles, tour: "settings-quick-actions",
          keywords: "shortcuts quick actions hold menu buttons took meds", render: () => <QuickActionsConfig /> },
        { id: "analytics", label: "Analytics & attribution", hint: "Grouping, inferred presence, insight spotlight", icon: BarChart2,
          keywords: `analytics grouping group attribution presence infer spotlight insight patterns ${t.alter}`, render: () => <AnalyticsAttributionSettings /> },
      ],
    },
    {
      id: "notifications", label: "Notifications", tour: "settings-notifications",
      pages: [
        { id: "notif-status", label: "Status", hint: "What's stopping notifications right now", icon: BellRing,
          keywords: "notifications status allow notifications off battery permission push",
          render: () => <NotificationStatusCard includeBattery /> },
        { id: "reminders", label: "Reminders", hint: "Timezone, quiet hours, snooze, pre-plan banner", icon: Bell,
          keywords: "reminders quiet hours snooze pause timezone plan banner alerts",
          render: () => <RemindersSettings /> },
        { id: "status-bar", label: "Status bar", hint: "The persistent notification", icon: PanelTop, when: () => isNative(),
          keywords: "status bar persistent notification ongoing", render: () => <PersistentNotificationsSection /> },
        { id: "popups", label: "Pop-up messages", hint: "In-app toasts and alerts", icon: MessageSquare,
          keywords: "pop-up popup messages toasts alerts mentions", render: () => <PopupMessagesSection /> },
        { id: "notif-advanced", label: "Advanced", hint: "Server delivery and tests", icon: Wrench,
          keywords: "push test notification server delivery diagnostics vapid",
          render: () => (<div className="space-y-4"><ServerDeliverySection /><NotificationTests /></div>) },
        { id: "relay", label: "Friends & sync server", hint: "The relay that powers Friends, reminders and push", icon: Server,
          keywords: "relay server friends self-hosted sync server url", render: () => <RelayServerSettings /> },
      ],
    },
    {
      id: "data", label: "Data & privacy", tour: "settings-data",
      pages: [
        { id: "privacy-notice", label: "Privacy & Data Notice", hint: "Where your data lives and what can leave", icon: ShieldCheck, tour: "settings-privacy-notice",
          keywords: "privacy notice data local storage encryption what leaves device transparency", render: () => <PrivacyNotice /> },
        { id: "import", label: "Import", hint: "A backup, or another app's export", icon: Upload,
          keywords: "import restore backup file simply plural pluralkit octocon pluralspace openplural ampersand",
          render: () => <ImportDataSection settings={ctx.settings} onChanged={onChanged} /> },
        { id: "export", label: "Export & automatic backups", hint: "Save your data as a file, on a schedule too", icon: Download,
          keywords: "export backup save download share copy paste zip automatic auto-backup schedule password lock",
          render: () => (
            <div className="space-y-4">
              <DataBackupRestore section="export" exportExtras={EXPORT_FORMAT_EXTRAS} />
              <Group title="Automatic backups"><AutoBackupSettings /></Group>
            </div>
          ) },
        { id: "device-sync", label: "Sync between devices", hint: "Files only, no server", icon: RefreshCw, tour: "settings-device-sync",
          keywords: "sync devices folder desktop phone snapshot", render: () => <DeviceSyncSettings /> },
        { id: "chat-cleanup", label: "Clean up deleted chat messages", hint: "Free the space they still take", icon: Eraser,
          keywords: "chat cleanup deleted messages purge", render: () => <ChatCleanupSettings /> },
        { id: "storage", label: "Storage & encryption", hint: "Password lock, offline images, delete everything", icon: Lock, tour: "settings-storage",
          keywords: "storage encryption password passphrase lock unlock delete all local data cache images offline",
          render: () => (<div className="space-y-4"><StorageModeSettings /><DataBackupRestore section="storage" /></div>) },
        { id: "data-inspector", label: "See your data", hint: "Every category, its size, export or delete one", icon: Table2, tour: "settings-data-inspector",
          keywords: "see your data inspector records counts sizes categories trash deleted items recent changes",
          render: () => <DataInspector /> },
        { id: "find-my-data", label: "Find my data", hint: "Opened to an empty app? Every copy on this device", icon: LifeBuoy,
          keywords: "find my data recovery rescue empty wrong system lost data", action: () => ctx.openRescue?.() },
        { id: "privacy-cover", label: "Privacy cover", hint: "Triple-tap to hide the app behind a grocery list", icon: EyeOff,
          keywords: "privacy cover panic hide grocery list triple tap", render: () => <GroceryPanicTapsSettings /> },
      ],
    },
    {
      id: "about", label: "About", tour: "settings-about",
      pages: [
        { id: "whats-new", label: "What's new", hint: "Recent updates", icon: Megaphone,
          keywords: "what's new changelog updates version release notes", render: () => <RecentUpdates /> },
        { id: "tour", label: "Tour & onboarding", hint: "Page tutorials and re-running setup", icon: Map,
          keywords: "tour onboarding tutorials setup guide re-run replay welcome", render: () => ctx.renderTour?.() },
        { id: "preview", label: "Preview mode", hint: "Explore an example or the wiki walkthrough", icon: Eye, tour: "settings-preview",
          keywords: "preview mode example wiki walkthrough demo", render: () => <PreviewModeSection /> },
        { id: "bug-report", label: "Found a bug?", hint: "Open a report with your build info attached", icon: Bug,
          keywords: "bug report issue feedback github", action: () => ctx.openBugReport?.() },
        { id: "disclaimer", label: "Medical disclaimer", hint: "Not a medical product", icon: Stethoscope,
          keywords: "medical disclaimer not medical advice", render: () => <MedicalDisclaimer /> },
      ],
    },
  ];
  return groups.map((g) => ({ ...g, pages: g.pages.filter((p) => !p.when || p.when()) }));
}

export function findSettingsPage(groups, id) {
  for (const g of groups) for (const p of g.pages) if (p.id === id) return { page: p, group: g };
  return null;
}

// Search: label, hint and keywords, case-insensitive, every word must hit.
export function filterSettingsGroups(groups, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  return groups
    .map((g) => ({
      ...g,
      pages: g.pages.filter((p) => {
        const hay = `${p.label} ${p.hint || ""} ${p.keywords || ""} ${g.label}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((g) => g.pages.length);
}
