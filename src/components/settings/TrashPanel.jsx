// The trash (v0.278.0): everything deleted, grouped by what was deleted
// together, with Restore, "Delete now" where the time lock allows it, and
// the recovery window + time lock settings. Lives at the top of Recent
// changes. The rules are in src/lib/trash.js.

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, Lock, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useTerms } from "@/lib/useTerms";
import {
  listTrash, restoreFromTrash, deleteFromTrashNow, saveTrashSettings, TRASH_DAY_CHOICES,
} from "@/lib/trash";

const s = (v) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim() : "");
const recordText = (r) => s(r?.name) || s(r?.title) || s(r?.activity_name) || s(r?.label)
  || s(r?.note) || s(r?.content) || s(r?.question) || "";
const daysLabel = (d) => (d === 0 ? "Until I empty it" : d === 365 ? "1 year" : `${d} days`);
const shortDate = (iso) => { try { return format(new Date(iso), "d MMM yyyy"); } catch { return ""; } };

export default function TrashPanel() {
  const t = useTerms();
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [openBatch, setOpenBatch] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["trash"],
    queryFn: listTrash,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const settings = data?.settings || { days: 30, lock: false, pending: null };
  const batches = data?.batches || [];

  const entityWord = (entity) => (entity === "Alter"
    ? t.alter
    : entity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  const itemLabel = (it) => {
    const text = recordText(it.record).slice(0, 60);
    return text ? `${entityWord(it.entity)} "${text}"` : entityWord(it.entity);
  };
  const batchLabel = (b) => {
    const first = itemLabel(b.items[0]);
    return b.items.length > 1 ? `${first} and ${b.items.length - 1} more` : first;
  };

  const refresh = () => qc.invalidateQueries();

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e?.message || "That didn't work. Nothing was changed."); }
    finally { setBusy(false); refresh(); }
  };

  const restore = (b) => run(async () => {
    const n = await restoreFromTrash(b.items);
    toast.success(n === 1 ? "Put back." : `Put back ${n} things.`);
  });

  const deleteNow = async (b) => {
    if (!(await confirm({
      title: "Delete for good?",
      body: `${batchLabel(b)} will be removed from this device now and can't be put back from the trash.`,
      confirmLabel: "Delete for good", destructive: true,
    }))) return;
    run(async () => {
      const { removed, refused } = await deleteFromTrashNow(b.items);
      if (refused) toast.info(`${refused} protected by the time lock stayed in the trash.`);
      else if (removed) toast.success("Deleted for good.");
    });
  };

  const emptyAllowed = batches.filter((b) => b.canDeleteNow);
  const emptyTrash = async () => {
    const n = emptyAllowed.reduce((sum, b) => sum + b.items.length, 0);
    if (!n) return;
    if (!(await confirm({
      title: "Empty the trash?",
      body: `${n} deleted thing${n === 1 ? "" : "s"} will be removed for good.${settings.lock ? " Anything the time lock protects stays." : ""}`,
      confirmLabel: "Empty trash", destructive: true,
    }))) return;
    run(async () => {
      const { removed } = await deleteFromTrashNow(emptyAllowed.flatMap((b) => b.items));
      toast.success(`Removed ${removed} for good.`);
    });
  };

  const setDays = (days) => run(async () => {
    const next = await saveTrashSettings({ days });
    if (next.pending?.days === days) toast.info(`The time lock is on, so this takes effect on ${shortDate(next.pending.effective_at)}.`);
  });
  const setLock = async (lock) => {
    if (lock && !(await confirm({
      title: "Turn on the time lock?",
      body: `While it's on, protected things (${t.alters} with history, groups, journals, chat channels, bulletins and maps) can't be deleted early, and turning it off or shortening how long things are kept only takes effect after ${settings.days ? `${settings.days} days` : "30 days"}. Nobody can undo it in the moment.`,
      confirmLabel: "Turn on",
    }))) return;
    run(async () => {
      const next = await saveTrashSettings({ lock });
      if (!lock && next.lock) toast.info(`The time lock turns off on ${shortDate(next.pending.effective_at)}.`);
    });
  };

  const pending = settings.pending;
  const total = batches.reduce((sum, b) => sum + b.items.length, 0);

  return (
    <section className="rounded-2xl border border-border/50 overflow-hidden" data-tour="trash">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
      >
        <Trash2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-sm font-medium">Trash</span>
        {settings.lock && <Lock className="w-3.5 h-3.5 text-muted-foreground" aria-label="Time lock on" />}
        <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border/40">
          <div className="px-3 py-2.5 space-y-2.5 border-b border-border/30">
            <div>
              <p className="text-xs font-medium mb-1.5">Keep deleted things for</p>
              <div className="flex flex-wrap gap-1.5">
                {TRASH_DAY_CHOICES.map((d) => (
                  <button key={d} type="button" disabled={busy} onClick={() => setDays(d)}
                    aria-pressed={settings.days === d}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                      settings.days === d ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}>
                    {daysLabel(d)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium flex items-center gap-1.5"><Lock className="w-3 h-3" /> Time lock</p>
                <p className="text-[0.6875rem] text-muted-foreground leading-snug">
                  Protected things can't be deleted early, and loosening this only takes effect after the current window.
                </p>
              </div>
              <Switch checked={settings.lock} disabled={busy} onCheckedChange={setLock} aria-label="Time lock" />
            </label>
            {pending && (
              <p className="text-[0.6875rem] text-muted-foreground">
                Waiting for the lock: {[
                  "lock" in pending && "the time lock turns off",
                  "days" in pending && `deleted things are kept for ${daysLabel(pending.days).toLowerCase()}`,
                ].filter(Boolean).join(" and ")} on {shortDate(pending.effective_at)}.
              </p>
            )}
          </div>

          {batches.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground italic">The trash is empty.</p>
          )}
          {batches.map((b) => (
            <div key={b.batch} className="px-3 py-2 border-b border-border/30 last:border-b-0">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate first-letter:uppercase">{batchLabel(b)}</p>
                  <button type="button" onClick={() => setOpenBatch(openBatch === b.batch ? null : b.batch)}
                    className="text-[0.6875rem] text-muted-foreground hover:text-foreground text-left">
                    Deleted {formatDistanceToNow(new Date(b.trashedAt), { addSuffix: true })}
                    {" · "}{b.purgeAt ? `gone for good ${shortDate(b.purgeAt)}` : "kept until you empty it"}
                    {b.items.length > 1 ? " · what's inside" : ""}
                  </button>
                </div>
                <button type="button" disabled={busy} onClick={() => restore(b)}
                  className="text-xs px-2.5 py-1 rounded-full border border-primary/50 text-primary flex items-center gap-1 disabled:opacity-50">
                  <Undo2 className="w-3 h-3" /> Restore
                </button>
                {b.canDeleteNow ? (
                  <button type="button" disabled={busy} onClick={() => deleteNow(b)} aria-label="Delete for good"
                    className="p-1.5 rounded-full text-muted-foreground hover:text-destructive disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="p-1.5 text-muted-foreground" title="Protected by the time lock">
                    <Lock className="w-3.5 h-3.5" aria-label="Protected by the time lock" />
                  </span>
                )}
              </div>
              {openBatch === b.batch && b.items.length > 1 && (
                <ul className="mt-1.5 space-y-0.5">
                  {b.items.map((it) => (
                    <li key={`${it.entity}:${it.record.id}`} className="text-[0.6875rem] text-muted-foreground truncate first-letter:uppercase">
                      {itemLabel(it)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {emptyAllowed.length > 0 && (
            <div className="px-3 py-2">
              <button type="button" disabled={busy} onClick={emptyTrash}
                className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 disabled:opacity-50">
                Empty trash
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
