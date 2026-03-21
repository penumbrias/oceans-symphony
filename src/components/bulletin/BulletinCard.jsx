import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Pin, Trash2, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

const REACTION_EMOJIS = ["👍", "❤️", "😊", "😂", "😢", "💜", "🔥", "⚠️"];

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

function renderContent(content, alters) {
  const altersById = Object.fromEntries(alters.map((a) => [a.name, a]));
  const parts = content.split(/(@\w[\w\s]*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const name = part.slice(1).trim();
      const alter = altersById[name];
      if (alter) {
        return (
          <Link key={i} to={`/alter/${alter.id}`}>
            <span
              className="font-semibold rounded px-0.5"
              style={{
                color: alter.color || "hsl(var(--primary))",
              }}
            >
              {part}
            </span>
          </Link>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export default function BulletinCard({ bulletin, alters, currentAlterId, canDelete }) {
  const qc = useQueryClient();
  const [showReactPicker, setShowReactPicker] = useState(false);
  const author = alters.find((a) => a.id === bulletin.author_alter_id);

  const reactions = bulletin.reactions || {};

  const handleReact = async (emoji) => {
    const existing = reactions[emoji] || [];
    let next;
    if (existing.includes(currentAlterId)) {
      next = existing.filter((id) => id !== currentAlterId);
    } else {
      next = [...existing, currentAlterId];
    }
    const newReactions = { ...reactions, [emoji]: next };
    await base44.entities.Bulletin.update(bulletin.id, { reactions: newReactions });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    setShowReactPicker(false);
  };

  const handleVote = async (optionIndex) => {
    if (!currentAlterId || !bulletin.poll) return;
    const poll = { ...bulletin.poll };
    poll.options = poll.options.map((opt, i) => {
      const votes = opt.votes || [];
      // Remove this alter from all options first, then add to selected
      return { ...opt, votes: votes.filter((id) => id !== currentAlterId) };
    });
    poll.options[optionIndex] = {
      ...poll.options[optionIndex],
      votes: [...(poll.options[optionIndex].votes || []), currentAlterId],
    };
    await base44.entities.Bulletin.update(bulletin.id, { poll });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handlePin = async () => {
    await base44.entities.Bulletin.update(bulletin.id, { is_pinned: !bulletin.is_pinned });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const handleDelete = async () => {
    await base44.entities.Bulletin.delete(bulletin.id);
    qc.invalidateQueries({ queryKey: ["bulletins"] });
  };

  const totalVotes = bulletin.poll
    ? bulletin.poll.options.reduce((s, o) => s + (o.votes?.length || 0), 0)
    : 0;

  return (
    <div className={`bg-card border rounded-2xl p-4 ${bulletin.is_pinned ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {author ? (
            <Link to={`/alter/${author.id}`}>
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
                style={{ backgroundColor: author.color || "hsl(var(--muted))" }}
              >
                {author.avatar_url ? (
                  <img src={author.avatar_url} alt={author.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4" style={{ color: getContrastColor(author.color) }} />
                )}
              </div>
            </Link>
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">
              {author?.name || "System"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(bulletin.created_date), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {bulletin.is_pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
          <button onClick={handlePin} className="text-muted-foreground hover:text-foreground p-1">
            <Pin className={`w-3.5 h-3.5 ${bulletin.is_pinned ? "text-primary" : ""}`} />
          </button>
          {canDelete && (
            <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-relaxed mb-3">
        {renderContent(bulletin.content, alters)}
      </p>

      {/* Poll */}
      {bulletin.poll && (
        <div className="bg-muted/30 rounded-xl p-3 mb-3">
          <p className="text-sm font-medium mb-2">{bulletin.poll.question}</p>
          <div className="space-y-1.5">
            {bulletin.poll.options.map((opt, i) => {
              const votes = opt.votes?.length || 0;
              const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
              const voted = currentAlterId && opt.votes?.includes(currentAlterId);
              return (
                <button
                  key={i}
                  onClick={() => handleVote(i)}
                  className={`w-full text-left rounded-lg overflow-hidden border transition-all ${
                    voted ? "border-primary/60" : "border-border/40"
                  }`}
                >
                  <div className="relative px-3 py-2">
                    <div
                      className="absolute inset-0 rounded-lg"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: voted ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted) / 0.5)",
                      }}
                    />
                    <div className="relative flex justify-between items-center">
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
            <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {/* Reactions */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {Object.entries(reactions)
          .filter(([, ids]) => ids.length > 0)
          .map(([emoji, ids]) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${
                currentAlterId && ids.includes(currentAlterId)
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/40 hover:bg-muted/50"
              }`}
            >
              {emoji} <span className="text-muted-foreground">{ids.length}</span>
            </button>
          ))}
        <div className="relative">
          <button
            onClick={() => setShowReactPicker((p) => !p)}
            className="text-xs px-2 py-1 rounded-full border border-border/40 text-muted-foreground hover:bg-muted/50 transition-all"
          >
            + React
          </button>
          {showReactPicker && (
            <div className="absolute bottom-8 left-0 z-50 bg-popover border border-border rounded-2xl shadow-xl p-2 flex gap-1.5 flex-wrap w-48">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => handleReact(e)}
                  className="text-xl hover:scale-125 transition-transform"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}