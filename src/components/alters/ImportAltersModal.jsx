import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import ImportDataSection from "@/components/settings/ImportDataSection";

// Surfaces the SAME import experience as Settings → Data & Privacy → Import right
// on the Alters page (and the empty-state) so new users can bring their data in
// without hunting through Settings. Renders the shared `ImportDataSection`, so
// the backup-file importer (Symphony / Ampersand .ampar / OpenPlural .zip, with
// Add-new vs Replace-all + the native file picker) and the plural-app connectors
// are identical to Settings — no logic forked.
// `contentClassName` lets callers stacked above the default dialog layer (e.g.
// the onboarding overlay at z-[100]) bump this modal's z-index so it renders on
// top instead of behind their backdrop.
export default function ImportAltersModal({ open, onClose, contentClassName = "" }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    enabled: open,
  });
  const settings = pickPrimarySystemSettings(settingsList);
  const onChanged = () => {
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    qc.invalidateQueries({ queryKey: ["alters"] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className={`max-w-lg max-h-[90vh] overflow-y-auto ${contentClassName}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Import {terms.alters}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Bring your data in from a backup file or another plural app. You can always reach this again from Settings → Data &amp; Privacy → Import.
        </p>

        <ImportDataSection settings={settings} onChanged={onChanged} />
      </DialogContent>
    </Dialog>
  );
}
