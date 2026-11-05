// The one quick add for a wish (v0.331.0): what it is, its kind, and whose
// it is. Used by the "Add a wish" widget (which the Needs page's Wishes
// page starts with) and by the Wishes widget's expanded view on a profile.
// Saves through createWish (src/lib/wishes.js); "whose" resolves at save
// time (WhoseChoice.resolveWhose), so "In front now" means who is in front
// when Add is tapped.
//
// v0.353.0: the kind is a real link, not a tag (WishLinkFields): an
// activity wish picks or creates a planner activity, a goal wish links or
// makes a goal, an item wish goes onto a list or is taken from one. With a
// link picked the title can stay empty — the activity, goal or list item
// names it.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WISHES_QUERY_KEY, WISH_KINDS, NEW_GOAL, createWish, applyWishLinks } from "@/lib/wishes";
import { GOALS_QUERY_KEY } from "@/lib/goals";
import { useNoteLists } from "@/lib/noteLists";
import WishLinkFields, { linksForKind } from "@/components/wishes/WishLinkFields";
import WhoseChoice, { whoseFront, resolveWhose, chipCls, chipStyle } from "@/components/needs/WhoseChoice";

export default function WishQuickAdd({ initialWhose = null, showKinds = true, onAdded = null }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("item");
  const [whose, setWhose] = useState(() => initialWhose || whoseFront());
  const [links, setLinks] = useState({});
  const [busy, setBusy] = useState(false);
  const notes = useNoteLists({ enabled: kind === "item" });
  const picked = linksForKind(kind, links);
  // A picked activity / goal names the wish when no title was typed.
  const linkedName = () => {
    if (picked.category_id) return (qc.getQueryData(["activityCategories"]) || []).find((c) => c.id === picked.category_id)?.name || "";
    if (picked.goal_id && picked.goal_id !== NEW_GOAL) return (qc.getQueryData(GOALS_QUERY_KEY) || []).find((g) => g.id === picked.goal_id)?.title || "";
    return "";
  };
  const canAdd = !!title.trim() || !!picked.category_id || (!!picked.goal_id && picked.goal_id !== NEW_GOAL);
  const add = async () => {
    const text = title.trim() || linkedName().trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const ownerIds = await resolveWhose(whose);
      const wish = await createWish({ title: text, kind, ownerIds, links: picked });
      const goal = await applyWishLinks(wish, picked, { lists: notes.lists, items: [...notes.idbItems, ...notes.unlockedItems] });
      setTitle("");
      setLinks({});
      qc.invalidateQueries({ queryKey: WISHES_QUERY_KEY });
      for (const key of [GOALS_QUERY_KEY, ["groceryLists"], ["groceryItems"]]) qc.invalidateQueries({ queryKey: key });
      toast.success(goal ? "Wish added, with its own goal 💗" : picked.list_id ? "Wish added to the list 💗" : "Wish added 💗");
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
        <button type="button" onClick={add} disabled={busy || !canAdd}
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
      {showKinds && (
        <WishLinkFields kind={kind} value={picked} onChange={setLinks} allowDraw
          onDraw={(item) => { if (!title.trim()) setTitle(item.name || ""); }} />
      )}
      <WhoseChoice value={whose} onChange={setWhose} label="Whose wish" />
    </div>
  );
}
