import React, { useEffect, useRef, useState } from "react";
import { Palette, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import { newLine, lineKind, isListPaste, spreadPaste } from "@/lib/quickPeople";

// The quick list (v0.371.0): type a few names, paste a whole list, or give
// someone just a colour or an emoji. Lines switched to "Not sure yet" (and
// lines with no name) save as presences; named lines save as alters.
// Controlled: the parent owns `lines` and saves them with saveQuickPeople,
// so setup's Finish and the "Add several" sheet share one writer.
// Used by setup step 5 (SetupFlowSteps WhoStep) and QuickPeopleSheet.
export default function QuickPeopleList({ lines, onChange }) {
  const t = useTerms();
  const [colourFor, setColourFor] = useState(null); // line key
  const inputs = useRef({});
  const [focusKey, setFocusKey] = useState(null);

  useEffect(() => {
    if (!focusKey) return;
    inputs.current[focusKey]?.focus();
    setFocusKey(null);
  }, [focusKey, lines]);

  const update = (key, patch) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key) => {
    const next = lines.filter((l) => l.key !== key);
    onChange(next.length ? next : [newLine()]);
  };
  const addAfter = (index) => {
    const line = newLine({ unsure: !!lines[index]?.unsure });
    onChange([...lines.slice(0, index + 1), line, ...lines.slice(index + 1)]);
    setFocusKey(line.key);
  };

  const onPaste = (e, index) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!isListPaste(text)) return;
    e.preventDefault();
    const next = spreadPaste(lines, index, text);
    onChange(next);
    const lastNew = next[index + (next.length - lines.length)];
    if (lastNew) setFocusKey(lastNew.key);
  };

  const editing = lines.find((l) => l.key === colourFor);

  return (
    <div className="space-y-2" data-tour="quick-people-list">
      <ul className="space-y-2" aria-label={`${t.Alters} to add`}>
        {lines.map((line, i) => {
          const kind = lineKind(line);
          return (
            <li key={line.key} className="rounded-lg border border-border/60 p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColourFor(line.key)}
                  className="w-9 h-9 rounded-lg border-2 border-border hover:border-primary/50 flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: line.color || "transparent" }}
                  aria-label={line.color ? `Colour ${line.color}, change` : "Pick a colour"}
                >
                  {!line.color && <Palette className="w-4 h-4 text-muted-foreground" />}
                </button>
                <Input
                  ref={(el) => { if (el) inputs.current[line.key] = el; else delete inputs.current[line.key]; }}
                  value={line.name}
                  onChange={(e) => update(line.key, { name: e.target.value })}
                  onPaste={(e) => onPaste(e, i)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAfter(i); } }}
                  placeholder={i === 0 ? "A name, a nickname, or paste a list" : "Another name"}
                  aria-label={`Name ${i + 1}`}
                  className="min-w-0"
                />
                <Input
                  value={line.emoji}
                  onChange={(e) => update(line.key, { emoji: e.target.value })}
                  placeholder="🙂"
                  maxLength={4}
                  aria-label={`Emoji ${i + 1}`}
                  className="w-14 text-center flex-shrink-0 px-1 placeholder:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => remove(line.key)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted/40 flex-shrink-0"
                  aria-label={`Remove line ${i + 1}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="flex items-center gap-2 pl-11 text-xs text-muted-foreground cursor-pointer min-h-[28px]">
                <Switch checked={!!line.unsure} onCheckedChange={(v) => update(line.key, { unsure: v })} aria-label={`Not sure yet, line ${i + 1}`} />
                <span className="text-foreground">Not sure yet</span>
                {kind && (
                  <span className="ml-auto" aria-live="polite">
                    {kind === "alter" ? `Saves as ${an(t.alter)}` : "Saves as a presence"}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => addAfter(lines.length - 1)}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 min-h-[44px]"
      >
        <Plus className="w-4 h-4" /> Add a line
      </button>
      {editing && (
        <ColorPickerModal
          color={editing.color || "#8b5cf6"}
          label="Pick a colour"
          onSave={(hex) => { update(editing.key, { color: hex }); setColourFor(null); }}
          onClose={() => setColourFor(null)}
        />
      )}
    </div>
  );
}
