// One wish: what it is, whose, why, and what can be done with it (plan it,
// shopping list, make it a goal, done / let go, edit, delete). Shared by
// an alter's Wishlist tab and the Needs page.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Lock, ExternalLink, CalendarPlus, ShoppingBasket, Check, Undo2, Pencil, Trash2, Users, Target,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import RichText from "@/components/shared/RichText";
import { confirm } from "@/components/shared/ConfirmDialog";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import WishEditor from "@/components/wishes/WishEditor";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import {
  wishKindMeta, wishStatusLabel, isOpenWish, wishAgeLabel, setWishStatus, planWish, addWishToShoppingList,
} from "@/lib/wishes";
import { format } from "date-fns";

const small = "text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40";

export default function WishCard({ wish, alters, categories, alterById, onChanged, showOwners = false }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
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
              : (showOwners ? owners.length > 0 : owners.length > 1) && <span>· {owners.map((a) => formatAlter(a)).join(", ")}</span>}
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
        {open && wish.kind === "goal" && (
          <button type="button" disabled={busy} className={small} onClick={() => navigate(`/goals?fromWish=${wish.id}`)}>
            <Target className="w-3.5 h-3.5" /> Make it a goal
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
