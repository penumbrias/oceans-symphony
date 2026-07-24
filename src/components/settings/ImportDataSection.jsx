import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { SubSection } from "@/components/settings/SettingsUI";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import SimplyPluralFileImport from "@/components/settings/SimplyPluralFileImport";
import PluralKitConnect from "@/components/settings/PluralKitConnect";
import OpenPluralConnect from "@/components/settings/OpenPluralConnect";
import OctoconConnect from "@/components/settings/OctoconConnect";
import PluralStarFileImport from "@/components/settings/PluralStarFileImport";

// The full "Import" experience — the backup-file importer (Symphony / Ampersand
// .ampar / OpenPlural .zip, Add-new vs Replace-all, native file picker, paste
// fallback) PLUS the live-token connectors — factored into ONE component so
// Settings → Data & Privacy → Import and the Alters-page "Import" popup are
// literally the same UI and can't drift apart. `onChanged` is called after any
// importer finishes so the caller can refetch (alters / settings).
export default function ImportDataSection({ settings, onChanged }) {
  // "Import from file" above auto-detects the export type; for a non-Symphony
  // export DataBackupRestore hands the file up here, which routes it to the
  // matching app's importer (or asks when a members-style file is ambiguous).
  const [externalImport, setExternalImport] = useState(null);
  const changed = () => onChanged?.();

  return (
    <div className="space-y-3">
      <DataBackupRestore
        section="import"
        onExternalFile={(file, type) => setExternalImport(type ? { file, type } : null)}
      />

      {externalImport?.type === "ask" && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
          <p className="text-sm text-foreground">
            We can't tell whether this file is from Simply Plural or OpenPlural. Which app is it from?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setExternalImport((p) => ({ ...p, type: "simplyplural" }))}>
              Simply Plural
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExternalImport((p) => ({ ...p, type: "openplural" }))}>
              OpenPlural / PluralSpace
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExternalImport(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {externalImport && externalImport.type !== "ask" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Detected {externalImport.file.name} — importing as{" "}
              {externalImport.type === "simplyplural"
                ? "Simply Plural"
                : externalImport.type === "octocon"
                ? "Octocon"
                : externalImport.type === "pluralstar"
                ? "Plural Star"
                : "OpenPlural / PluralSpace"}
              .
            </span>
            <button type="button" className="underline shrink-0 hover:text-foreground" onClick={() => setExternalImport(null)}>
              Use a different file
            </button>
          </div>
          {externalImport.type === "simplyplural" && (
            <SimplyPluralFileImport presetFile={externalImport.file} settings={settings} onSettingsChange={changed} />
          )}
          {externalImport.type === "octocon" && (
            <OctoconConnect presetFile={externalImport.file} settings={settings} onSettingsChange={changed} />
          )}
          {externalImport.type === "openplural" && (
            <OpenPluralConnect presetFile={externalImport.file} settings={settings} onSettingsChange={changed} />
          )}
          {externalImport.type === "pluralstar" && (
            <PluralStarFileImport presetFile={externalImport.file} settings={settings} onSettingsChange={changed} />
          )}
        </div>
      )}

      <SubSection title="PluralKit (live token)" defaultOpen={false}>
        <PluralKitConnect settings={settings} onSettingsChange={changed} />
      </SubSection>
    </div>
  );
}
