// "Turn the bio into widgets" (v0.297.0) — the opt-in conversion of one
// alter's profile to the garden layout, with a preview first and an undo
// after. The work is in src/lib/profileConvertRun.js.

import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Type, Image as ImageIcon, Images, Minus, Columns2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Row } from "@/components/shared/SettingRows";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { previewConversion, convertAlterProfile, undoAlterConversion } from "@/lib/profileConvertRun";
import { smallBtn } from "./entryEditors";

const PART = {
  text: { icon: Type, label: (name) => `Text → ${name}` },
  side: { icon: Columns2, label: (name) => `Picture beside text → a Media widget beside ${name}` },
  media: { icon: ImageIcon, label: () => "Picture → a Media widget" },
  gallery: { icon: Images, label: () => "Gallery → a Media widget in a grid" },
  divider: { icon: Minus, label: () => "Divider" },
};

export default function ProfileConvertRow({ alter, info }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => previewConversion(alter), [alter]);
  let textN = 0;
  const textName = () => {
    textN += 1;
    return textN === 1 || !preview.splitsText ? "the Bio" : `a new "Bio ${textN}" entry`;
  };

  const reloadInfo = async () => {
    const fresh = await base44.entities.Alter.get(alter.id);
    info.reload(fresh);
  };
  const convert = async () => {
    setBusy(true);
    try {
      await info.flush();
      await convertAlterProfile(alter.id, { qc });
      await reloadInfo();
      setOpen(false);
      toast.success("Done — the profile now uses widgets", {
        action: { label: "Undo", onClick: () => undo() },
      });
    } catch (e) { toast.error(e?.message || "Couldn't convert this profile"); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    setBusy(true);
    try {
      await info.flush();
      await undoAlterConversion(alter.id, { qc });
      await reloadInfo();
      toast.success("Put back the way it was");
    } catch (e) { toast.error(e?.message || "Couldn't undo that"); }
    finally { setBusy(false); }
  };

  if (preview.converted) {
    return (
      <Row label="Profile layout" hint={preview.canUndo ? "Converted to widgets. Undo puts the old layout and bio back." : "Uses the widget layout"}>
        {preview.canUndo && (
          <button type="button" className={smallBtn} onClick={undo} disabled={busy}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Undo conversion
          </button>
        )}
      </Row>
    );
  }
  return (
    <>
      <Row label="Turn the bio into widgets" hint="Each part of the bio becomes a widget you can move, resize and style. Nothing is deleted, and you can undo it.">
        <button type="button" className={smallBtn} onClick={() => setOpen(true)}>Preview</button>
      </Row>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogTitle>Turn {alter.name || `this ${t.alter}`}'s bio into widgets</DialogTitle>
          <div className="space-y-3 text-sm" data-convert-preview="">
            {preview.parts.length ? (
              <>
                <p className="text-muted-foreground">The profile page will show, from the top of the bio down:</p>
                <ol className="space-y-1.5">
                  {preview.parts.map((p, i) => {
                    const key = p.kind === "media" && p.arrange === "grid" ? "gallery" : p.kind;
                    const { icon: Icon, label } = PART[key];
                    const text = p.kind === "text" || p.kind === "side" ? label(textName()) : label();
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-1.5">
                        <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" /> <span>{text}</span>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="text-muted-foreground">The bio is empty, so the page simply switches to the widget layout: the header, their Pictures, the bio and the rest of their info.</p>
            )}
            {preview.pictures > 0 && <p className="text-muted-foreground">{preview.pictures === 1 ? "The picture also joins" : `The ${preview.pictures} pictures also join`} their Pictures.</p>}
            <p className="text-muted-foreground">Nothing is deleted: the original bio is kept with the {t.alter}, and Undo puts the old layout and bio back.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={smallBtn} onClick={() => setOpen(false)} disabled={busy}>Not now</button>
              <button type="button" onClick={convert} disabled={busy}
                className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1.5">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Convert
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
