import React from "react";
import { Button } from "@/components/ui/button";
import { Monitor, FolderOpen } from "lucide-react";
import { isDesktop, getDesktopInfo } from "@/lib/platform";

// Desktop-only first-run notice, rendered at the top of the onboarding
// screen (StorageModeSetup).
//
// Why it exists: Chromium keys IndexedDB by origin, and the desktop shell
// runs on its own origin (symphony://app — see electron/main.cjs). So a
// user who has been using the web or phone app opens the desktop app to a
// completely empty database. Nothing is lost, but it LOOKS like everything
// is, and the onboarding screen alone doesn't say why.
//
// Also surfaces the data folder, because on desktop "your database is a
// directory you can copy" is a real recovery path worth knowing about
// before it's needed.

export default function DesktopFirstRunNotice({ onImport }) {
  if (!isDesktop()) return null;
  const info = getDesktopInfo();

  return (
    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Monitor className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="font-semibold leading-tight">The desktop app has its own database</h3>
          <p className="text-xs text-muted-foreground">
            Your phone and browser data isn't here yet — import a backup to bring it over.
            Nothing on your other devices is changed or removed by doing this.
          </p>
        </div>
      </div>

      <Button type="button" onClick={onImport} className="w-full" size="sm">
        Import a backup file
      </Button>

      {info?.dataPath ? (
        <div className="flex items-center gap-2 pt-1">
          <code className="flex-1 min-w-0 truncate text-[11px] text-muted-foreground font-mono" title={info.dataPath}>
            {info.dataPath}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 flex-shrink-0"
            onClick={() => info.openDataFolder?.()}
            aria-label="Open the folder this app stores its data in"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
