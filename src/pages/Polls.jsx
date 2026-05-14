import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Lock, MessageSquare, Pin, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTerms } from "@/lib/useTerms";

function PollListView({ polls, alters, onSelectPoll }) {
  const terms = useTerms();
  if (!polls || polls.length === 0) {
    return (
      <div className="text-center py-16">
        <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No polls yet. Create one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {polls.map((poll) => {
        const creator = alters.find(a => a.id === poll.created_by_alter_id);
        const totalVotes = Object.values(poll.votes || {}).reduce((sum, votes) => sum + (votes?.length || 0), 0);
        
        return (
          <motion.button
            key={poll.id}
            onClick={() => onSelectPoll(poll)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full text-left p-4 rounded-xl border border-border/50 bg-card hover:bg-card/80 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground line-clamp-2 flex items-center gap-1.5">
                  {poll.pinned_to_dashboard && <Pin className="w-3.5 h-3.5 text-primary fill-primary flex-shrink-0" />}
                  <span>{poll.question}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  By {creator?.name || `${terms.System}-wide`} • {formatDistanceToNow(new Date(poll.created_date), { addSuffix: true })}
                  {poll.bulletin_id && <span className="ml-1.5"><MessageCircle className="inline w-3 h-3 mr-0.5" />from Bulletin Board</span>}
                </p>
              </div>
              {poll.is_closed && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
              {poll.is_closed && <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">Closed</span>}
            </div>

            {/* Vote distribution bar */}
            <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-muted/30">
              {poll.options.map((_, idx) => {
                const votes = poll.votes?.[idx] || [];
                const percent = totalVotes === 0 ? 0 : (votes.length / totalVotes) * 100;
                const colors = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500"];
                return (
                  <div
                    key={idx}
                    className={`${colors[idx % colors.length]} transition-all`}
                    style={{ width: `${percent}%` }}
                  />
                );
              })}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function CreatePollModal({ open, onClose, alters }) {
  const terms = useTerms();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [selectedAlter, setSelectedAlter] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleAddOption = () => {
    if (options.length < 4) {
      setOptions([...options, ""]);
    }
  };

  const handleRemoveOption = (idx) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx));
    }
  };

  const handleCreate = async () => {
    if (!question.trim()) {
      toast.error("Enter a question");
      return;
    }
    const filledOptions = options.filter(o => o.trim());
    if (filledOptions.length < 2) {
      toast.error("Enter at least 2 options");
      return;
    }

    setSaving(true);
    try {
      // Initialize votes object
      const votes = {};
      filledOptions.forEach((_, idx) => {
        votes[idx.toString()] = [];
      });

      await base44.entities.Poll.create({
        question: question.trim(),
        options: filledOptions,
        created_by_alter_id: selectedAlter || null,
        is_closed: false,
        votes,
      });
      
      toast.success("Poll created!");
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      setQuestion("");
      setOptions(["", ""]);
      setSelectedAlter("");
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to create poll");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Poll</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Question</label>
            <Input
              placeholder="What's your question?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Options</label>
            <div className="space-y-2 mt-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...options];
                      newOptions[idx] = e.target.value;
                      setOptions(newOptions);
                    }}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(idx)}
                      className="px-2 py-1 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 4 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddOption}
                className="mt-2 w-full"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Option
              </Button>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Created By <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <select
              value={selectedAlter}
              onChange={(e) => setSelectedAlter(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">{terms.System}-wide (no specific {terms.alter})</option>
              {alters.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleCreate} loading={saving} className="flex-1">Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PollDetailView({ poll, alters, onBack, onClose: onPollsClose }) {
  const terms = useTerms();
  const [selectedAlter, setSelectedAlter] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const creator = alters.find(a => a.id === poll.created_by_alter_id);

  const handleVote = async (optionIdx) => {
    if (poll.is_closed) return;

    setSaving(true);
    try {
      const newVotes = JSON.parse(JSON.stringify(poll.votes || {}));
      
      // Initialize option if needed
      if (!newVotes[optionIdx.toString()]) {
        newVotes[optionIdx.toString()] = [];
      }

      // Check if alter already voted for this option
      if (newVotes[optionIdx.toString()].includes(selectedAlter)) {
        // Unvote
        newVotes[optionIdx.toString()] = newVotes[optionIdx.toString()].filter(id => id !== selectedAlter);
      } else {
        // Remove vote from other options
        Object.keys(newVotes).forEach(key => {
          newVotes[key] = newVotes[key].filter(id => id !== selectedAlter);
        });
        // Add vote to this option
        newVotes[optionIdx.toString()].push(selectedAlter);
      }

      await base44.entities.Poll.update(poll.id, { votes: newVotes });
      queryClient.invalidateQueries({ queryKey: ["polls"] });
    } catch (e) {
      toast.error("Failed to vote");
    } finally {
      setSaving(false);
    }
  };

  const handleClosePoll = async () => {
    setSaving(true);
    try {
      await base44.entities.Poll.update(poll.id, { is_closed: true });
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      toast.success("Poll closed");
      onBack();
    } catch (e) {
      toast.error("Failed to close poll");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async () => {
    const next = !poll.pinned_to_dashboard;
    try {
      await base44.entities.Poll.update(poll.id, { pinned_to_dashboard: next });
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      queryClient.invalidateQueries({ queryKey: ["polls", "dashboard_pinned"] });
      toast.success(next ? "Pinned to dashboard" : "Unpinned from dashboard");
    } catch (e) {
      toast.error(e.message || "Failed to update pin");
    }
  };

  const totalVotes = Object.values(poll.votes || {}).reduce((sum, votes) => sum + (votes?.length || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div>
        <button onClick={onBack} className="text-primary hover:underline text-sm mb-4">← Back</button>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-xl font-display font-semibold text-foreground flex items-start gap-2">
            {poll.pinned_to_dashboard && <Pin className="w-5 h-5 text-primary fill-primary flex-shrink-0 mt-0.5" />}
            <span>{poll.question}</span>
          </h2>
          <button
            type="button"
            onClick={handleTogglePin}
            aria-label={poll.pinned_to_dashboard ? "Unpin poll from dashboard" : "Pin poll to dashboard"}
            title={poll.pinned_to_dashboard ? "Unpin from dashboard" : "Pin to dashboard"}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/40 flex-shrink-0"
          >
            <Pin className={`w-4 h-4 ${poll.pinned_to_dashboard ? "fill-primary text-primary" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          By {creator?.name || `${terms.System}-wide`} • {formatDistanceToNow(new Date(poll.created_date), { addSuffix: true })}
          {poll.bulletin_id && <span className="ml-1.5"><MessageCircle className="inline w-3 h-3 mr-0.5" />from Bulletin Board</span>}
        </p>
      </div>

      <div className="space-y-3">
        {poll.options.map((option, idx) => {
          const optionVotes = poll.votes?.[idx] || [];
          const percent = totalVotes === 0 ? 0 : (optionVotes.length / totalVotes) * 100;
          // selectedAlter may be "" (system-wide vote) — that's a valid
          // value so we don't gate on truthiness here.
          const isVotedBySelected = optionVotes.includes(selectedAlter);

          return (
            <div key={idx}>
              <button
                onClick={() => handleVote(idx)}
                disabled={poll.is_closed || saving}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  isVotedBySelected
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-card hover:border-primary/50"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <p className="font-medium text-foreground mb-2">{option}</p>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">{optionVotes.length}</p>
                </div>

                {/* Alter avatars (+ a generic chip per system-wide vote so the
                    visible count matches optionVotes.length) */}
                {optionVotes.length > 0 && (
                  <div className="flex gap-1 -space-x-2">
                    {optionVotes.map((alterId, voteIdx) => {
                      if (!alterId) {
                        return (
                          <div
                            key={`sys-${voteIdx}`}
                            className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold bg-muted text-muted-foreground"
                            title={`${terms.System}-wide vote`}
                          >
                            {(terms.System?.charAt(0) || "S").toUpperCase()}
                          </div>
                        );
                      }
                      const alter = alters.find(a => a.id === alterId);
                      if (!alter) return null;
                      return (
                        <div
                          key={alterId}
                          className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}
                          title={alter.name}
                        >
                          {alter.name.charAt(0).toUpperCase()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {!poll.is_closed && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Voting As <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <select
            value={selectedAlter}
            onChange={(e) => setSelectedAlter(e.target.value)}
            className="w-full mt-2 px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="">{terms.System}-wide (no specific {terms.alter})</option>
            {alters.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {poll.is_closed && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This poll is closed</p>
        </div>
      )}

      {/* Close button shows for the poll creator, or for anyone if the poll
          has no specific creator alter (a system-wide poll). */}
      {!poll.is_closed && (!poll.created_by_alter_id || selectedAlter === poll.created_by_alter_id) && (
        <Button
          variant="destructive"
          onClick={handleClosePoll}
          disabled={saving}
          className="w-full"
        >
          Close Poll
        </Button>
      )}
    </motion.div>
  );
}

export default function Polls() {
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const focusId = searchParams.get("id");

  const { data: polls = [], isLoading: pollsLoading } = useQuery({
    queryKey: ["polls"],
    queryFn: () => base44.entities.Poll.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const activeAlters = alters.filter(a => !a.is_archived);

  // Deep-link support: /polls?id=<pollId> auto-opens that poll's detail
  // view. Clearing the URL param when the user goes back avoids the
  // back button bouncing them into detail mode forever.
  useEffect(() => {
    if (!focusId) return;
    const target = polls.find((p) => p.id === focusId);
    if (target) setSelectedPoll(target);
  }, [focusId, polls]);

  // Keep `selectedPoll` in sync with the latest polls query so that
  // optimistic vote updates / pin toggles propagate into the detail
  // view without forcing the user to back out and re-open.
  useEffect(() => {
    if (!selectedPoll) return;
    const fresh = polls.find((p) => p.id === selectedPoll.id);
    if (fresh && fresh !== selectedPoll) setSelectedPoll(fresh);
  }, [polls, selectedPoll]);

  const handleBackToList = () => {
    setSelectedPoll(null);
    if (focusId) {
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  };

  if (pollsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-tour="polls-list" className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Polls</h1>
        <Button data-tour="polls-create" onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {selectedPoll ? (
          <div key="detail">
            <PollDetailView
              poll={selectedPoll}
              alters={activeAlters}
              onBack={handleBackToList}
              onClose={() => {}}
            />
          </div>
        ) : (
          <div key="list">
            <PollListView polls={polls} alters={activeAlters} onSelectPoll={setSelectedPoll} />
          </div>
        )}
      </AnimatePresence>

      <CreatePollModal open={showCreateModal} onClose={() => setShowCreateModal(false)} alters={activeAlters} />
    </div>
  );
}