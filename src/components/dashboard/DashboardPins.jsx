import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Pin, Zap, Flag, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import BulletinCard from "@/components/bulletin/BulletinCard";
import TaskBulletinCard from "@/components/bulletin/TaskBulletinCard";

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

  // Show every open task the user has flagged urgent OR pinned to the
  // dashboard. Urgent ones float to the top.
  const surfacingTasks = React.useMemo(() => {
    return tasks
      .filter(t => !t.completed && (t.is_urgent || t.pinned_to_dashboard))
      .sort((a, b) => {
        if ((a.is_urgent ? 1 : 0) !== (b.is_urgent ? 1 : 0)) return b.is_urgent ? 1 : -1;
        const ad = a.scheduled_at || a.due_date || a.created_date;
        const bd = b.scheduled_at || b.due_date || b.created_date;
        return new Date(ad) - new Date(bd);
      });
  }, [tasks]);

  if (pinned.length === 0 && surfacingTasks.length === 0) return null;

  return (
    <div className="mb-3 space-y-2" data-tour="dashboard-pins">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        <Pin className="w-3 h-3" /> Pinned
      </p>

      {/* Urgent / pinned to-dos */}
      {surfacingTasks.map(t => (
        <PinnedTaskRow key={`task-${t.id}`} task={t} />
      ))}

      {/* Pinned bulletins (and task-bulletins from the board) */}
      {pinned.map(b => (
        b.content?.match(/^\[task:/)
          ? <TaskBulletinCard key={b.id} bulletin={b} alters={alters} />
          : <BulletinCard key={b.id} bulletin={b} alters={alters} canDelete={false} />
      ))}
    </div>
  );
}

function PinnedTaskRow({ task }) {
  const urgent = !!task.is_urgent;
  return (
    <Link
      to={`/todo?id=${task.id}`}
      className={`block rounded-xl p-3 transition-colors ${
        urgent
          ? "bg-amber-500/10 border-l-4 border-amber-500 hover:bg-amber-500/15"
          : "bg-card border border-border/50 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold">
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
          <div className="text-base font-semibold mt-0.5 truncate">{task.title}</div>
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
                  Due {format(new Date(task.due_date + "T00:00:00"), "MMM d")}
                </span>
              )}
            </div>
          )}
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
