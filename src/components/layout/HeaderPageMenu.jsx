import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings, LayoutGrid, SlidersHorizontal, Users, Activity, Cog } from "lucide-react";
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
export default function HeaderPageMenu({ className }) {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const path = location.pathname;

  const pageActions = [];
  if (path === "/") {
    pageActions.push({
      key: "dash-edit",
      label: "Customize dashboard",
      icon: LayoutGrid,
      onSelect: () => window.dispatchEvent(new CustomEvent("symphony-open-dashboard-edit")),
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
            path.startsWith("/settings")
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:bg-muted/50",
            className
          )}
        >
          <Settings className="w-5 h-5" />
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
        <DropdownMenuItem onSelect={() => navigate("/settings")} className="gap-2 cursor-pointer">
          <Cog className="w-4 h-4" />
          All settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
