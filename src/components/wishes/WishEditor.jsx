// Full editor for one wish (src/lib/wishes.js). Shared by the profile
// Wishlist tab and, later, the Needs page — never fork it.
//
// The two "why" prompts speak the app's text grammar (MentionTextarea +
// prepareAuthoredText / recordAuthoredText), like every other note field.

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { SearchableSelect, SearchableMultiSelect } from "@/components/shared/SearchableSelect";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { WISH_KINDS, WISH_STATUSES, WISH_PRIORITIES } from "@/lib/wishes";

const chip = (on) => `text-xs px-2.5 py-1 rounded-full border ${
  on ? "border-primary text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
}`;
const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const PRIORITY_LABEL = { low: "Someday", normal: "Normal", high: "Important" };

export default function WishEditor({ wish, alters = [], onDone, onCancel }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
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
    category_id: wish.category_id || null,
    driving: wish.driving || "",
    impact: wish.impact || "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  // Nested picker (house rule: hierarchies never render as a flat select).
  const categoryOptions = useMemo(
    () => flattenCategoryTree(categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [categories],
  );
  const alterOptions = useMemo(
    () => (alters || []).filter((a) => !a.is_archived || form.owner_alter_ids.includes(a.id))
      .map((a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatar_url: a.avatar_url || a.image_url })),
    [alters, formatAlter, form.owner_alter_ids],
  );

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
        category_id: form.category_id || null,
        driving: driving.content,
        impact: impact.content,
        author_alter_ids: [...new Set([...(driving.authorIds || []), ...(impact.authorIds || [])])],
      });
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

      <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
        {WISH_KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={form.kind === k.id}
            onClick={() => set("kind", k.id)} className={chip(form.kind === k.id)}>
            {k.emoji} {k.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Whose wish</label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.for_everyone} onChange={(e) => set("for_everyone", e.target.checked)} className="rounded" />
          Everyone in the {t.system}
        </label>
        {!form.for_everyone && (
          <SearchableMultiSelect
            value={form.owner_alter_ids}
            onChange={(next) => set("owner_alter_ids", next || [])}
            options={alterOptions}
            placeholder={`Pick ${t.alters}`}
            searchPlaceholder={`Search ${t.alters}…`}
          />
        )}
      </div>

      {form.kind === "item" && (
        <div className="flex gap-2">
          <input className={`${inputCls} w-28`} type="number" min={0} step="0.01" inputMode="decimal"
            aria-label="Price" placeholder="Price" value={form.price} onChange={(e) => set("price", e.target.value)} />
          <input className={inputCls} type="url" aria-label="Link" placeholder="Link (optional)"
            value={form.url} onChange={(e) => set("url", e.target.value)} />
        </div>
      )}

      {(form.kind === "activity" || form.kind === "experience" || form.category_id) && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Activity it fits (optional)</label>
          <SearchableSelect
            value={form.category_id}
            onChange={(id) => set("category_id", id || null)}
            options={categoryOptions}
            allowClear
            placeholder="No activity"
            searchPlaceholder="Search activities…"
            renderOption={(o) => (
              <span className="flex items-center gap-2 min-w-0">
                {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
                {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
                <span className="truncate text-sm">{o.label}</span>
              </span>
            )}
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">What's driving this? (optional)</label>
        <MentionTextarea value={form.driving} onChange={(v) => set("driving", v)} alters={alters} signposts
          placeholder="What's behind wanting it…" className="min-h-[60px] text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">How does it affect us? (optional)</label>
        <MentionTextarea value={form.impact} onChange={(v) => set("impact", v)} alters={alters} signposts
          placeholder="What having it, or not having it, does…" className="min-h-[60px] text-sm" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Priority</span>
        {WISH_PRIORITIES.map((p) => (
          <button key={p} type="button" aria-pressed={form.priority === p} onClick={() => set("priority", p)} className={chip(form.priority === p)}>
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Status</span>
        {WISH_STATUSES.map((s) => (
          <button key={s.id} type="button" aria-pressed={form.status === s.id} onClick={() => set("status", s.id)} className={chip(form.status === s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.is_private} onChange={(e) => set("is_private", e.target.checked)} className="rounded mt-0.5" />
        <span>
          <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Private</span>
          <span className="block text-xs text-muted-foreground">Only shows on its own {t.alter}'s profile, not in search or shared views.</span>
        </span>
      </label>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}
