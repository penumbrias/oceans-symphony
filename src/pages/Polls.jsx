import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Lock, MessageSquare, Trophy } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const OPTION_COLORS = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500"];
const OPTION_TEXT_COLORS = ["text-blue-600 dark:text-blue-400", "text-purple-600 dark:text-purple-400", "text-pink-600 dark:text-pink-400", "text-cyan-600 dark:text-cyan-400"];
const OPTION_BG_LIGHT = ["bg-blue-500/10", "bg-purple-500/10", "bg-pink-500/10", "bg-cyan-500/10"];

function PollListView({ polls, alters, onSelectPoll }) {
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
        
        // Find the winning option(s)
        const voteCounts = poll.options.map((opt, idx) => ({ opt, idx, count: (poll.votes?.[idx] || []).length }));
        const maxVotes = Math.max(...voteCounts.map(v => v.count));
        const winners = maxVotes > 0 ? voteCounts.filter(v => v.count === maxVotes) : [];

        return (
          <motion.button
            key={poll.id}
            onClick={() => onSelectPoll(poll)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full text-left p-4 rounded-xl border border-border/50 bg-card hover:bg-card/80 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground line-clamp-2">{poll.question}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  By {creator?.name || "Unknown"} • {formatDistanceToNow(new Date(poll.created_date), { addSuffix: true })}
                </p>
              </div>
              {poll.is_closed && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />}
            </div>

            {/* Options with bars */}
            <div className="space-y-1.5 mb-2">
              {poll.options.map((option, idx) => {
                const count = poll.votes?.[idx]?.length || 0;
                const percent = totalVotes === 0 ? 0 : (count / totalVotes) * 100;
                const isWinner = maxVotes > 0 && count === maxVotes;
                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs font-medium truncate flex-1 mr-2 ${isWinner ? OPTION_TEXT_COLORS[idx % OPTION_TEXT_COLORS.length] : "text-muted-foreground"}`}>
                        {isWinner && <Trophy className="w-3 h-3 inline mr-1 mb-0.5" />}
                        {option}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={`h-full ${OPTION_COLORS[idx % OPTION_COLORS.length]} transition-all ${isWinner ? "opacity-100" : "opacity-40"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
              {poll.is_closed && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Closed</span>}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function CreatePollModal({ open, onClose, alters }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
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
      const votes = {};
      filledOptions.forEach((_, idx) => { votes[idx.toString()] = []; });

      await base44.entities.Poll.create({
        question: question.trim(),
        options: filledOptions,
        created_by_alter_id: "",
        is_closed: false,
        votes,
      });
      
      toast.success("Poll created!");
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      setQuestion("");
      setOptions(["", ""]);
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

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleCreate} loading={saving} className="flex-1">Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PollDetailView({ poll, alters, onBack, currentFronterIds = [] }) {
  const [selectedAlterIds, setSelectedAlterIds] = useState(() => currentFronterIds.filter(Boolean));
  const [alterInput, setAlterInput] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const creator = alters.find(a => a.id === poll.created_by_alter_id);

  const filteredAlters = useMemo(() => {
    if (!alterInput.trim()) return [];
    return alters.filter(
      a => !selectedAlterIds.includes(a.id) &&
        (a.name.toLowerCase().includes(alterInput.toLowerCase()) ||
         a.alias?.toLowerCase().includes(alterInput.toLowerCase()))
    );
  }, [alterInput, alters, selectedAlterIds]);

  const handleVote = async (optionIdx) => {
    if (selectedAlterIds.length === 0) {
      toast.error("Select who is voting first");
      return;
    }
    if (poll.is_closed) return;

    setSaving(true);
    try {
      const newVotes = JSON.parse(JSON.stringify(poll.votes || {}));
      
      poll.options.forEach((_, idx) => {
        if (!newVotes[idx.toString()]) newVotes[idx.toString()] = [];
      });

      // For each selected alter, toggle their vote on this option
      for (const alterId of selectedAlterIds) {
        const alreadyVoted = newVotes[optionIdx.toString()].includes(alterId);
        if (alreadyVoted) {
          newVotes[optionIdx.toString()] = newVotes[optionIdx.toString()].filter(id => id !== alterId);
        } else {
          // Remove from other options first
          Object.keys(newVotes).forEach(key => {
            newVotes[key] = newVotes[key].filter(id => id !== alterId);
          });
          newVotes[optionIdx.toString()].push(alterId);
        }
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
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">{poll.question}</h2>
        <p className="text-xs text-muted-foreground">
          By {creator?.name || "Unknown"} • {formatDistanceToNow(new Date(poll.created_date), { addSuffix: true })}
        </p>
      </div>

      <div className="space-y-3">
        {poll.options.map((option, idx) => {
          const optionVotes = poll.votes?.[idx] || [];
          const percent = totalVotes === 0 ? 0 : (optionVotes.length / totalVotes) * 100;
          const isVotedBySelected = selectedAlterIds.length > 0 && selectedAlterIds.some(id => optionVotes.includes(id));

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

                {optionVotes.length > 0 && (
                  <div className="flex gap-1 -space-x-2">
                    {optionVotes.map((alterId) => {
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
        <div className="border border-border/50 rounded-xl p-3 space-y-2">
          <p className="text-sm font-medium">Voting as <span className="text-muted-foreground font-normal">(optional)</span></p>
          <div className="relative">
            <input
              type="text"
              placeholder="Type alter name..."
              value={alterInput}
              onChange={e => setAlterInput(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            {filteredAlters.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
                {filteredAlters.map(alter => (
                  <button key={alter.id} onClick={() => { setSelectedAlterIds(prev => [...prev, alter.id]); setAlterInput(""); }}
                    className="w-full text-left p-2 hover:bg-muted flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: alter.color || "#8b5cf6" }}>
                      {alter.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{alter.name}</p>
                      {alter.alias && <p className="text-xs text-muted-foreground">{alter.alias}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedAlterIds.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {selectedAlterIds.map(alterId => {
                const alter = alters.find(a => a.id === alterId);
                if (!alter) return null;
                return (
                  <div key={alterId} className="relative group">
                    <div className="aspect-square rounded-lg bg-muted overflow-hidden">
                      {alter.avatar_url
                        ? <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"
                            style={{ backgroundColor: alter.color ? `${alter.color}30` : "hsl(var(--muted))" }}>
                            <span className="text-xs font-bold" style={{ color: alter.color || "hsl(var(--primary))" }}>
                              {alter.name?.charAt(0)}
                            </span>
                          </div>
                      }
                    </div>
                    <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <button onClick={() => setSelectedAlterIds(prev => prev.filter(id => id !== alterId))}
                        className="bg-destructive text-destructive-foreground rounded-full p-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xs font-medium text-center mt-1 truncate">{alter.alias || alter.name}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {poll.is_closed && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This poll is closed</p>
        </div>
      )}

      {creator?.id && selectedAlterIds.includes(creator.id) && !poll.is_closed && (
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

  const { data: polls = [], isLoading: pollsLoading } = useQuery({
    queryKey: ["polls"],
    queryFn: () => base44.entities.Poll.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  const currentFronterIds = useMemo(() => {
    return sessions.filter(s => s.alter_id).map(s => s.alter_id);
  }, [sessions]);

  const activeAlters = alters.filter(a => !a.is_archived);

  if (pollsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-foreground">Polls</h1>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {selectedPoll ? (
          <div key="detail">
            <PollDetailView
              poll={selectedPoll}
              alters={activeAlters}
              onBack={() => setSelectedPoll(null)}
              currentFronterIds={currentFronterIds}
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