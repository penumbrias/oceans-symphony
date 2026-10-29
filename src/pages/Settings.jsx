// Settings (v0.320.0): one flat list. A search box, then every page in its
// group (You · General · Look · {Alters} · Tracking · Notifications · Data &
// privacy · About); a row opens its page at `/settings#<id>`, with a back
// button in the page header. The catalogue is src/components/settings/
// settingsPages.jsx; legacy hashes from older links are mapped there too.
import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { APP_VERSION, APP_RELEASE_STAGE } from "@/lib/appVersion";
import DesktopUpdateButton from "@/components/settings/DesktopUpdateButton";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { runAutoBackupNow } from "@/lib/autoBackup";
import { Loader2, ChevronDown, ChevronLeft, Upload, Download, Globe, Database, Search, X as XIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import DataRescuePanel from "@/components/settings/DataRescuePanel";
import ImportDataSection from "@/components/settings/ImportDataSection";
import BugReportModal from "@/components/settings/BugReportModal";
import { Group, LinkRow, SwitchRow } from "@/components/shared/SettingRows";
import {
  buildSettingsGroups, filterSettingsGroups, findSettingsPage, LEGACY_HASHES, EXPORT_FORMAT_EXTRAS,
} from "@/components/settings/settingsPages";
import {
  arePageTutorialsEnabled,
  setPageTutorialsEnabled,
  clearAllSeen as clearAllPageTutorialsSeen,
  subscribePageTutorials,
} from "@/lib/pageTutorials";

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
  const location = useLocation();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [backingUp, setBackingUp] = useState(false);
  // Backup dropdown → opens the import/export UI directly as a popup.
  const [backupModal, setBackupModal] = useState(null); // "import" | "export" | null
  const [showRescue, setShowRescue] = useState(false); // "Find my data" recovery overlay
  const [showBugReport, setShowBugReport] = useState(false);
  const [query, setQuery] = useState("");

  const { data: settingsList = [], isLoading, refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = pickPrimarySystemSettings(settingsList);

  // One-tap "Back up now" in the header — the same full-DB export the
  // auto-backup uses. A quick safety net without opening Data & privacy.
  const handleBackupNow = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try { await runAutoBackupNow(); }
    catch (e) { toast.error(e?.message || "Backup failed"); }
    finally { setBackingUp(false); }
  };

  const groups = useMemo(() => buildSettingsGroups({
    terms, navigate, settings, refetch, queryClient,
    openRescue: () => setShowRescue(true),
    openBugReport: () => setShowBugReport(true),
    renderTour: () => <PageTutorialsControls />,
  }), [terms, navigate, settings, refetch, queryClient]);

  // Which page is open comes from the hash, so links from anywhere in the
  // app (and the tour) land on the page, and Back is a real back.
  const rawHash = (location.hash || "").replace(/^#/, "");
  const target = LEGACY_HASHES[rawHash] || rawHash;
  const groupTarget = target.startsWith("group:") ? target.slice(6) : null;
  const found = !groupTarget && target ? findSettingsPage(groups, target) : null;
  const openPage = found?.page || null;

  // A page opens scrolled to the top; a group link scrolls the home list
  // to that group's heading.
  useEffect(() => {
    const main = document.querySelector("main");
    if (openPage) { main?.scrollTo?.({ top: 0 }); window.scrollTo(0, 0); return; }
    if (groupTarget) {
      requestAnimationFrame(() => {
        document.getElementById(`settings-group-${groupTarget}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [openPage?.id, groupTarget, location.key]);

  // A row with an `action` (Display options, Check-in manager, Find my
  // data, bug report) runs it; a hash that names one of those just runs it
  // and stays on the home list.
  useEffect(() => {
    if (found?.page?.action && !found.page.render) {
      found.page.action();
      navigate("/settings", { replace: true });
    }
  }, [found?.page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRow = (page) => {
    if (page.action && !page.render) { page.action(); return; }
    navigate(`/settings#${page.id}`);
  };
  // Back is a real back when there is somewhere to go back to (a deep link
  // from another page returns there); otherwise the Settings home.
  const goHome = () => {
    const idx = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (idx > 0) navigate(-1); else navigate("/settings");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const shownGroups = filterSettingsGroups(groups, query);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      {openPage && openPage.render ? (
        <div className="os-page-shell" data-tour="settings-content">
          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={goHome} aria-label="Back to Settings"
              className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground leading-none">{found.group.label}</p>
              <h1 className="font-display text-2xl font-semibold text-foreground leading-tight truncate">{openPage.label}</h1>
            </div>
          </div>
          <div key={openPage.id} className="space-y-6">{openPage.render()}</div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-3xl font-semibold text-foreground mb-1">Settings</h1>
              {/* Release tag + version chip — bumped with every changelog entry
                  via src/lib/appVersion.js, so testers can cite the build. */}
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
                    <DropdownMenuItem onSelect={() => setBackupModal("export")} className="gap-2 cursor-pointer">
                      <Download className="w-4 h-4" /> Export a backup
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setBackupModal("import")} className="gap-2 cursor-pointer">
                      <Upload className="w-4 h-4" /> Import a backup…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleBackupNow} className="gap-2 cursor-pointer">
                      <Database className="w-4 h-4" /> Back up now
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
              Customize your {terms.system} and manage your data.{" "}
              <span onClick={() => openExternalUrl("https://www.notion.so/709a266d2e0f4da7a4aaa02e180ee1ad?v=e950ba087a1d42bea4ee0784dc8307b1")}
                className="text-primary underline hover:text-primary/80 cursor-pointer">
                Template gallery →
              </span>
            </p>
            <div className="mt-2"><DesktopUpdateButton /></div>
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

          {/* Search — people look for the THING they want to change. */}
          <div data-tour="settings-quick-nav" role="search" className="relative mb-3">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings" aria-label="Search settings"
              className="w-full h-10 rounded-xl border border-border/60 bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div data-tour="settings-content" className="os-page-shell">
            {shownGroups.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nothing matches "{query}".</p>
            )}
            {shownGroups.map((g, i) => (
              <div key={g.id} id={`settings-group-${g.id}`} data-tour={g.tour} className="scroll-mt-4">
                <Group title={g.label} first={i === 0}>
                  {g.pages.map((p) => (
                    <LinkRow key={p.id} label={p.label} hint={p.hint} icon={p.icon} tour={p.tour} onClick={() => openRow(p)} />
                  ))}
                </Group>
              </div>
            ))}
          </div>
        </>
      )}

      <BugReportModal open={showBugReport} onClose={() => setShowBugReport(false)} />

      {/* Backup dropdown → import/export UI directly, so it's one tap. */}
      <Dialog open={backupModal === "export"} onOpenChange={(o) => { if (!o) setBackupModal(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4" /> Export a backup</DialogTitle>
          </DialogHeader>
          <DataBackupRestore section="export" exportExtras={EXPORT_FORMAT_EXTRAS} />
        </DialogContent>
      </Dialog>
      <Dialog open={backupModal === "import"} onOpenChange={(o) => { if (!o) setBackupModal(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Import a backup</DialogTitle>
          </DialogHeader>
          <ImportDataSection
            settings={settings}
            onChanged={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["alters"] }); }}
          />
        </DialogContent>
      </Dialog>

      {showRescue && <DataRescuePanel onClose={() => setShowRescue(false)} />}
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
      <Group title="Page tutorials" first>
        <SwitchRow label="Show page-tutorial prompts" hint={'"New to this page? Show me around" banner on first visit.'}
          checked={enabled}
          onChange={(next) => { setPageTutorialsEnabled(next); setEnabled(next); }} />
      </Group>
      <div className="flex flex-wrap gap-2">
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
        <Button
          variant="outline"
          size="sm"
          data-tour="rerun-setup"
          onClick={() => { window.location.href = "/?onboarding=replay"; }}
        >
          Re-run setup
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Re-run setup replays the guided welcome flow (terminology, tracking packs, emotions, backups). It never deletes or overwrites anything.
      </p>
    </div>
  );
}

