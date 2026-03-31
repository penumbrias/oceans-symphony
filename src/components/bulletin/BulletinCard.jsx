import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Pin, Trash2, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate, Link } from "react-router-dom";
import AuthorsRow from "./AuthorsRow";
import BulletinCommentThread from "./BulletinCommentThread";

const REACTION_EMOJIS = ["👍", "❤️", "😊", "😂", "😢", "💜", "🔥", "⚠️"];

function renderContent(content, alters) {
  const altersByName = Object.fromEntries(alters.map((a) => [a.name, a]));
  const altersByAlias = Object.fromEntries(alters.filter((a) => a.alias).map((a) => [a.alias, a]));
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const mention = part.slice(1).trim();
      const alter = altersByName[mention] || altersByAlias[mention];
      if (alter) {
        return (
          <Link key={i} to={`/alter/${alter.id}`}>
            <span className="font-semibold rounded px-0.5" style={{ color: alter.color || "hsl(var(--primary))" }}>
              {part}
            </span>
          </Link>);

      }
    }
    return <span key={i}>{part}</span>;
  });
}

export default function BulletinCard({ bulletin, alters, currentAlterId, frontingAlterIds = [], canDelete, highlight }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showReactPicker, setShowReactPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [lastTap, setLastTap] = useState(0);

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ["bulletinComments", bulletin.id],
    queryFn: () => base44.entities.BulletinComment.filter({ bulletin_id: bulletin.id }, "created_date"),
    enabled: showComments
  });

  const reactions = bulletin.reactions || {};
  const authorIds = bulletin.author_alter_ids?.length > 0 ?
  bulletin.author_alter_ids :
  bulletin.author_alter_id ? [bulletin.author_alter_id] : frontingAlterIds;

const rawDate = bulletin.created_date;
const timeAgo = formatDistanceToNow(new Date(rawDate.endsWith("Z") ? rawDate : rawDate + "Z"), { addSuffix: true });

  const handleReact = async (emoji) => {
    if (!currentAlterId) return;
    const existing = reactions[emoji] || [];
    const next = existing.includes(currentAlterId) ?
    existing.filter((id) => id !== currentAlterId) :
    [...existing, currentAlterId];
    const newReactions = { ...reactions, [emoji]: next };
    // Optimistic update
    qc.setQueriesData({ queryKey: ["bulletins"] }, (old) =>
    Array.isArray(old) ? old.map((b) => b.id === bulletin.id ? { ...b, reactions: newReactions } : b) : old
    );
    setShowReactPicker(false);
    await base44.entities.Bulletin.update(bulletin.id, { reactions: newReactions });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handleVote = async (optionIndex) => {
    if (!currentAlterId || !bulletin.poll) return;
    const poll = { ...bulletin.poll };
    poll.options = poll.options.map((opt) => ({ ...opt, votes: (opt.votes || []).filter((id) => id !== currentAlterId) }));
    poll.options[optionIndex] = { ...poll.options[optionIndex], votes: [...(poll.options[optionIndex].votes || []), currentAlterId] };
    // Optimistic update
    qc.setQueriesData({ queryKey: ["bulletins"] }, (old) =>
    Array.isArray(old) ? old.map((b) => b.id === bulletin.id ? { ...b, poll } : b) : old
    );
    await base44.entities.Bulletin.update(bulletin.id, { poll });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handlePin = async () => {
    const newPinned = !bulletin.is_pinned;
    qc.setQueriesData({ queryKey: ["bulletins"] }, (old) =>
    Array.isArray(old) ? old.map((b) => b.id === bulletin.id ? { ...b, is_pinned: newPinned } : b) : old
    );
    await base44.entities.Bulletin.update(bulletin.id, { is_pinned: newPinned });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handleDelete = async () => {
    // Optimistic removal
    qc.setQueriesData({ queryKey: ["bulletins"] }, (old) =>
    Array.isArray(old) ? old.filter((b) => b.id !== bulletin.id) : old
    );
    await base44.entities.Bulletin.delete(bulletin.id);
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handleClick = () => {
    const now = Date.now();
    if (now - lastTap < 350) {
      navigate(`/bulletin/${bulletin.id}`);
    }
    setLastTap(now);
  };

  const totalVotes = bulletin.poll ?
  bulletin.poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0) :
  0;

  return (
    <div className="bg-card px-4 py-2 rounded-2xl border transition-all duration-700 cursor-pointer border-border/50"




    onClick={handleClick}>
      
      {/* Header: Authors */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <AuthorsRow authorIds={authorIds} fallbackIds={frontingAlterIds} alters={alters} timestamp={timeAgo} />
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {bulletin.is_pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
          <button onClick={handlePin} aria-label={bulletin.is_pinned ? "Unpin bulletin" : "Pin bulletin"} className="text-muted-foreground hover:text-foreground p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg">
            <Pin className={`w-3.5 h-3.5 ${bulletin.is_pinned ? "text-primary" : ""}`} />
          </button>
          {canDelete &&
          <button onClick={handleDelete} aria-label="Delete bulletin" className="text-muted-foreground hover:text-destructive p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          }
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-relaxed mb-3" onClick={(e) => e.stopPropagation()}>
        {renderContent(bulletin.content, alters)}
      </p>

      {/* Poll */}
      {bulletin.poll &&
      <div className="bg-muted/30 rounded-xl p-3 mb-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-medium mb-2">{bulletin.poll.question}</p>
          <div className="space-y-1.5">
            {bulletin.poll.options.map((opt, i) => {
            const votes = opt.votes?.length || 0;
            const pct = totalVotes > 0 ? Math.round(votes / totalVotes * 100) : 0;
            const voted = currentAlterId && opt.votes?.includes(currentAlterId);
            return (
              <button key={i} onClick={() => handleVote(i)}
              className={`w-full text-left rounded-lg overflow-hidden border transition-all ${voted ? "border-primary/60" : "border-border/40"}`}>
                  <div className="relative px-3 py-2">
                    <div className="absolute inset-0 rounded-lg" style={{ width: `${pct}%`, backgroundColor: voted ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted) / 0.5)" }} />
                    <div className="relative flex justify-between items-center">
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                </button>);

          })}
            <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
          </div>
        </div>
      }

      {/* Reactions + comment toggle */}
      <div className="flex flex-wrap gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
        {Object.entries(reactions).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) =>
        <button key={emoji} onClick={() => handleReact(emoji)}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${
        currentAlterId && ids.includes(currentAlterId) ? "border-primary/50 bg-primary/10" : "border-border/40 hover:bg-muted/50"}`
        }>
            {emoji} <span className="text-muted-foreground">{ids.length}</span>
          </button>
        )}
        <div className="relative">
          <button onClick={() => setShowReactPicker((p) => !p)}
          className="text-xs px-2 py-1 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50">
            + React
          </button>
          {showReactPicker &&
          <div className="absolute bottom-8 left-0 z-50 bg-popover border border-border rounded-2xl shadow-xl p-2 flex gap-1.5 flex-wrap w-48">
              {REACTION_EMOJIS.map((e) =>
            <button key={e} onClick={() => handleReact(e)} className="text-xl hover:scale-125 transition-transform">{e}</button>
            )}
            </div>
          }
        </div>
        <button
          onClick={() => {setShowComments((p) => !p);}}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50">
          
          <MessageCircle className="w-3.5 h-3.5" />
          {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Comments
        </button>
      </div>

      {/* Comment thread */}
      {showComments &&
      <div className="mt-3 pt-3 border-t border-border/30" onClick={(e) => e.stopPropagation()}>
          <BulletinCommentThread
          comments={comments}
          bulletinId={bulletin.id}
          alters={alters}
          currentAlterId={currentAlterId}
          frontingAlterIds={frontingAlterIds}
          onRefresh={refetchComments}
          maxDepth={2}
          isFullPage={false} />
        
        </div>
      }
    </div>);

}