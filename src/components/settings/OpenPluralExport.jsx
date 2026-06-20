import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, FileArchive, Upload, ArrowUpRight } from "lucide-react";
import { localEntities } from "@/api/base44Client";
import { exportOpenPluralZip } from "@/lib/openPluralExport";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";

// Tolerant list() — an entity with no rows / not yet created shouldn't abort the
// whole export. Mirrors the safeList pattern used by GlobalSearch.jsx.
async function safeList(entity) {
  try {
    const rows = await entity.list();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export default function OpenPluralExport() {
  const t = useTerms();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setProgress(`Gathering your ${t.system}…`);
    try {
      // Fetch every entity the document needs. Run in parallel — they're
      // independent reads.
      const [
        alters,
        groups,
        customFields,
        frontingSessions,
        journalEntries,
        alterNotes,
        relationships,
        systemSettings,
        chatChannels,
        chatCategories,
        chatMessages,
      ] = await Promise.all([
        safeList(localEntities.Alter),
        safeList(localEntities.Group),
        safeList(localEntities.CustomField),
        safeList(localEntities.FrontingSession),
        safeList(localEntities.JournalEntry),
        safeList(localEntities.AlterNote),
        safeList(localEntities.AlterRelationship),
        safeList(localEntities.SystemSettings),
        safeList(localEntities.SystemChatChannel),
        safeList(localEntities.SystemChatCategory),
        safeList(localEntities.SystemChatMessage),
      ]);

      setProgress("Building the OpenPlural file…");
      const result = await exportOpenPluralZip({
        alters,
        groups,
        customFields,
        frontingSessions,
        journalEntries,
        alterNotes,
        relationships,
        systemSettings,
        chatChannels,
        chatCategories,
        chatMessages,
      });

      const r = result.shareResult?.result;
      if (r === "cancelled") {
        // User dismissed the share sheet — no toast, no error.
        return;
      }
      if (r === "downloaded" || r === "shared") {
        const c = result.counts;
        const imagePart = result.assetsWritten > 0 ? ` · ${result.assetsWritten} image${result.assetsWritten === 1 ? "" : "s"}` : "";
        const chatPart = c.chatMessages > 0 ? ` · ${c.chatMessages} chat message${c.chatMessages === 1 ? "" : "s"}` : "";
        toast.success(
          `Exported ${c.members} ${c.members === 1 ? t.alter : t.alters}, ${c.groups} group${c.groups === 1 ? "" : "s"}, ${c.fronts} front period${c.fronts === 1 ? "" : "s"}${chatPart}${imagePart}.`,
          { duration: 8000 },
        );
      } else {
        toast.error("Couldn't save the export file.");
      }
    } catch (e) {
      console.error("[OpenPlural export] failed", e);
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileArchive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Export (OpenPlural)</CardTitle>
            <CardDescription>
              Export your whole {t.system} to the portable OpenPlural format — import it into PluralSpace or any OpenPlural app.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Saves a <code className="font-mono bg-muted px-1 rounded">.zip</code> containing your {t.alters}, groups, custom fields, front history, journal notes, relationships, and avatars — in the open OpenPlural v0.1 format. Re-importing it back into this app reproduces your data without duplicating it.
          </p>

          {progress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {progress}
            </div>
          )}

          <Button
            onClick={handleExport}
            disabled={exporting}
            size="sm"
            className="w-full gap-1.5"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {exporting ? "Exporting…" : "Export to OpenPlural"}
          </Button>

          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <ArrowUpRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>It's a one-time file — once saved it doesn't stay in sync. Nothing leaves your device unless you choose where to send it.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
