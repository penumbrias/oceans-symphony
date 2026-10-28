// Editors for one entry of an alter's info (v0.295.0) — shared by the Alter
// info list and the Info widget's Content tab, so an entry edits the same
// way wherever it is. Each commits through `onCommit` / `onChange`; the
// caller decides where it is written.

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, LayoutTemplate, Code2, PenSquare } from "lucide-react";
import { Segmented } from "@/components/shared/SettingRows";
import { DebouncedText, RichTextField } from "@/components/shared/DebouncedFields";
import SimplePreview from "@/components/shared/SimplePreview";
import { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";
import BioEditor, { ImportSPModal } from "@/components/alters/BioEditor";
import BioTemplatePicker from "@/components/alters/BioTemplatePicker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateFieldInput } from "@/components/alters/profile/fieldControls";
import { appendImportedText } from "@/lib/bioImport";

export const inputBase = "h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring";
export const inputCls = `${inputBase} w-full`;
export const areaCls = "w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring";
export const smallBtn = "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-40";

// The kinds an entry can be — the custom-field types, named for people.
export const ENTRY_KINDS = [
  { value: "text", label: "Short text" },
  { value: "richtext", label: "Long text" },
  { value: "list", label: "List" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
];
export const KIND_LABEL = Object.fromEntries(ENTRY_KINDS.map((k) => [k.value, k.label]));

// One entry's value, edited in place. `k` re-seeds the draft after undo.
export function EntryInput({ k, type, value, onCommit, label }) {
  const v = value ?? "";
  if (type === "richtext") {
    return <RichTextField key={k} value={String(v)} onCommit={onCommit} placeholder="Write…" />;
  }
  if (type === "boolean") {
    const on = v === true || v === "true" ? "true" : v === false || v === "false" ? "false" : "";
    return (
      <Segmented label={label} equal={false} value={on} onChange={onCommit}
        options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />
    );
  }
  if (type === "date") return <DateFieldInput key={k} value={String(v)} onChange={onCommit} />;
  if (type === "number") {
    return <DebouncedText key={k} value={String(v)} onCommit={onCommit} type="number" inputMode="decimal" ariaLabel={label} className={`${inputBase} w-28`} />;
  }
  return (
    <div className="space-y-1">
      <DebouncedText key={k} value={String(v)} onCommit={onCommit} multiline rows={type === "list" ? 2 : 2}
        maxLength={5000} ariaLabel={label} placeholder={type === "list" ? "item, item, item" : "Not filled yet"} className={areaCls} />
      {type === "list" && <p className="text-[0.6875rem] text-muted-foreground">Separate items with commas.</p>}
    </div>
  );
}

// ── The bio: one long-text entry ─────────────────────────────────────
// A bio written with the block editor (pictures beside text, galleries,
// templates with fill-in fields) keeps working exactly as before: its
// fill-in fields edit here, and "Edit blocks" opens the full bio editor.
export function BioEntry({ k, value, onChange }) {
  // Bumped when the bio is replaced from outside the text box (a template,
  // a paste, the blocks editor) so the box shows the new bio.
  const [seed, setSeed] = useState(0);
  const replace = (html) => { onChange(html); setSeed((n) => n + 1); };
  const [code, setCode] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const isBlocks = (value || "").includes("data-blocks=");
  const blocks = useMemo(() => (isBlocks ? htmlToBlocks(value) : []), [isBlocks, value]);
  const onBlockChange = (id, patch) => {
    const next = patch.__remove ? blocks.filter((b) => b.id !== id) : blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    onChange(blocksToHTML(next));
  };
  return (
    <div className="space-y-2" data-info-bio="">
      {isBlocks ? (
        <div className="rounded-xl border border-border/50 p-3">
          <SimplePreview blocks={blocks} onBlockChange={onBlockChange} scopeId={`alter-info-bio-${k}`} />
        </div>
      ) : code ? (
        <DebouncedText key={`code:${k}:${seed}`} value={value || ""} onCommit={onChange} multiline rows={8} maxLength={500000}
          ariaLabel="Bio code" placeholder="<p>HTML…</p>" className={`${areaCls} font-mono text-xs`} />
      ) : (
        <RichTextField key={`rich:${k}:${seed}`} value={value || ""} onCommit={onChange} placeholder="Write a bio…" />
      )}
      <div className="flex flex-wrap gap-1.5">
        {isBlocks ? (
          <button type="button" className={smallBtn} onClick={() => setBlocksOpen(true)}><PenSquare className="w-3.5 h-3.5" /> Edit blocks</button>
        ) : (
          <button type="button" className={smallBtn} onClick={() => setCode((c) => !c)} aria-pressed={code}>
            <Code2 className="w-3.5 h-3.5" /> {code ? "Back to text" : "View code"}
          </button>
        )}
        <button type="button" className={smallBtn} onClick={() => setTemplatesOpen(true)}><LayoutTemplate className="w-3.5 h-3.5" /> Templates</button>
        <button type="button" className={smallBtn} onClick={() => setImportOpen(true)}><FileDown className="w-3.5 h-3.5" /> Paste from another app</button>
      </div>
      {templatesOpen && (
        <BioTemplatePicker current={value || ""}
          onApply={(html, { close } = {}) => { replace(html); if (close) setTemplatesOpen(false); }}
          onClose={() => setTemplatesOpen(false)} />
      )}
      {importOpen && (
        <ImportSPModal onClose={() => setImportOpen(false)}
          onImport={(text) => { replace(appendImportedText(value || "", text)); toast.success("Added to the end of the bio"); }} />
      )}
      <Dialog open={blocksOpen} onOpenChange={(open) => { setBlocksOpen(open); if (!open) setSeed((n) => n + 1); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Edit blocks</DialogTitle>
          <BioEditor value={value || ""} onChange={onChange} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

