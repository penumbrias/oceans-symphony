// The Tour page's controls (Settings → About → Tour): take the tour, the
// page-tutorial banner switch, replay them, start setup over. One copy,
// shared by the old Settings page and the new house's Settings room.
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group, SwitchRow } from "@/components/shared/SettingRows";
import {
  arePageTutorialsEnabled,
  setPageTutorialsEnabled,
  clearAllSeen as clearAllPageTutorialsSeen,
  openFullTour,
  subscribePageTutorials,
} from "@/lib/pageTutorials";

// Per-page tutorial banner controls — toggle the banner globally and
// reset the per-route seen-set so prompts come back on every page.
// Subscribes to pageTutorials state so a reset from elsewhere keeps
// the toggle UI in sync.
export default function PageTutorialsControls() {
  const [enabled, setEnabled] = useState(() => arePageTutorialsEnabled());
  useEffect(() => subscribePageTutorials(() => setEnabled(arePageTutorialsEnabled())), []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        The tour walks every page, starting with how the app fits together. Each page also has its own short walk-through: open the page's ⚙ menu → "Show me around this page" any time.
      </p>
      <Group title="Page tutorials" first>
        <SwitchRow label="Show page-tutorial prompts" hint={'"New to this page? Show me around" banner on first visit.'}
          checked={enabled}
          onChange={(next) => { setPageTutorialsEnabled(next); setEnabled(next); }} />
      </Group>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openFullTour()} data-tour="settings-full-tour">
          Take the tour
        </Button>
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
          Start setup over
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Start setup over runs the welcome steps again (backups, the notice, your words, a first feeling, who's here). It never deletes or overwrites anything.
      </p>
    </div>
  );
}

