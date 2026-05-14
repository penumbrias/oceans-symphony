import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, Zap, Flag, Clock, CheckCircle2, Circle, BarChart2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import BulletinCard from "@/components/bulletin/BulletinCard";
import TaskBulletinCard from "@/components/bulletin/TaskBulletinCard";
import TaskQuickActionsSheet from "@/components/tasks/TaskQuickActionsSheet";
import { toast } from "sonner";

// Robust due-date parser. Old records stored a YYYY-MM-DD string; newer
// ones (and the Tapestry preview) store full ISO timestamps. Concatenating
// "T00:00:00" to an already-ISO string produced garbage and Invalid Date,
// which crashed the dashboard via format() — that's the "preview mode
// dashboard crashes" bug. Handle both shapes.
function parseDueDate(raw) {
  if (!raw) return new Date(NaN);
  // Already a full ISO timestamp ("2026-05-13T17:00:00.000Z" / "2026-05-13T17:00:00")
  if (typeof raw === "string" && raw.includes("T")) return new Date(raw);
  // Date-only string ("2026-05-13") — anchor at midnight local
  if (typeof raw === "string") return new Date(raw + "T00:00:00");
  return new Date(raw);
}

/**
 * Renders bulletins/tasks the user has long-pressed → "Pin to dashboard",
 * plus open To-Do entries marked urgent or pinned-to-dashboard. Mounted
 * on the Dashboard and the Home page. Renders nothing if there's nothing
 * to show.
 */
export default function DashboardPins() {
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: pinned = [] } = useQuery({
    queryKey: ["bulletins", "dashboard_pinned"],
    queryFn: () => base44.entities.Bulletin.filter({ dashboard_pinned: true }, "-created_date"),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  // Polls pinned via the Polls page detail view → they appear in the
  // Pinned section here so they're one tap from the Dashboard.
  const { data: pinnedPolls = [] } = useQuery({
    queryKey: ["polls", "dashboard_pinned"],
    queryFn: () => base44.entities.Poll.filter({ pinned_to_dashboard: true }, "-created_date"),
  });

  // A to-do can be pinned two ways: via the To-Do page (Task.pinned_to_dashboard)
  // or via a task-bulletin on the board (Bulletin.dashboard_pinned with the
  // task id embedded in `[task:ID]` content). When both pin paths target
  // the same task we want a single card — and we prefer the bulletin one
  // because it carries comments + the inline complete checkbox.
  const pinnedTaskIdsFromBulletins = React.useMemo(() => {
    const ids = new Set();
    for (const b of pinned) {
      const m = typeof b.content === "string" && b.content.match(/^\[task:([^:\]]+)/);
      if (m) ids.add(m[1]);
    }
    return ids;
  }, [pinned]);

  // Show every open task the user has flagged urgent OR pinned to the
  // dashboard. Skip any task that's already represented by a pinned
  // task-bulletin (de-dup). Urgent ones float to the top.
  const surfacingTasks = React.useMemo(() => {
    return tasks
      .filter(t => !t.completed && (t.is_urgent || t.pinned_to_dashboard))
      .filter(t => !pinnedTaskIdsFromBulletins.has(t.id))
      .sort((a, b) => {
        if ((a.is_urgent ? 1 : 0) !== (b.is_urgent ? 1 : 0)) return b.is_urgent ? 1 : -1;
        const ad = a.scheduled_at || a.due_date || a.created_date;
        const bd = b.scheduled_at || b.due_date || b.created_date;
        return new Date(ad) - new Date(bd);
      });
  }, [tasks, pinnedTaskIdsFromBulletins]);

  if (pinned.length === 0 && surfacingTasks.length === 0 && pinnedPolls.length === 0) return null;

  return (
    <div className="mb-3 space-y-2" data-tour="dashboard-pins">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        <Pin className="w-3 h-3" /> Pinned
      </p>

      {/* Urgent / pinned to-dos */}
      {surfacingTasks.map(t => (
        <PinnedTaskRow key={`task-${t.id}`} task={t} />
      ))}

      {/* Pinned polls (from the Polls page). Compact card with the
          question, top option, and vote count; tap deep-links into the
          Polls page detail view. */}
      {pinnedPolls.map((p) => (
        <PinnedPollRow key={`poll-${p.id}`} poll={p} />
      ))}

      {/* Pinned bulletins (and task-bulletins from the board). When a
          task-bulletin's linked Task is flagged urgent, we surface the
          urgent styling on the bulletin card itself — that way the
          de-dup case (task + bulletin both pinned) doesn't lose the
          urgent-orange visual cue. */}
      {pinned.map(b => {
        const taskMatch = b.content?.match(/^\[task:([^:\]]+)/);
        if (taskMatch) {
          const linkedTask = tasks.find(t => t.id === taskMatch[1]);
          return (
            <TaskBulletinCard
              key={b.id}
              bulletin={b}
              alters={alters}
              isUrgent={!!linkedTask?.is_urgent}
            />
          );
        }
        return <BulletinCard key={b.id} bulletin={b} alters={alters} canDelete={false} />;
      })}
    </div>
  );
}

function PinnedTaskRow({ task }) {
  const urgent = !!task.is_urgent;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickOpen, setQuickOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const longPressRef = useRef(null);
  const firedRef = useRef(false);
  const toggleComplete = async (e) => {
    e.stopPropagation();
    cancelLongPress();
    if (toggling) return;
    setToggling(true);
    try {
      await base44.entities.Task.update(task.id, { completed: !task.completed });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["pinnedTasks"] });
    } catch (err) {
      toast.error(err?.message || "Failed to update task");
    } finally {
      setToggling(false);
    }
  };
  const startLongPress = () => {
    firedRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      firedRef.current = true;
      setQuickOpen(true);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const handleClick = (e) => {
    // If a long-press just fired, suppress the navigate that the
    // implicit click would otherwise trigger.
    if (firedRef.current) {
      e.preventDefault();
      firedRef.current = false;
      return;
    }
    navigate(`/todo?id=${task.id}`);
  };
  return (
    <>
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onContextMenu={(e) => { e.preventDefault(); cancelLongPress(); setQuickOpen(true); }}
      className={`block rounded-xl p-3 transition-colors cursor-pointer select-none ${
        urgent
          ? "bg-amber-500/10 border-l-4 border-amber-500 hover:bg-amber-500/15"
          : "bg-card border border-border/50 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={toggleComplete}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className="mt-0.5 p-1 -m-1 hover:bg-muted/40 rounded transition-colors flex-shrink-0"
        >
          {task.completed ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className={`w-5 h-5 ${urgent ? "text-amber-500" : "text-muted-foreground hover:text-foreground"}`} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider font-semibold">
            {urgent ? (
              <>
                <Zap className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span className="text-amber-500">Urgent to-do</span>
              </>
            ) : (
              <>
                <Pin className="w-3 h-3 fill-primary text-primary" />
                <span className="text-muted-foreground">Pinned to-do</span>
              </>
            )}
            {task.priority === "high" && <Flag className="w-3 h-3 text-red-500 ml-1" />}
          </div>
          <div className={`text-base font-semibold mt-0.5 truncate ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</div>
          {(task.scheduled_at || task.due_date) && (
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3">
              {task.scheduled_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Scheduled {format(new Date(task.scheduled_at), "MMM d, p")}
                </span>
              )}
              {task.due_date && (
                <span>
                  Due {format(parseDueDate(task.due_date), "MMM d")}
                </span>
              )}
            </div>
          )}
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>
    </div>
    <TaskQuickActionsSheet task={task} open={quickOpen} onOpenChange={setQuickOpen} />
    </>
  );
}

function PinnedPollRow({ poll }) {
  const navigate = useNavigate();
  const totalVotes = Object.values(poll.votes || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
  // Pick a representative option for the preview line — the leading
  // option by vote count (ties broken by the option's natural order).
  let leadIdx = -1;
  let leadCount = -1;
  (poll.options || []).forEach((_, i) => {
    const c = (poll.votes?.[String(i)] || []).length;
    if (c > leadCount) { leadCount = c; leadIdx = i; }
  });
  const leadLabel = leadIdx >= 0 ? poll.options[leadIdx] : null;
  const leadPct = totalVotes > 0 && leadCount > 0 ? Math.round((leadCount / totalVotes) * 100) : 0;
  const handleClick = () => navigate(`/polls?id=${poll.id}`);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      className="block rounded-xl p-3 transition-colors cursor-pointer select-none bg-card border border-border/50 hover:bg-muted/30"
    >
      <div className="flex items-start gap-2.5">
        <BarChart2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-muted-foreground">
            <Pin className="w-3 h-3 fill-primary text-primary" />
            <span>Pinned poll</span>
            {poll.is_closed && <span className="inline-flex items-center gap-0.5 ml-1"><Lock className="w-3 h-3" /> closed</span>}
          </div>
          <div className="text-base font-semibold mt-0.5 truncate">{poll.question}</div>
          {leadLabel ? (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Leading: <span className="text-foreground">{leadLabel}</span> · {leadPct}% · {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">No votes yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
