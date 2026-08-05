// Global kill-switch for profile songs (Settings → Alter setup).
// Per-alter songs are set in each alter's edit window; this turns ALL
// autoplay off for people who don't want pages making sound.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { useTerms } from "@/lib/useTerms";

export default function ProfileSongsSettings() {
  const terms = useTerms();
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const row = settingsList[0];
  const enabled = row?.profile_songs_enabled !== false;

  const save = async (v) => {
    try {
      if (row?.id) await base44.entities.SystemSettings.update(row.id, { profile_songs_enabled: !!v });
      else await base44.entities.SystemSettings.create({ profile_songs_enabled: !!v });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { toast.error("Couldn't save"); }
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">Play profile songs</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          An {terms.alter} with a profile song (set in their edit window) plays it
          when their page opens — MySpace style, with a floating player to pause
          or stop. Off silences every profile.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={save} />
    </div>
  );
}
