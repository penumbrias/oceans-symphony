// An alter's Wishlist (System Needs, phase 2): their wishes plus the ones
// that belong to everyone. Quick add is the shared WishQuickAdd (starting
// on this alter); everything else is optional and lives in WishEditor.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import WishCard from "@/components/wishes/WishCard";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import { WISHES_QUERY_KEY, isOpenWish, wishesForAlter, sortWishes } from "@/lib/wishes";
import WishQuickAdd from "@/components/needs/WishQuickAdd";
import { whosePicked } from "@/components/needs/WhoseChoice";

export default function WishlistTab({ alter, alters = [] }) {
  const qc = useQueryClient();
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

  return (
    <div className="space-y-4">
      <div data-tour="alter-wishlist-add" className="rounded-xl border border-border/50 bg-muted/10 p-3">
        <WishQuickAdd initialWhose={whosePicked([alter.id])} />
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
