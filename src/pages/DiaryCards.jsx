import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { BookOpen, ChevronLeft, Calendar, BarChart2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import DiaryAnalytics from "@/components/diary/DiaryAnalytics";
import DiaryCardView from "@/components/diary/DiaryCardView";
import { getActiveTemplate } from "@/lib/diaryCardTemplate";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMentionHighlight } from "@/lib/useMentionHighlight";
import React, { useState, useMemo, useEffect } from "react";

export default function DiaryCards() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("list");
  const [viewingEntry, setViewingEntry] = useState(null);
  const [searchParams] = useSearchParams();

  const { data: cards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  useMentionHighlight("id", cards.length > 0);

  const activeSections = useMemo(() => {
    const template = getActiveTemplate(settingsList[0]);
    return template.sections.filter(s => s.enabled);
  }, [settingsList]);

  function buildSummary(card) {
    const parts = [];
    if (card.emotions?.length) {
      parts.push(card.emotions.slice(0, 2).join(", ") + (card.emotions.length > 2 ? ` +${card.emotions.length - 2}` : ""));
    }
    if (card.urges && Object.values(card.urges).some(v => v !== undefined)) {
      const rated = Object.entries(card.urges).filter(([, v]) => v !== undefined).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
      parts.push(`Urges: ${rated.join(", ")}`);
    }
    if (card.body_mind && Object.values(card.body_mind).some(v => v !== undefined)) {
      const rated = Object.entries(card.body_mind).filter(([, v]) => v !== undefined).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
      parts.push(rated.join(", "));
    }
    if (card.checklist) {
      const count = [...Object.values(card.checklist.symptoms || {}), ...Object.values(card.checklist.habits || {})].filter(v => v !== undefined).length;
      if (count > 0) parts.push(`${count} symptoms/habits`);
    }
    return parts.join(" · ") || null;
  }

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);

  const cardsByDate = useMemo(() => {
    const grouped = {};
    cards.forEach(card => {
      if (!grouped[card.date]) grouped[card.date] = [];
      grouped[card.date].push(card);
    });
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [cards]);

  // Auto-open from URL param
  useEffect(() => {
    const highlightId = searchParams.get("id");
    if (highlightId && cards.length > 0) {
      const card = cards.find(c => c.id === highlightId);
      if (card) { setViewingEntry(card); setView("entry"); }
    }
  }, [searchParams, cards.length]);

  const handleDelete = async (cardId) => {
    if (!confirm("Delete this daily log entry?")) return;
    await base44.entities.DiaryCard.delete(cardId);
    toast.success("Entry deleted");
    queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
    if (viewingEntry?.id === cardId) setView("list");
  };

  // ── LIST ──
  if (view === "list") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold">Daily Log</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{cards.length} entries</p>
          </div>
          <Button variant="outline" onClick={() => setView("analytics")} className="gap-1.5">
            <BarChart2 className="w-4 h-4" /> Analytics
          </Button>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No daily log entries yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Use the Quick Check-In to start tracking your day.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {cardsByDate.map(([date, dateCards]) => (
              <div key={date} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">{format(new Date(date + "T12:00:00"), "EEEE, MMMM d, yyyy")}</h3>
                  <span className="text-xs text-muted-foreground ml-auto">{dateCards.length} entr{dateCards.length !== 1 ? "ies" : "y"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dateCards.map(card => {
                    const fronters = (card.fronting_alter_ids || []).map(id => altersById[id]).filter(Boolean);
                    const summary = buildSummary(card);
                    return (
                      <div key={card.id} id={`item-${card.id}`}
                        className="bg-card border rounded-xl p-4 hover:shadow-md transition-all border-border/50">
                        <div className="flex items-start justify-between gap-2">
                          <button onClick={() => { setViewingEntry(card); setView("entry"); }} className="flex-1 text-left space-y-1.5">
                            <p className="font-medium text-sm">{card.name || `Daily — ${card.date}`}</p>
                            {fronters.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {fronters.map(alter => (
                                  <span key={alter.id} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-muted border border-border/50">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: alter.color || "#8b5cf6" }} />
                                    {alter.alias || alter.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {summary && (
                              <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
                            )}
                          </button>
                          <Button variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                            onClick={e => { e.stopPropagation(); handleDelete(card.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── ANALYTICS ──
  if (view === "analytics") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-display text-2xl font-semibold">Log Analytics</h1>
            <p className="text-muted-foreground text-xs">Track patterns over time</p>
          </div>
        </div>
        <DiaryAnalytics cards={cards} altersById={altersById} />
      </motion.div>
    );
  }

  // ── ENTRY VIEW (read-only) ──
  if (view === "entry" && viewingEntry) {
    const card = viewingEntry;
    const fronters = (card.fronting_alter_ids || []).map(id => altersById[id]).filter(Boolean);
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="font-display text-2xl font-semibold">{card.name || `Daily — ${card.date}`}</h1>
              <p className="text-muted-foreground text-xs">{card.date}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => { handleDelete(card.id); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        {fronters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fronters.map(alter => (
              <div key={alter.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border/50 text-xs font-medium">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: alter.color || "#8b5cf6" }} />
                {alter.alias || alter.name}
              </div>
            ))}
          </div>
        )}
        <DiaryCardView card={card} altersById={altersById} sections={activeSections} />
      </motion.div>
    );
  }

  return null;
}