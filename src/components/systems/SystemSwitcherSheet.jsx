// The system switcher as a sheet, reachable from the chrome (owner spec):
// tapping the system NAME in the top bar, or the app icon in the sidebar's
// upper-left corner, opens it — switch, create, or manage side systems
// without digging into Settings. ONE host lives in AppLayout (the single
// always-present wrapper) and listens for the window event, so every
// trigger shares the same sheet.
//
// The body IS SystemSwitcherPanel — the same component Settings and the
// Dashboard mount (rule: reuse, don't fork). Lazy so the chrome bundle
// doesn't carry it until the first open.

import React, { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { useTerms } from "@/lib/useTerms";

const SystemSwitcherPanel = React.lazy(() => import("@/components/systems/SystemSwitcherPanel"));

export const OPEN_SYSTEM_SWITCHER_EVENT = "os-open-system-switcher";
export function openSystemSwitcher() {
  window.dispatchEvent(new CustomEvent(OPEN_SYSTEM_SWITCHER_EVENT));
}

export default function SystemSwitcherSheetHost() {
  const terms = useTerms();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_SYSTEM_SWITCHER_EVENT, on);
    return () => window.removeEventListener(OPEN_SYSTEM_SWITCHER_EVENT, on);
  }, []);
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <DrawerContent className="max-h-[88vh]" {...sheetPortalGuards}>
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">{terms.Systems || `${terms.System}s`}</DrawerTitle>
          <DrawerDescription className="sr-only">Switch, create or manage {terms.systems || `${terms.system}s`}.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 overflow-y-auto overscroll-contain flex-1 min-h-0"
          style={{ paddingBottom: "calc(var(--os-sab) + 24px)" }}>
          {open && (
            <React.Suspense fallback={<p className="text-xs text-muted-foreground py-4">Loading…</p>}>
              <SystemSwitcherPanel />
            </React.Suspense>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
