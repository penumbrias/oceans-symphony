// Recent changes — the app's history archive. Everything destructive or
// layout-shaped is silently captured into HistoryEvent (see localDb.js):
// deleted records with a full snapshot, alter profile edits, and home /
// board layout rewrites. This page lists them in categorized buckets and
// can restore any of them — the safety net against one member of a
// system quietly erasing what the rest didn't agree to lose.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { restoreDeletedRecord } from "@/lib/localDb";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { toast } from "sonner";
import {
  History, Trash2, Undo2, ChevronDown, Users, BookOpen, Activity as ActivityIcon,
  LayoutGrid, Archive,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const FIELD_LABELS = {
  classic_home: "Home screen layout",
  ui_v2_home: "Widget board layout",
  ui_v2_home_desktop: "Widget board layout (desktop)",
  dashboard_layout: "Classic card list",
  navigation_config: "Navigation setup",
  experimental_home: "Experimental home layout",
};

export default function HistoryArchive() {
  const t = useTerms();
  const qc = useQueryClient();
  const [openCat, setOpenCat] = useState("alters");
  const [detailsId, setDetailsId] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ["historyEvents"],
    queryFn: () => localEntities.HistoryEvent.list("-timestamp", 500),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const CATS = useMemo(() => ([
    { id: "alters", label: `${t.Alters} & ${t.system}`, icon: Users },
    { id: "content", label: "Journals & content", icon: BookOpen },
    { id: "tracking", label: "Tracking & plans", icon: ActivityIcon },
    { id: "layout", label: "Layouts & screens", icon: LayoutGrid },
    { id: "other", label: "Everything else", icon: Archive },
  ]), [t]);

  const byCat = useMemo(() => {
    const map = { alters: [], content: [], tracking: [], layout: [], other: [] };
    for (const e of events) (map[e.category] || map.other).push(e);
    return map;
  }, [events]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["historyEvents"] });
    qc.invalidateQueries();
  };

  const actionLabel = (e) => {
    if (e.action === "deleted") return "Deleted";
    if (e.action === "edited") return "Edited";
    return "Changed";
  };
  const subjectLabel = (e) => {
    if (e.action === "layout") return FIELD_LABELS[e.field] || e.field || "Layout";
    const entity = e.entity === "Alter" ? t.Alter : e.entity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return `${entity}${e.label ? ` — "${e.label}"` : ""}`;
  };

  const restore = async (e) => {
    if (busy) return;
    const what = e.action === "layout"
      ? `Restore the earlier "${subjectLabel(e)}"? Your current one will be replaced (this rewrite is itself archived here first).`
      : e.action === "deleted"
        ? `Restore the deleted ${subjectLabel(e)}?`
        : `Restore this earlier version of ${subjectLabel(e)}? Current fields will be overwritten.`;
    if (!(await confirm(what))) return;
    setBusy(true);
    try {
      if (e.action === "deleted") {
        await restoreDeletedRecord(e.entity, e.snapshot);
      } else if (e.action === "layout") {
        // Goes through the normal update path, so the CURRENT layout gets
        // its own restore point before being replaced.
        await base44.entities.SystemSettings.update(e.record_id, { [e.field]: e.snapshot });
      } else {
        const existing = await base44.entities[e.entity].get?.(e.record_id);
        if (existing) await base44.entities[e.entity].update(e.record_id, e.snapshot);
        else await restoreDeletedRecord(e.entity, e.snapshot);
      }
      toast.success("Restored.");
      refresh();
    } catch (err) {
      toast.error(err?.message || "Couldn't restore that.");
    } finally {
      setBusy(false);
    }
  };

  const removeEvent = async (e) => {
    if (!(await confirm("Remove this entry from the archive? A deleted item's snapshot is gone for good once its entry is removed."))) return;
    await localEntities.HistoryEvent.delete(e.id);
    qc.invalidateQueries({ queryKey: ["historyEvents"] });
  };

  const clearBucket = async (catId, rows) => {
    if (!rows.length) return;
    if (!(await confirm(`Clear all ${rows.length} entries in this bucket? Deleted items' snapshots are gone for good.`))) return;
    await localEntities.HistoryEvent.bulkDelete(rows.map((r) => r.id));
    qc.invalidateQueries({ queryKey: ["historyEvents"] });
  };

  return (
    <div className="os-page-shell p-3 sm:p-4 space-y-3" data-tour="history-archive">
      <div>
        <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" /> Recent changes
        </h1>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Deletions, {t.alter} profile edits and layout rewrites are archived
          here automatically, each bucket keeping its own recent window — so
          one kind of change can never flush the record of another. Anything
          listed can be restored.
        </p>
      </div>

      {CATS.map((cat) => {
        const rows = byCat[cat.id] || [];
        const open = openCat === cat.id;
        return (
          <section key={cat.id} className="rounded-2xl border border-border/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenCat(open ? null : cat.id)}
              aria-expanded={open}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
            >
              <cat.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-sm font-medium">{cat.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="border-t border-border/40">
                {rows.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted-foreground italic">Nothing archived here yet.</p>
                )}
                {rows.map((e) => (
                  <div key={e.id} className="px-3 py-2 border-b border-border/30 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          <span className={e.action === "deleted" ? "text-destructive font-medium" : "font-medium"}>
                            {actionLabel(e)}
                          </span>{" "}
                          {subjectLabel(e)}
                        </p>
                        <button type="button"
                          onClick={() => setDetailsId(detailsId === e.id ? null : e.id)}
                          className="text-[0.6875rem] text-muted-foreground hover:text-foreground">
                          {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })} · details
                        </button>
                      </div>
                      <button type="button" disabled={busy} onClick={() => restore(e)}
                        className="text-xs px-2.5 py-1 rounded-full border border-[var(--color-primary,theme(colors.blue.500))]/50 text-primary flex items-center gap-1 disabled:opacity-50">
                        <Undo2 className="w-3 h-3" /> Restore
                      </button>
                      <button type="button" onClick={() => removeEvent(e)} aria-label="Remove entry"
                        className="p-1.5 rounded-full text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {detailsId === e.id && (
                      <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-muted/30 p-2 text-[0.625rem] leading-snug whitespace-pre-wrap break-all">
                        {JSON.stringify(e.snapshot, null, 1)}
                      </pre>
                    )}
                  </div>
                ))}
                {rows.length > 0 && (
                  <div className="px-3 py-2">
                    <button type="button" onClick={() => clearBucket(cat.id, rows)}
                      className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2">
                      Clear this bucket
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
