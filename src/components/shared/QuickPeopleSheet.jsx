import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import QuickPeopleList from "@/components/shared/QuickPeopleList";
import { useTerms } from "@/lib/useTerms";
import { newLine, lineKind, saveQuickPeople } from "@/lib/quickPeople";

// Saves a quick list and says what happened. Lines that failed come back
// so the caller keeps them on screen (nothing typed is lost).
export function useQuickPeopleSave() {
  const t = useTerms();
  const qc = useQueryClient();
  return async (lines) => {
    const res = await saveQuickPeople(lines);
    if (res.alters.length) qc.invalidateQueries({ queryKey: ["alters"] });
    if (res.presences.length) qc.invalidateQueries({ queryKey: ["presences"] });
    const parts = [];
    if (res.alters.length) parts.push(`${res.alters.length} ${res.alters.length === 1 ? t.alter : t.alters}`);
    if (res.presences.length) parts.push(`${res.presences.length} ${res.presences.length === 1 ? "presence" : "presences"}`);
    if (parts.length) toast.success(`Added ${parts.join(" and ")}`);
    if (res.failed.length) toast.error(`${res.failed.length} couldn't be saved. They're still in the list.`);
    return { ...res, remaining: res.failed.map((f) => f.line) };
  };
}

// "Add several": the quick list in a sheet, from the Alters page and New
// Presences. `unsure` starts every line as "Not sure yet" (New Presences).
export default function QuickPeopleSheet({ open, onClose, unsure = false }) {
  const t = useTerms();
  const save = useQuickPeopleSave();
  const [lines, setLines] = useState(() => [newLine({ unsure })]);
  const [saving, setSaving] = useState(false);
  const count = lines.filter((l) => lineKind(l)).length;

  const close = () => { setLines([newLine({ unsure })]); onClose?.(); };

  const submit = async () => {
    if (!count || saving) return;
    setSaving(true);
    try {
      const { remaining } = await save(lines);
      if (remaining.length) setLines(remaining);
      else close();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - var(--os-sab) - 2rem)" }}
      >
        <DialogHeader>
          <DialogTitle>Add several</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">
          One line each. A name is enough, or just a colour or emoji. Switch on "Not sure yet" for anyone you can't pin down; they're kept as presences, and you can make them {t.alters} later.
        </p>
        <div className="overflow-y-auto min-h-0 pr-1 -mr-1">
          <QuickPeopleList lines={lines} onChange={setLines} />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={close} disabled={saving} className="flex-1">Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={saving || !count} className="flex-1">
            {count > 1 ? `Add ${count}` : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
