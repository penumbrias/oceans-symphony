import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Pin, ExternalLink, Lock, Minus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { markPollVotedToday } from "@/lib/dailyTaskSystem";

/**
 * A standalone votable poll card rendered in the Bulletin Board's
 * Pinned section. Used for polls that were created on the Polls page
 * (no source bulletin) but are flagged `pinned_to_dashboard`. Polls
 * that originated from a bulletin already surface here via their
 * pinned bulletin's BulletinCard, so we deliberately don't render
 * them twice.
 */
export default function PinnedPollCard({ poll, currentAlterId }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const voterId = currentAlterId || "";

  const totalVotes = Object.values(poll.votes || {}).reduce(
    (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
    0
  );

  const handleVote = async (optionIndex) => {
    if (poll.is_closed) return;
    const key = String(optionIndex);
    const newVotes = JSON.parse(JSON.stringify(poll.votes || {}));
    if (!newVotes[key]) newVotes[key] = [];
    if (poll.tally_mode) {
      newVotes[key].push("");
    } else if (newVotes[key].includes(voterId)) {
      newVotes[key] = newVotes[key].filter((id) => id !== voterId);
    } else {
      Object.keys(newVotes).forEach((k) => {
        newVotes[k] = newVotes[k].filter((id) => id !== voterId);
      });
      newVotes[key].push(voterId);
    }
    qc.setQueriesData({ queryKey: ["polls"] }, (old) =>
      Array.isArray(old)
        ? old.map((p) => (p.id === poll.id ? { ...p, votes: newVotes } : p))
        : old
    );
    await base44.entities.Poll.update(poll.id, { votes: newVotes });
    markPollVotedToday();
    qc.invalidateQueries({ queryKey: ["polls"] });
  };

  const handleDecrement = async (optionIndex, e) => {
    if (e) e.stopPropagation();
    if (poll.is_closed) return;
    const key = String(optionIndex);
    const newVotes = JSON.parse(JSON.stringify(poll.votes || {}));
    if (!newVotes[key] || newVotes[key].length === 0) return;
    const lastAnon = newVotes[key].lastIndexOf("");
    if (lastAnon >= 0) newVotes[key].splice(lastAnon, 1);
    else newVotes[key].pop();
    qc.setQueriesData({ queryKey: ["polls"] }, (old) =>
      Array.isArray(old)
        ? old.map((p) => (p.id === poll.id ? { ...p, votes: newVotes } : p))
        : old
    );
    await base44.entities.Poll.update(poll.id, { votes: newVotes });
    qc.invalidateQueries({ queryKey: ["polls"] });
  };

  const handleUnpin = async (e) => {
    e.stopPropagation();
    try {
      await base44.entities.Poll.update(poll.id, { pinned_to_dashboard: false });
      qc.invalidateQueries({ queryKey: ["polls"] });
      toast.success("Unpinned from Bulletin Board");
    } catch (err) {
      toast.error(err?.message || "Failed to unpin");
    }
  };

  const handleOpen = (e) => {
    e.stopPropagation();
    navigate(`/polls?id=${poll.id}`);
  };

  return (
    <div className="bg-card px-4 py-3 rounded-2xl border border-border/50">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-muted-foreground">
          <Pin className="w-3 h-3 fill-primary text-primary" />
          <span>Pinned poll · from Polls page</span>
          {poll.is_closed && (
            <span className="inline-flex items-center gap-0.5 ml-1">
              <Lock className="w-3 h-3" /> closed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={handleOpen}
            aria-label="Open poll in Polls page"
            title="Open in Polls page"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleUnpin}
            aria-label="Unpin poll from Bulletin Board"
            title="Unpin"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded"
          >
            <Pin className="w-3.5 h-3.5 fill-primary text-primary" />
          </button>
        </div>
      </div>

      <p className="text-sm font-medium mb-2">{poll.question}</p>

      <div className="space-y-1.5">
        {(poll.options || []).map((label, i) => {
          const optionVotes = (poll.votes || {})[String(i)] || [];
          const votes = optionVotes.length;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const voted = !poll.tally_mode && optionVotes.includes(voterId);
          return (
            <div key={i} className="flex items-stretch gap-1.5">
              <button
                onClick={() => handleVote(i)}
                disabled={poll.is_closed}
                className={`flex-1 text-left rounded-lg overflow-hidden border transition-all ${
                  voted ? "border-primary/60" : "border-border/40"
                } ${poll.is_closed ? "opacity-70 cursor-default" : ""}`}
              >
                <div className="relative px-3 py-2">
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: voted
                        ? "hsl(var(--primary) / 0.15)"
                        : "hsl(var(--muted) / 0.5)",
                    }}
                  />
                  <div className="relative flex justify-between items-center">
                    <span className="text-sm">{label}</span>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                </div>
              </button>
              {poll.tally_mode && !poll.is_closed && (
                <button
                  type="button"
                  onClick={(e) => handleDecrement(i, e)}
                  disabled={optionVotes.length === 0}
                  aria-label={`Decrement ${label} count`}
                  title="Subtract one"
                  className="px-2 rounded-lg border border-border/40 text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
          {poll.tally_mode ? " · tally mode" : ""}
        </p>
      </div>
    </div>
  );
}
