import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AuthorsRow from "@/components/bulletin/AuthorsRow";
import BulletinCommentThread from "@/components/bulletin/BulletinCommentThread";
import { Link } from "react-router-dom";

const REACTION_EMOJIS = ["👍", "❤️", "😊", "😂", "😢", "💜", "🔥", "⚠️"];

function renderContent(content, alters) {
  const altersByName = Object.fromEntries(alters.map(a => [a.name, a]));
  const altersByAlias = Object.fromEntries(alters.filter(a => a.alias).map(a => [a.alias, a]));
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const mention = part.slice(1).trim();
      const alter = altersByName[mention] || altersByAlias[mention];
      if (alter) {
        return (
          <Link key={i} to={`/alter/${alter.id}`}>
            <span className="font-semibold rounded px-0.5" style={{ color: alter.color || "hsl(var(--primary))" }}>{part}</span>
          </Link>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export default function BulletinPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [highlightedCommentId, setHighlightedCommentId] = useState(null);
  const urlParams = new URLSearchParams(window.location.search);
  const targetCommentId = urlParams.get("commentId");

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 10),
  });

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 100),
  });

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ["bulletinComments", id],
    queryFn: () => base44.entities.BulletinComment.filter({ bulletin_id: id }, "created_date"),
  });

  // Scroll to and highlight a specific comment when navigated from search
  useEffect(() => {
    if (!targetCommentId || comments.length === 0) return;
    setHighlightedCommentId(targetCommentId);
    setTimeout(() => {
      const el = document.getElementById(`comment-${targetCommentId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const timer = setTimeout(() => setHighlightedCommentId(null), 5000);
    return () => clearTimeout(timer);
  }, [targetCommentId, comments.length]);

  const bulletin = bulletins.find(b => b.id === id);
  const activeSession = sessions.find(s => s.is_active);
  const currentAlterId = activeSession?.primary_alter_id || null;
  const frontingAlterIds = activeSession
    ? [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean)
    : [];

  if (!bulletin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-muted-foreground text-center py-10">Bulletin not found.</p>
      </div>
    );
  }

  const authorIds = bulletin.author_alter_ids?.length > 0
    ? bulletin.author_alter_ids
    : (bulletin.author_alter_id ? [bulletin.author_alter_id] : frontingAlterIds);
  const timeAgo = formatDistanceToNow(new Date(bulletin.created_date), { addSuffix: true });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to board
      </button>

      <div className="bg-card border border-border/50 rounded-2xl p-5 mb-4">
        {/* Authors */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <AuthorsRow authorIds={authorIds} fallbackIds={frontingAlterIds} alters={alters} timestamp={timeAgo} />
          {bulletin.is_pinned && <Pin className="w-4 h-4 text-primary flex-shrink-0 mt-1" />}
        </div>

        {/* Content */}
        <p className="text-sm text-foreground leading-relaxed mb-4">
          {renderContent(bulletin.content, alters)}
        </p>

        {/* Poll */}
        {bulletin.poll && (() => {
          const totalVotes = bulletin.poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0);
          return (
            <div className="bg-muted/30 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium mb-2">{bulletin.poll.question}</p>
              <div className="space-y-1.5">
                {bulletin.poll.options.map((opt, i) => {
                  const votes = opt.votes?.length || 0;
                  const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                  return (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-border/40">
                      <div className="absolute inset-0" style={{ width: `${pct}%`, backgroundColor: "hsl(var(--primary) / 0.12)" }} />
                      <div className="relative flex justify-between items-center px-3 py-2">
                        <span className="text-sm">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{pct}% · {votes}</span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">{totalVotes} total vote{totalVotes !== 1 ? "s" : ""}</p>
              </div>
            </div>
          );
        })()}

        {/* Reactions */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(bulletin.reactions || {}).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) => (
            <span key={emoji} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border/40 bg-muted/30">
              {emoji} <span className="text-muted-foreground">{ids.length}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Full thread — unlimited depth */}
      <div className="bg-card border border-border/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </h3>
        <BulletinCommentThread
          comments={comments}
          bulletinId={id}
          alters={alters}
          currentAlterId={currentAlterId}
          frontingAlterIds={frontingAlterIds}
          onRefresh={refetchComments}
          maxDepth={null}
          isFullPage={true}
          highlightedCommentId={highlightedCommentId}
        />
      </div>
    </div>
  );
}