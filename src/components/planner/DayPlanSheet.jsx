// "What I want to do today" — the untimed list for one day.
//
// Pull from the to-do list or type something new. Either way it becomes an
// Activity with a planned_date and NO timestamp, which the canvas draws in
// the day's untimed strip. Give it a time later, or just mark it done.
//
// Picking a to-do keeps the link (Activity.task_id) rather than copying the
// text, so ticking one off can find the other.

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Check, X, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const isOpenTask = (t) => !(t.is_complete || t.completed);

export default function DayPlanSheet({ day, open, onClose }) {
  const tr = useT();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"], queryFn: () => base44.entities.Task.list(), enabled: open,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"], queryFn: () => base44.entities.Activity.list(), enabled: open,
  });

  const dayKey = useMemo(() => {
    const d = new Date(day); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, [day]);

  // Already on this day — so the same to-do can't be added twice.
  const alreadyHere = useMemo(() => new Set(
    activities
      .filter((a) => a.planned_date && new Date(a.planned_date).toDateString() === new Date(day).toDateString())
      .map((a) => a.task_id || a.activity_name)
  ), [activities, day]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks
      .filter(isOpenTask)
      .filter((t) => !alreadyHere.has(t.id))
      .filter((t) => !needle || (t.title || "").toLowerCase().includes(needle));
  }, [tasks, q, alreadyHere]);

  const add = async ({ title, taskId }) => {
    const name = (title || "").trim();
    if (!name) return;
    setBusy(true);
    try {
      await base44.entities.Activity.create({
        activity_name: name,
        // planned_date + no timestamp = "this day, no time yet".
        planned_date: dayKey,
        status: "scheduled",
        ...(taskId ? { task_id: taskId } : {}),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setQ("");
    } catch (e) {
      toast.error(e.message || tr("planner.addFailed"));
    } finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-2"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{tr("planner.planDay")}</h2>
          <button type="button" onClick={onClose} aria-label={tr("planner.close")}
            className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) add({ title: q }); }}
              placeholder={tr("planner.addPlaceholder")} className="h-9 pl-7 text-sm" />
          </div>
          <Button size="sm" disabled={!q.trim() || busy} onClick={() => add({ title: q })} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> {tr("planner.add")}
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto overscroll-contain space-y-0.5">
          <p className="text-[0.6875em] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 pt-1">
            <ListTodo className="w-3 h-3" /> {tr("planner.fromTodo")}
          </p>
          {shown.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">{tr("planner.noTasks")}</p>
          )}
          {shown.map((t) => (
            <button key={t.id} type="button" disabled={busy}
              onClick={() => add({ title: t.title, taskId: t.id })}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm hover:bg-muted/40">
              <Check className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{t.title || tr("planner.untitled")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
