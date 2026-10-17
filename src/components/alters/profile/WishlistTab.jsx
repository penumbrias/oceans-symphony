// An alter's Wishlist (System Needs, phase 2): their wishes plus the ones
// that belong to everyone. Quick add is a title and a kind; everything
// else is optional and lives in the shared WishEditor.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Heart, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import WishCard from "@/components/wishes/WishCard";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import { WISHES_QUERY_KEY, WISH_KINDS, isOpenWish, wishesForAlter, sortWishes } from "@/lib/wishes";

export default function WishlistTab({ alter, alters = [] }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("item");
  const [adding, setAdding] = useState(false);
  const [showFinished, setShowFinished] = useState(false);

  const { data: wishes = [], isFetched } = useQuery({
    queryKey: WISHES_QUERY_KEY,
    queryFn: () => base44.entities.Wish.list(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const alterById = useMemo(() => new Map((alters || []).map((a) => [a.id, a])), [alters]);
  const mine = useMemo(() => sortWishes(wishesForAlter(wishes, alter.id)), [wishes, alter.id]);
  const openWishes = mine.filter(isOpenWish);
  const finished = mine.filter((w) => !isOpenWish(w));
  useHighlightScroll([isFetched && mine.length > 0]);

  const refresh = () => qc.invalidateQueries({ queryKey: WISHES_QUERY_KEY });

  const add = async () => {
    const text = title.trim();
    if (!text) return;
    setAdding(true);
    try {
      await base44.entities.Wish.create({
        title: text, kind, owner_alter_ids: [alter.id], for_everyone: false, is_private: false,
        priority: "normal", status: "wished", status_changed_at: new Date().toISOString(),
      });
      setTitle("");
      refresh();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div data-tour="alter-wishlist-add" className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder={`Something ${formatAlter(alter) || `this ${t.alter}`} wishes for…`}
            aria-label="New wish"
          />
          <Button size="sm" onClick={add} disabled={adding || !title.trim()}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
          {WISH_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                kind === k.id ? "border-primary text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
      </div>

      {openWishes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
          <Heart className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          No wishes yet. Add one above; the details can wait.
        </div>
      )}

      {openWishes.map((w) => (
        <WishCard key={w.id} wish={w} alters={alters} categories={categories} alterById={alterById} onChanged={refresh} />
      ))}

      {finished.length > 0 && (
        <div className="space-y-3">
          <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFinished ? "rotate-180" : ""}`} />
            Done and let go ({finished.length})
          </button>
          {showFinished && finished.map((w) => (
            <WishCard key={w.id} wish={w} alters={alters} categories={categories} alterById={alterById} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
