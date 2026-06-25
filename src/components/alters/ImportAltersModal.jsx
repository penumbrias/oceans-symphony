import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import SimplyPluralConnect from "@/components/settings/SimplyPluralConnect";
import SimplyPluralFileImport from "@/components/settings/SimplyPluralFileImport";
import PluralKitConnect from "@/components/settings/PluralKitConnect";
import OpenPluralConnect from "@/components/settings/OpenPluralConnect";
import OctoconConnect from "@/components/settings/OctoconConnect";

// Surfaces the existing Simply Plural + PluralKit importers right on the Alters
// page (and the empty-state) so new users can bring their members in without
// hunting through Settings. Same self-contained connector components Settings →
// Import uses — no logic forked.
// `contentClassName` lets callers stacked above the default dialog layer
// (e.g. the onboarding overlay, which sits at z-[100]) bump this modal's
// z-index so it renders on top instead of behind their backdrop.
export default function ImportAltersModal({ open, onClose, contentClassName = "" }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    enabled: open,
  });
  const settings = settingsList[0] || null;
  const onSettingsChange = () => qc.invalidateQueries({ queryKey: ["systemSettings"] });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className={`max-w-lg max-h-[90vh] overflow-y-auto ${contentClassName}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Import {terms.alters}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Bring your {terms.alters} in from another plural app. You can always reach this again from Settings → Data &amp; Privacy → Import.
        </p>

        <div className="space-y-4">
          <SimplyPluralConnect settings={settings} onSettingsChange={onSettingsChange} />
          <SimplyPluralFileImport settings={settings} onSettingsChange={onSettingsChange} />
          <PluralKitConnect settings={settings} onSettingsChange={onSettingsChange} />
          <OpenPluralConnect settings={settings} onSettingsChange={onSettingsChange} />
          <OctoconConnect settings={settings} onSettingsChange={onSettingsChange} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
