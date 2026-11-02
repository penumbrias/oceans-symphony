// The one quick add for a wish (v0.331.0): what it is, its kind, and whose
// it is. Used by the "Add a wish" widget (which the Needs page's Wishes
// page starts with) and by the Wishes widget's expanded view on a profile.
// Saves through createWish (src/lib/wishes.js); "whose" resolves at save
// time (WhoseChoice.resolveWhose), so "In front now" means who is in front
// when Add is tapped.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WISHES_QUERY_KEY, WISH_KINDS, createWish } from "@/lib/wishes";
import WhoseChoice, { whoseFront, resolveWhose, chipCls, chipStyle } from "@/components/needs/WhoseChoice";

export default function WishQuickAdd({ initialWhose = null, showKinds = true, onAdded = null }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("item");
  const [whose, setWhose] = useState(() => initialWhose || whoseFront());
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const ownerIds = await resolveWhose(whose);
      await createWish({ title: text, kind, ownerIds });
      setTitle("");
      qc.invalidateQueries({ queryKey: WISHES_QUERY_KEY });
      toast.success("Wish added 💗");
      onAdded?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-own-hold="" className="space-y-[0.6em]">
      <div className="flex gap-[0.4em]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Something wished for…" aria-label="New wish"
          className="flex-1 min-w-0 h-11 px-3 rounded-lg border text-[0.875em]"
          style={{ borderColor: "color-mix(in srgb, currentColor 20%, transparent)", background: "transparent" }} />
        <button type="button" onClick={add} disabled={busy || !title.trim()}
          className="h-11 px-4 rounded-lg text-[0.875em] font-medium disabled:opacity-40"
          style={{ background: "var(--v2-accent, var(--color-primary))", color: "var(--v2-on-accent, #fff)" }}>Add</button>
      </div>
      {showKinds && (
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-[0.35em]">
          {WISH_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
              className={chipCls} style={chipStyle(kind === k.id)}>
              <span aria-hidden="true">{k.emoji}</span> {k.label}
            </button>
          ))}
        </div>
      )}
      <WhoseChoice value={whose} onChange={setWhose} label="Whose wish" />
    </div>
  );
}
