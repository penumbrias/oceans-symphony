import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Pin, PenLine, Bell } from "lucide-react";
import BulletinCard from "./BulletinCard";
import BulletinComposer from "./BulletinComposer";
import MentionAlertBanner from "./MentionAlertBanner";

export default function BulletinBoard({ alters, currentAlterId }) {
  const [composing, setComposing] = useState(false);

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 50),
  });

  const pinned = bulletins.filter((b) => b.is_pinned);
  const recent = bulletins.filter((b) => !b.is_pinned);

  const unreadCount = bulletins.filter(
    (b) =>
      currentAlterId &&
      b.mentioned_alter_ids?.includes(currentAlterId) &&
      !b.read_by_alter_ids?.includes(currentAlterId)
  ).length;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground text-base">Bulletin Board</h2>
          {unreadCount > 0 && (
            <span className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
              <Bell className="w-3 h-3" />
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setComposing((p) => !p)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <PenLine className="w-3.5 h-3.5" />
          Post
        </button>
      </div>

      {/* Mention alert banner */}
      {currentAlterId && (
        <MentionAlertBanner
          bulletins={bulletins}
          currentAlterId={currentAlterId}
          alters={alters}
        />
      )}

      {/* Composer */}
      {composing && (
        <div className="mb-4">
          <BulletinComposer
            alters={alters}
            authorAlterId={currentAlterId}
            onClose={() => setComposing(false)}
          />
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Pin className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Pinned</p>
          </div>
          <div className="space-y-3">
            {pinned.map((b) => (
              <BulletinCard
                key={b.id}
                bulletin={b}
                alters={alters}
                currentAlterId={currentAlterId}
                canDelete
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <div>
          {pinned.length > 0 && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
          )}
          <div className="space-y-3">
            {recent.slice(0, 10).map((b) => (
              <BulletinCard
                key={b.id}
                bulletin={b}
                alters={alters}
                currentAlterId={currentAlterId}
                canDelete
              />
            ))}
          </div>
        </div>
      )}

      {bulletins.length === 0 && !composing && (
        <div className="text-center py-10">
          <p className="text-muted-foreground text-sm">No bulletins yet. Be the first to post!</p>
        </div>
      )}
    </div>
  );
}