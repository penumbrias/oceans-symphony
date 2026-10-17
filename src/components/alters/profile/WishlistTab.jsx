// An alter's Wishlist (System Needs, phase 2): their wishes plus the ones
// that belong to everyone. Quick add is a title and a kind; everything
// else is optional and lives in the shared WishEditor.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Heart, Lock, ExternalLink, CalendarPlus, ShoppingBasket, Check, Undo2, Pencil, Trash2, ChevronDown, Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import RichText from "@/components/shared/RichText";
import { confirm } from "@/components/shared/ConfirmDialog";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import WishEditor from "@/components/wishes/WishEditor";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import {
  WISHES_QUERY_KEY, WISH_KINDS, wishKindMeta, wishStatusLabel, isOpenWish, wishesForAlter, sortWishes,
  wishAgeLabel, setWishStatus, planWish, addWishToShoppingList,
} from "@/lib/wishes";
import { format } from "date-fns";

const small = "text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40";

function WishCard({ wish, alters, categories, alterById, onChanged }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const kind = wishKindMeta(wish.kind);
  const open = isOpenWish(wish);
  const owners = (wish.owner_alter_ids || []).map((id) => alterById.get(id)).filter(Boolean);
  const canPlan = open && (wish.kind === "activity" || wish.kind === "experience" || !!wish.category_id);

  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast.success(msg); onChanged(); }
    catch (e) { toast.error(e?.message || "Couldn't save that."); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div data-highlight-id={wish.id} className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <WishEditor wish={wish} alters={alters} onCancel={() => setEditing(false)}
          onDone={() => { setEditing(false); onChanged(); }} />
      </div>
    );
  }

  return (
    <div data-highlight-id={wish.id}
      className={`rounded-xl border p-4 space-y-2 ${open ? "border-border/50 bg-muted/10" : "border-border/30 bg-muted/5 opacity-75"}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5" aria-hidden="true">{kind.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${wish.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {wish.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            <span>{kind.label}</span>
            {wish.status && wish.status !== "wished" && <span>· {wishStatusLabel(wish.status)}</span>}
            {wish.priority === "high" && <span className="text-primary">· Important</span>}
            {wish.for_everyone
              ? <span className="flex items-center gap-1">· <Users className="w-3 h-3" /> Everyone</span>
              : owners.length > 1 && <span>· {owners.map((a) => formatAlter(a)).join(", ")}</span>}
            {wish.is_private && <span className="flex items-center gap-0.5">· <Lock className="w-3 h-3" /> Private</span>}
            {wish.price != null && wish.price !== "" && <span>· {wish.price}</span>}
          </div>
        </div>
        <span className="text-[0.6875rem] text-muted-foreground flex-shrink-0 whitespace-nowrap">{wishAgeLabel(wish)}</span>
      </div>

      {wish.driving && (
        <div className="text-xs">
          <span className="text-muted-foreground">Driving it: </span>
          <RichText content={wish.driving} alters={alters} terms={t} className="inline" />
        </div>
      )}
      {wish.impact && (
        <div className="text-xs">
          <span className="text-muted-foreground">How it affects us: </span>
          <RichText content={wish.impact} alters={alters} terms={t} className="inline" />
        </div>
      )}
      {wish.last_happened_at && (
        <p className="text-xs text-muted-foreground">Last happened {format(new Date(wish.last_happened_at), "MMM d")}</p>
      )}

      {planning && (
        <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When could it happen?"
          onPick={(when) => run(async () => { await planWish(wish, when, { categories }); setPlanning(false); }, "Planned")} />
      )}

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
        {canPlan && (
          <button type="button" disabled={busy} onClick={() => setPlanning((p) => !p)} className={small}>
            <CalendarPlus className="w-3.5 h-3.5" /> Plan it
          </button>
        )}
        {open && wish.kind === "item" && (
          <button type="button" disabled={busy} className={small}
            onClick={() => run(async () => {
              const { added } = await addWishToShoppingList(wish);
              toast.success(added ? "Added to the shopping list" : "It's already on the shopping list");
            })}>
            <ShoppingBasket className="w-3.5 h-3.5" /> Shopping list
          </button>
        )}
        {wish.url && (
          <a href={wish.url} target="_blank" rel="noreferrer" className={small}>
            <ExternalLink className="w-3.5 h-3.5" /> Link
          </a>
        )}
        {open ? (
          <>
            <button type="button" disabled={busy} className={small} onClick={() => run(() => setWishStatus(wish, "done"), "Marked done 💜")}>
              <Check className="w-3.5 h-3.5" /> Done
            </button>
            <button type="button" disabled={busy} className={small} onClick={() => run(() => setWishStatus(wish, "let_go"), "Let go — it stays in the history")}>
              Let go
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} className={small} onClick={() => run(() => setWishStatus(wish, "wished"))}>
            <Undo2 className="w-3.5 h-3.5" /> Wish again
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${wish.title}`} className="p-1 text-muted-foreground hover:text-foreground">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button type="button" aria-label={`Delete ${wish.title}`} className="p-1 text-muted-foreground hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete this wish?",
              body: "\"Done\" or \"Let go\" keep it in the history instead. Deleting removes it for good.",
              confirmLabel: "Delete", destructive: true,
            });
            if (ok) run(() => base44.entities.Wish.delete(wish.id));
          }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

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
