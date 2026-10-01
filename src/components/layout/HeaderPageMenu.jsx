import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings, LayoutGrid, SlidersHorizontal, Users, Activity, Cog, Pencil, Sparkles, ClipboardList, RotateCcw, RefreshCw, Usb } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSyncAdapter } from "@/lib/syncAdapters";
import { getSyncFolder, runSync } from "@/lib/deviceSyncRunner";
import { cn } from "@/lib/utils";
import { useTerms } from "@/lib/useTerms";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// The header cog used to jump STRAIGHT to the full Settings page, so a stray
// tap (when the user actually meant to tweak the page they were on) dumped
// them into all of Settings. Now it opens a small page-aware menu: the most
// relevant action(s) for the CURRENT page on top, then "All settings" as the
// catch-all. The per-page list is just a route → entries lookup, so new pages
// are cheap to add.
//
// Dashboard's "Customize dashboard" fires a window event that QuickNavMenu
// listens for to enter its inline tile-edit mode (the dashboard layout editor
// already lives on the page — we just let the cog open it). The other entries
// deep-link into the matching Settings section via its URL hash (Settings
// honours the hash on mount and opens that section).
// v2Options: when the new UI hosts this menu, its own entries replace the
// classic dashboard ones — Edit home screen + Display options on top, and
// the per-page settings deep links below (those work identically in v2).
// `label` gives the trigger visible text next to the cog — the desktop
// header's nav items are labelled, so the icon-only phone trigger would
// read as a stray glyph there.
export default function HeaderPageMenu({ className, v2Options = null, label = null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const path = location.pathname;
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = React.useState(false);
  // "Reset home screen…" only while the classic home is in edit mode
  // (owner, 2026-10-01) — a reset sitting in the everyday menu was too
  // easy to reach by accident. ExperimentalDashboard broadcasts the state.
  const [classicEditing, setClassicEditing] = React.useState(() => {
    try { return !!window.__osEditing?.["os-classic"]; } catch { return false; }
  });
  React.useEffect(() => {
    const on = (e) => { if (e.detail?.scope === "os-classic") setClassicEditing(!!e.detail.editing); };
    window.addEventListener("os-home-edit-state", on);
    return () => window.removeEventListener("os-home-edit-state", on);
  }, []);

  // Sync is only offered where it can actually run: a platform with a
  // filesystem adapter AND a folder already chosen. Otherwise the entry
  // would be a dead end pointing at Settings.
  const syncReady = React.useMemo(() => {
    try {
      const adapter = getSyncAdapter();
      return adapter.available && (!adapter.canPickFolder || !!getSyncFolder());
    } catch { return false; }
  }, []);

  // Refetch everything on screen without a full page reload — the mouse
  // equivalent of pull-to-refresh.
  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast.success("Refreshed.");
  };

  const handleSyncNow = async (e) => {
    e?.preventDefault?.();
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await runSync({ force: false });
      queryClient.invalidateQueries();
      const n = res.merged.length;
      const bad = res.unreadable?.length || 0;
      if (n) toast.success(`Synced with ${n} device${n === 1 ? "" : "s"}.`);
      else if (bad) toast.error(`${bad} snapshot${bad === 1 ? "" : "s"} couldn't be read — see Settings.`);
      else if (res.needsPairing?.length) toast.message("Another device is waiting to be paired — Settings → Sync between devices.");
      else if (res.errors.length) toast.error(res.errors[0].message);
      else toast.success("Already up to date.");
    } catch (err) {
      toast.error(err?.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const pageActions = [];
  if (v2Options) {
    // Classic chrome hosting the v2 top bar: the classic home is the
    // actual home screen, so ITS editor leads; the board editor sits
    // right under it under its own name. In the full new UI the board
    // IS the home screen and there's no classic editor to offer.
    if (v2Options.editClassicHome) {
      pageActions.push({
        key: "classic-edit-home",
        label: "Edit home screen",
        icon: Pencil,
        onSelect: () => v2Options.editClassicHome(),
      });
    }
    pageActions.push({
      key: "v2-edit-home",
      label: v2Options.editClassicHome ? "Edit widget board" : "Edit home screen",
      icon: LayoutGrid,
      onSelect: () => v2Options.editHome(),
    });
    if (v2Options.editClassicHome && path === "/" && classicEditing) {
      pageActions.push({
        key: "classic-reset-home",
        label: "Reset home screen…",
        icon: RotateCcw,
        onSelect: () => window.dispatchEvent(new CustomEvent("os-classic-reset-home")),
      });
    }
    pageActions.push({
      key: "v2-display",
      label: "Display options",
      icon: SlidersHorizontal,
      onSelect: () => v2Options.openDisplayOptions(),
    });
    // The classic dashboard surfaces the changelog as the "What's new"
    // bar; a v2 board only has it if the user placed that widget — so the
    // cog menu carries a way in regardless.
    pageActions.push({
      key: "v2-whats-new",
      label: "What's new",
      icon: Sparkles,
      onSelect: () => (v2Options.openWhatsNew
        ? v2Options.openWhatsNew()
        : navigate("/settings#about-updates")),
    });
    if (v2Options.openSetupGuide) {
      pageActions.push({
        key: "v2-setup-guide",
        label: "Setup guide",
        icon: ClipboardList,
        onSelect: () => v2Options.openSetupGuide(),
      });
    }
  }
  if (!v2Options && path === "/") {
    pageActions.push({
      key: "dash-edit",
      label: "Edit home screen",
      icon: Pencil,
      // The in-place editor ON the home screen (drag cards, remove, add
      // widgets) — not the old settings-popup pill list.
      onSelect: () => window.dispatchEvent(new CustomEvent("os-classic-edit-home")),
    });
    pageActions.push({
      key: "dash-board",
      label: "Edit widget board",
      icon: LayoutGrid,
      // Dashboard bridges this: opens the board first if classic is
      // showing, then the board enters its edit mode.
      onSelect: () => window.dispatchEvent(new CustomEvent("os-v2-edit-home")),
    });
    if (classicEditing) pageActions.push({
      key: "dash-reset-home",
      label: "Reset home screen…",
      icon: RotateCcw,
      // Opens the restore-to-default dialog (offers to keep the current
      // arrangement on the widget board first). Also in Settings →
      // Appearance → Layout.
      onSelect: () => window.dispatchEvent(new CustomEvent("os-classic-reset-home")),
    });
    pageActions.push({
      key: "dash-appearance",
      label: "Layout & appearance",
      icon: SlidersHorizontal,
      onSelect: () => navigate("/settings#appearance"),
    });
  } else if (path === "/Home" || path.startsWith("/alter/") || path.startsWith("/group/")) {
    pageActions.push({
      key: "alter-setup",
      label: `${terms.Alter} setup`,
      icon: Users,
      onSelect: () => navigate("/settings#alters"),
    });
    pageActions.push({
      key: "alter-appearance",
      label: "Layout & appearance",
      icon: SlidersHorizontal,
      onSelect: () => navigate("/settings#appearance"),
    });
  } else if (
    path.startsWith("/activities") ||
    path.startsWith("/checkin") ||
    path.startsWith("/system-checkin")
  ) {
    pageActions.push({
      key: "tracking-setup",
      label: "Tracking setup",
      icon: Activity,
      onSelect: () => navigate("/settings#checkin"),
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Settings & page options"
          className={cn(
            "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors",
            label && "gap-2 px-3 text-sm font-medium",
            path.startsWith("/settings")
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:bg-muted/50",
            className
          )}
        >
          <Settings className={label ? "w-4 h-4" : "w-5 h-5"} />
          {label && <span>{label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[60]">
        {pageActions.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">This page</DropdownMenuLabel>
            {pageActions.map((a) => (
              <DropdownMenuItem key={a.key} onSelect={a.onSelect} className="gap-2 cursor-pointer">
                <a.icon className="w-4 h-4" />
                {a.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {/* Always-available actions, below whatever this page offers.
            Refresh exists because pull-to-refresh is a touch gesture and
            the desktop app had no equivalent at all. Sync is here because
            "get my other device's changes" is a thing you want from
            wherever you are, not only from deep inside Settings. */}
        <DropdownMenuItem onSelect={handleRefresh} className="gap-2 cursor-pointer">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </DropdownMenuItem>
        {syncReady && (
          <DropdownMenuItem onSelect={handleSyncNow} className="gap-2 cursor-pointer">
            <Usb className="w-4 h-4" />
            {syncing ? "Syncing…" : "Sync with another device"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/settings")} className="gap-2 cursor-pointer">
          <Cog className="w-4 h-4" />
          All settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
