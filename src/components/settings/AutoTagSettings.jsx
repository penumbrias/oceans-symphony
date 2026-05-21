import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tags } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Default OFF. Per-user feedback the auto-tag writeback (Get to
// know me's preset answers stamping tags onto alter.tags) feels
// intrusive — the app effectively inferred things about an alter
// the user hadn't typed. This toggle lets users who DID want the
// matcher-seeding behaviour opt back in.

export default function AutoTagSettings() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0] || null;
  const enabled = !!settings?.auto_tag_from_get_to_know_me;
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    if (saving) return;
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { auto_tag_from_get_to_know_me: next });
      } else {
        await base44.entities.SystemSettings.create({ auto_tag_from_get_to_know_me: next });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Tags className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Auto-tag from Get to know me</CardTitle>
            <CardDescription>
              When ON, answering a preset Get to know me question (energy, body / head, etc.) stores your literal answer as a tag on the selected alters. Off by default to keep tags fully under your control.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <label className="flex items-center justify-between gap-3 cursor-pointer rounded-xl border border-border/40 px-3 py-2.5 hover:bg-muted/20">
          <span className="text-sm text-foreground">
            {enabled ? "Auto-tag writeback is ON" : "Auto-tag writeback is OFF"}
          </span>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          Either way, custom-field answers, colour, pronouns, and role still write back to the alter as before — this toggle only controls the tag pills.
        </p>
      </CardContent>
    </Card>
  );
}
