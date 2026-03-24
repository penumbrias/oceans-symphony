import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PenLine, Bell, Search, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import BulletinCard from "./BulletinCard";
import BulletinComposer from "./BulletinComposer";
import MentionAlertBanner from "./MentionAlertBanner";

export default function BulletinBoard({ alters, currentAlterId, highlightBulletinId }) {
  const [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const bulletinRefs = useRef({});
  const [replyingTo, setReplyingTo] = useState(null);
  const observerTarget = useRef(null);
  const queryClient = useQueryClient();

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 100),
  });

  useEffect(() => {
    if (!highlightBulletinId || bulletins.length === 0) return;
    const idx = bulletins.findIndex((b) => b.id === highlightBulletinId);
    if (idx !== -1) setVisibleCount((v) => Math.max(v, idx + 5));
    setTimeout(() => {
      bulletinRefs.current[highlightBulletinId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [highlightBulletinId, bulletins.length]);
  
  // Intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < filteredRecent.length) {
        setVisibleCount((prev) => Math.min(prev + 5, filteredRecent.length));
      }
    }, { threshold: 0.1 });
    
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [visibleCount]);
  
  const filteredBulletins = bulletins.filter((b) =>
    b.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinned = filteredBulletins.filter((b) => b.is_pinned);
  const filteredRecent = filteredBulletins.filter((b) => !b.is_pinned);

  const unreadCount = filteredBulletins.filter(
    (b) =>
      currentAlterId &&
      b.mentioned_alter_ids?.includes(currentAlterId) &&
      !b.read_by_alter_ids?.includes(currentAlterId)
  ).length;
  
  const handleReply = async (bulletin) => {
    const preview = bulletin.content.substring(0, 100) + (bulletin.content.length > 100 ? "..." : "");
    const replyContent = `> ${preview}\n\n@${alters.find(a => a.id === bulletin.author_alter_id)?.name || "System"}: `;
    
    await base44.entities.Bulletin.create({
      author_alter_id: currentAlterId,
      content: replyContent,
      mentioned_alter_ids: [bulletin.author_alter_id],
    });
    
    queryClient.invalidateQueries({ queryKey: ["bulletins"] });
    setReplyingTo(null);
  };

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-foreground text-base">Bulletin Board</h2>
        <button
          onClick={() => setComposing((p) => !p)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <PenLine className="w-3.5 h-3.5" />
          Post
        </button>
      </div>
      
      {/* Search and unread */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bulletins..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(10);
            }}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {unreadCount > 0 && (
          <span className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full font-medium whitespace-nowrap">
            <Bell className="w-3 h-3" />
            {unreadCount}
          </span>
        )}
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
            <div key={b.id} ref={(el) => (bulletinRefs.current[b.id] = el)}>
              <BulletinCard
                bulletin={b}
                alters={alters}
                currentAlterId={currentAlterId}
                canDelete
                highlight={highlightBulletinId === b.id}
              />
            </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      {filteredRecent.length > 0 && (
       <div>
         {pinned.length > 0 && (
           <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
         )}
         <div className="space-y-3">
           {filteredRecent.slice(0, visibleCount).map((b) => (
              <div key={b.id} ref={(el) => (bulletinRefs.current[b.id] = el)}>
                <BulletinCard
                  bulletin={b}
                  alters={alters}
                  currentAlterId={currentAlterId}
                  canDelete
                  highlight={highlightBulletinId === b.id}
                  />
                  </div>
                  ))}
                  </div>
         {visibleCount < filteredRecent.length && (
           <div ref={observerTarget} className="py-4 text-center">
             <p className="text-xs text-muted-foreground">Loading more...</p>
           </div>
         )}
       </div>
      )}

      {filteredBulletins.length === 0 && !composing && searchQuery && (
       <div className="text-center py-10">
         <p className="text-muted-foreground text-sm">No bulletins match your search</p>
       </div>
      )}

      {bulletins.length === 0 && !composing && !searchQuery && (
       <div className="text-center py-10">
         <p className="text-muted-foreground text-sm">No bulletins yet. Be the first to post!</p>
       </div>
      )}
    </div>
  );
}