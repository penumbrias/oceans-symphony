// Full editor for one wish (src/lib/wishes.js). Shared by the profile
// Wishlist tab and, later, the Needs page — never fork it.
//
// The two "why" prompts speak the app's text grammar (MentionTextarea +
// prepareAuthoredText / recordAuthoredText), like every other note field.

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { Chips, SwitchRow } from "@/components/shared/SettingRows";
import WhoseChoice, { whosePicked, whoseEveryone, WHOSE_PICK } from "@/components/needs/WhoseChoice";
import WishLinkFields, { linksActivity, linksGoal, linksList } from "@/components/wishes/WishLinkFields";
import { GOALS_QUERY_KEY } from "@/lib/goals";
import { useNoteLists } from "@/lib/noteLists";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";
import { WISH_KINDS, WISH_STATUSES, WISH_PRIORITIES, NEW_GOAL, NEW_WISHLIST, wishGoalId, applyWishLinks } from "@/lib/wishes";

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const PRIORITY_LABEL = { low: "Someday", normal: "Normal", high: "Important" };

export default function WishEditor({ wish, alters = [], onDone, onCancel }) {
  const t = useTerms();
  const [form, setForm] = useState(() => ({
    title: wish.title || "",
    kind: wish.kind || "item",
    owner_alter_ids: wish.owner_alter_ids || [],
    for_everyone: !!wish.for_everyone,
    is_private: !!wish.is_private,
    priority: wish.priority || "normal",
    status: wish.status || "wished",
    price: wish.price ?? "",
    url: wish.url || "",
    driving: wish.driving || "",
    impact: wish.impact || "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const qc = useQueryClient();

  // What the wish is linked to (WishLinkFields). A wish made into a goal
  // before goal_id existed is found through the goal's wish_id.
  const [links, setLinks] = useState(() => ({
    category_id: wish.category_id || null, goal_id: wish.goal_id || null,
    list_id: wish.list_id || null, list_item_id: wish.list_item_id || null,
  }));
  const { data: goals = [], isFetched: goalsFetched } = useQuery({ queryKey: GOALS_QUERY_KEY, queryFn: () => base44.entities.Goal.list() });
  const goalFilled = useRef(false);
  useEffect(() => {
    if (goalFilled.current || !goalsFetched) return;
    goalFilled.current = true;
    const id = wishGoalId(wish, goals);
    if (id) setLinks((l) => (l.goal_id ? l : { ...l, goal_id: id }));
  }, [goalsFetched, goals, wish]);
  const notes = useNoteLists({ enabled: form.kind === "item" });
  // Whose: the whole system, or picked alters (the standard picker).
  const whose = form.for_everyone || !form.owner_alter_ids.length ? whoseEveryone() : whosePicked(form.owner_alter_ids);
  const setWhose = (v) => setForm((p) => ({
    ...p,
    for_everyone: v.mode !== WHOSE_PICK,
    owner_alter_ids: v.mode === WHOSE_PICK ? v.ids : [],
  }));

  const save = async () => {
    if (!form.title.trim()) return;
    const prep = async (text, label) => {
      if (!String(text || "").trim()) return { content: "", authorIds: [] };
      try {
        return await prepareAuthoredText(text.trim(), { alters, terms: t, surfaceLabel: label });
      } catch (e) {
        if (isLogCommandError(e)) { toast.error(e.message); return null; }
        throw e;
      }
    };
    const driving = await prep(form.driving, "wish");
    if (driving === null) return;
    const impact = await prep(form.impact, "wish");
    if (impact === null) return;
    setSaving(true);
    try {
      const statusChanged = form.status !== (wish.status || "wished");
      const price = form.price === "" || form.price == null ? null : Number(form.price);
      await base44.entities.Wish.update(wish.id, {
        title: form.title.trim(),
        kind: form.kind,
        owner_alter_ids: form.owner_alter_ids,
        for_everyone: form.for_everyone,
        is_private: form.is_private,
        priority: form.priority,
        status: form.status,
        ...(statusChanged ? { status_changed_at: new Date().toISOString() } : {}),
        price: Number.isFinite(price) ? price : null,
        url: form.url.trim() || null,
        // Only the link this kind carries is written; a "new goal" / "new
        // wishlist" choice is made just below, once the wish is saved.
        ...(linksActivity(form.kind) ? { category_id: links.category_id || null } : {}),
        ...(linksGoal(form.kind) ? { goal_id: links.goal_id && links.goal_id !== NEW_GOAL ? links.goal_id : (links.goal_id === NEW_GOAL ? wish.goal_id || null : null) } : {}),
        ...(linksList(form.kind) && !links.list_id ? { list_id: null, list_item_id: null } : {}),
        driving: driving.content,
        impact: impact.content,
        author_alter_ids: [...new Set([...(driving.authorIds || []), ...(impact.authorIds || [])])],
      });
      const saved = { ...wish, title: form.title.trim(), owner_alter_ids: form.owner_alter_ids, for_everyone: form.for_everyone };
      if (linksGoal(form.kind) && links.goal_id === NEW_GOAL) await applyWishLinks(saved, { goal_id: NEW_GOAL });
      if (linksList(form.kind) && links.list_id && (links.list_id === NEW_WISHLIST || links.list_id !== wish.list_id || !wish.list_item_id)) {
        await applyWishLinks({ ...saved, list_id: null, list_item_id: null }, { list_id: links.list_id },
          { lists: notes.lists, items: [...notes.idbItems, ...notes.unlockedItems] });
      }
      for (const key of [GOALS_QUERY_KEY, ["groceryLists"], ["groceryItems"]]) qc.invalidateQueries({ queryKey: key });
      const owner = form.owner_alter_ids[0];
      const navigatePath = owner ? `/alter/${owner}?tab=wishlist&highlight=${wish.id}` : `/needs?tab=wishes&highlight=${wish.id}`;
      for (const p of [driving, impact]) {
        if (!p.content) continue;
        await recordAuthoredText({ ...p, alters, sourceType: "wish", sourceId: wish.id, sourceLabel: `Wish: ${form.title.trim()}`, navigatePath });
      }
      onDone?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)}
        aria-label="Wish" placeholder="What's wished for?" autoFocus />

      <Chips label="Kind" options={WISH_KINDS.map((k) => ({ value: k.id, label: `${k.emoji} ${k.label}` }))}
        value={form.kind} onChange={(v) => set("kind", v)} />

      <WhoseChoice value={whose} onChange={setWhose} label="Whose wish" allowFront={false} />

      {form.kind === "item" && (
        <div className="flex gap-2">
          <input className={`${inputCls} w-28`} type="number" min={0} step="0.01" inputMode="decimal"
            aria-label="Price" placeholder="Price" value={form.price} onChange={(e) => set("price", e.target.value)} />
          <input className={inputCls} type="url" aria-label="Link" placeholder="Link (optional)"
            value={form.url} onChange={(e) => set("url", e.target.value)} />
        </div>
      )}

      <WishLinkFields kind={form.kind} value={links} onChange={setLinks} />

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">What's driving this? (optional)</label>
        <MentionTextarea toolbar value={form.driving} onChange={(v) => set("driving", v)} alters={alters} signposts
          placeholder="What's behind wanting it…" className="min-h-[60px] text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">How does it affect us? (optional)</label>
        <MentionTextarea toolbar value={form.impact} onChange={(v) => set("impact", v)} alters={alters} signposts
          placeholder="What having it, or not having it, does…" className="min-h-[60px] text-sm" />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Priority</p>
        <Chips label="Priority" options={WISH_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          value={form.priority} onChange={(v) => set("priority", v)} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Status</p>
        <Chips label="Status" options={WISH_STATUSES.map((x) => ({ value: x.id, label: x.label }))}
          value={form.status} onChange={(v) => set("status", v)} />
      </div>
      <SwitchRow label="🔒 Private" hint={`Only shows on its own ${t.alter}'s profile, not in search or shared views.`}
        checked={form.is_private} onChange={(v) => set("is_private", v)} />

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}
