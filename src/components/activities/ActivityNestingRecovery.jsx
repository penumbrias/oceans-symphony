import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { detectCorruption, hasCycle, indexById } from "@/lib/categoryTreeUtils";

/**
 * Recovery fallback for the Activity Tally / category tree subtree.
 *
 * Renders when the surrounding ErrorBoundary catches a render-time
 * exception coming from the activity-category renderers — historically
 * a cycle or pathological nesting in `parent_category_id` would crash
 * the whole Activities page and the user had no in-app way back in.
 *
 * What this gives the user:
 *   - A short, plain-language explanation of what happened.
 *   - A summary of how many category records are corrupted (cycles,
 *     self-parents, orphans) so they know whether "flatten" is what
 *     they want or if it's something more localized.
 *   - A "Flatten nesting on activities causing the problem" action that
 *     sets `parent_category_id = null` on ONLY the corrupted rows. No
 *     activities are deleted; nothing loses its name, colour, or any
 *     of its history. The user can re-nest manually afterwards.
 *   - A "Flatten ALL nesting" escape hatch for the case where the
 *     surgical fix isn't enough (e.g. the error originated somewhere
 *     other than the parent chain).
 *
 * Per CLAUDE.md "User Data Preservation": this view never deletes a
 * record. The only mutation it performs is clearing `parent_category_id`
 * on user confirmation.
 */
export default function ActivityNestingRecovery({ error, onReset }) {
  const qc = useQueryClient();
  const [confirmAll, setConfirmAll] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const corruption = detectCorruption(categories);
  const corruptedCount =
    corruption.cycleCount + corruption.orphanCount + corruption.selfParentCount;

  const flattenCorrupted = useMutation({
    mutationFn: async () => {
      const byId = indexById(categories);
      const targets = categories.filter((c) => {
        if (!c) return false;
        if (c.parent_category_id === c.id) return true;
        if (c.parent_category_id && !byId[c.parent_category_id]) return true;
        return hasCycle(c.id, byId);
      });
      for (const c of targets) {
        await base44.entities.ActivityCategory.update(c.id, {
          parent_category_id: null,
        });
      }
      return targets.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      toast.success(
        n === 0
          ? "No corrupted records found — try again to retry render."
          : `Flattened ${n} record${n === 1 ? "" : "s"}. Reloading…`,
      );
      if (typeof onReset === "function") onReset();
    },
    onError: (e) => toast.error(e.message || "Failed to flatten."),
  });

  const flattenAll = useMutation({
    mutationFn: async () => {
      const targets = categories.filter((c) => c && c.parent_category_id);
      for (const c of targets) {
        await base44.entities.ActivityCategory.update(c.id, {
          parent_category_id: null,
        });
      }
      return targets.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["activityCategories"] });
      toast.success(`Flattened ${n} record${n === 1 ? "" : "s"}.`);
      setConfirmAll(false);
      if (typeof onReset === "function") onReset();
    },
    onError: (e) => toast.error(e.message || "Failed to flatten."),
  });

  return (
    <Card className="p-6 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Activity rollup couldn't render
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            The activity rollup hit an error while building the category tree.
            Most often this is caused by a sub-activity that ended up pointing
            at itself (or at one of its own descendants) as its parent. None of
            your activities have been touched — only the rollup view failed.
          </p>
        </div>
      </div>

      {corruptedCount > 0 && (
        <div className="text-xs text-muted-foreground mb-3 ml-8">
          Detected{" "}
          {corruption.cycleCount > 0 && (
            <span>{corruption.cycleCount} cycle{corruption.cycleCount === 1 ? "" : "s"}</span>
          )}
          {corruption.cycleCount > 0 && (corruption.selfParentCount > 0 || corruption.orphanCount > 0) && ", "}
          {corruption.selfParentCount > 0 && (
            <span>{corruption.selfParentCount} self-parent{corruption.selfParentCount === 1 ? "" : "s"}</span>
          )}
          {corruption.selfParentCount > 0 && corruption.orphanCount > 0 && ", "}
          {corruption.orphanCount > 0 && (
            <span>{corruption.orphanCount} orphan{corruption.orphanCount === 1 ? "" : "s"}</span>
          )}{" "}
          out of {corruption.total} activity records.
        </div>
      )}

      <div className="flex flex-wrap gap-2 ml-8">
        <Button
          size="sm"
          onClick={() => flattenCorrupted.mutate()}
          disabled={flattenCorrupted.isPending || corruptedCount === 0}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          Flatten nesting on broken activities ({corruptedCount})
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmAll(true)}
          disabled={flattenAll.isPending}
        >
          Flatten ALL nesting
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Try again
        </Button>
      </div>

      {error?.message && (
        <details className="text-[11px] text-muted-foreground mt-3 ml-8">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-all">{String(error.message)}</pre>
        </details>
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flatten ALL activity nesting?</AlertDialogTitle>
            <AlertDialogDescription>
              Every sub-activity will be moved up to the top level. No activity
              names, colours, or logged records are deleted — only the
              parent/child relationships are cleared. You can re-nest them
              afterwards from "Customize Activities". This affects{" "}
              {categories.filter((c) => c && c.parent_category_id).length}{" "}
              record(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => flattenAll.mutate()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Flatten all
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
