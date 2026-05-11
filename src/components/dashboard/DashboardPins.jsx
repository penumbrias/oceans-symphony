import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import BulletinCard from "@/components/bulletin/BulletinCard";
import TaskBulletinCard from "@/components/bulletin/TaskBulletinCard";

/**
 * Renders bulletins/tasks the user has long-pressed → "Pin to dashboard".
 * Mounted on the Home page between Currently Fronting and the alters grid.
 * Renders nothing if no records have dashboard_pinned: true.
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

  if (pinned.length === 0) return null;

  return (
    <div className="mb-3 space-y-2" data-tour="dashboard-pins">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        <Pin className="w-3 h-3" /> Pinned
      </p>
      {pinned.map(b => (
        b.content?.match(/^\[task:/)
          ? <TaskBulletinCard key={b.id} bulletin={b} alters={alters} />
          : <BulletinCard key={b.id} bulletin={b} alters={alters} canDelete={false} />
      ))}
    </div>
  );
}
