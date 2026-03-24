import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Plus, BookOpen, ChevronLeft, Calendar, BarChart2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import SectionRow from "@/components/diary/SectionRow";
import DailySectionPanel from "@/components/diary/DailySectionPanel";
import AlterSelector from "@/components/diary/AlterSelector";
import DiaryAnalytics from "@/components/diary/DiaryAnalytics";
import ExistingCardDialog from "@/components/diary/ExistingCardDialog";
import DiaryCardView from "@/components/diary/DiaryCardView";

const DEFAULT_SECTIONS = [
  { id: "emotions", emoji: "😊", title: "Emotions", subtitle: "Tap to log feelings", enabled: true },
  { id: "urges", emoji: "🆘", title: "Urges to", subtitle: "Rate the intensity", enabled: true },
  { id: "body_mind", emoji: "🌿", title: "Body + mind", subtitle: "Rate wellbeing", enabled: true },
  { id: "skills", emoji: "🧠", title: "Skills used", subtitle: "How many skills", enabled: true },
  { id: "medication", emoji: "💊", title: "Medication + safety", subtitle: "Rx meds + safety", enabled: true },
  { id: "notes", emoji: "📝", title: "Notes", subtitle: "Details + context", enabled: true },
  { id: "checklist", emoji: "🔲", title: "Symptoms Checklist", subtitle: "Symptoms, habits & more", enabled: true },
];

function getSectionSummary(section, data) {
  if (section === "emotions") {
    const e = data.emotions || [];
    return e.length ? e.slice(0, 2).join(", ") + (e.length > 2 ? ` +${e.length - 2}` : "") : "None selected";
  }
  if (section === "urges") {
    const rated = Object.values(data.urges || {}).filter((v) => v !== undefined).length;
    return rated ? `${rated} rated` : "None rated";
  }
  if (section === "body_mind") {
    const rated = Object.values(data.body_mind || {}).filter((v) => v !== undefined).length;
    return rated ? `${rated} rated` : "None rated";
  }
  if (section === "skills") {
    return data.skills_practiced !== undefined ? `${data.skills_practiced} skills` : "Not rated";
  }
  if (section === "medication") {
    const m = data.medication_safety || {};
    if (m.rx_meds_taken === undefined && m.self_harm_occurred === undefined && m.substances_count === undefined) return "Not set";
    return "Set";
  }
  if (section === "notes") {
    return data.notes?.what ? "Added" : "No notes yet";
  }
  if (section === "checklist") {
    const cl = data.checklist || {};
    const s = Object.values(cl.symptoms || {}).filter((v) => v !== undefined).length;
    const h = Object.values(cl.habits || {}).filter((v) => v !== undefined).length;
    return s + h > 0 ? `${s + h} logged` : "Not logged";
  }
  return "";
}

function getCompletion(data) {
  let filled = 0;
  if ((data.emotions || []).length > 0) filled++;
  if (Object.values(data.urges || {}).some((v) => v !== undefined)) filled++;
  if (Object.values(data.body_mind || {}).some((v) => v !== undefined)) filled++;
  if (data.skills_practiced !== undefined) filled++;
  const m = data.medication_safety || {};
  if (m.rx_meds_taken !== undefined || m.self_harm_occurred !== undefined || m.substances_count !== undefined) filled++;
  if (data.notes?.what || data.notes?.optional) filled++;
  const cl = data.checklist || {};
  if (Object.values(cl.symptoms || {}).some((v) => v !== undefined) || Object.values(cl.habits || {}).some((v) => v !== undefined)) filled++;
  return Math.round((filled / 7) * 100);
}

export default function DiaryCards() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("list"); // "list" | "new" | "entry" | "edit" | "analytics"
  const [activeSection, setActiveSection] = useState(null);
  const [entryName, setEntryName] = useState("");
  const [draftData, setDraftData] = useState({});
  const [frontingAlterIds, setFrontingAlterIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showExistingCardDialog, setShowExistingCardDialog] = useState(false);
  const [existingCardToday, setExistingCardToday] = useState(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 5),
  });

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const sections = (settingsList[0]?.diary_sections || DEFAULT_SECTIONS).filter(s => s.enabled);

  const altersById = useMemo(() =>
    Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const cardsByDate = useMemo(() => {
    const grouped = {};
    cards.forEach((card) => {
      if (!grouped[card.date]) grouped[card.date] = [];
      grouped[card.date].push(card);
    });
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [cards]);

  const handleDelete = async (cardId) => {
    if (!confirm("Delete this diary card entry?")) return;
    await base44.entities.DiaryCard.delete(cardId);
    toast.success("Diary card deleted");
    queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
    queryClient.invalidateQueries({ queryKey: ["diaryCardsToday"] });
  };

  const startNew = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const cardForToday = cards.find((c) => c.date === today);

    if (cardForToday) {
      setExistingCardToday(cardForToday);
      setShowExistingCardDialog(true);
      return;
    }

    const activeSession = sessions.find((s) => s.is_active);
    const currentIds = activeSession
      ? [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean)
      : [];
    setFrontingAlterIds(currentIds);
    setDraftData({});
    setEntryName("");
    setActiveSection(null);
    setEditingEntry(null);
    setView("new");
  };

  const proceedWithNewCard = () => {
    const activeSession = sessions.find((s) => s.is_active);
    const currentIds = activeSession
      ? [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean)
      : [];
    setFrontingAlterIds(currentIds);
    setDraftData({});
    setEntryName("");
    setActiveSection(null);
    setEditingEntry(null);
    setShowExistingCardDialog(false);
    setExistingCardToday(null);
    setView("new");
  };

  const proceedWithUpdate = () => {
    if (existingCardToday) {
      startEdit(existingCardToday);
      setShowExistingCardDialog(false);
      setExistingCardToday(null);
    }
  };

  const startEdit = (card) => {
    setEditingEntry(card);
    setDraftData(card);
    setEntryName(card.name || "");
    setFrontingAlterIds(card.fronting_alter_ids || []);
    setActiveSection(null);
    setView("edit");
  };

  const handleChange = (key, value) => {
    setDraftData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingEntry) {
      await base44.entities.DiaryCard.update(editingEntry.id, {
        name: entryName.trim() || editingEntry.name,
        fronting_alter_ids: frontingAlterIds,
        ...draftData,
      });
      toast.success("Diary card updated!");
      setEditingEntry(null);
    } else {
      await base44.entities.DiaryCard.create({
        card_type: "daily",
        date: format(new Date(), "yyyy-MM-dd"),
        name: entryName.trim() || `Daily — ${format(new Date(), "MMM d, yyyy")}`,
        fronting_alter_ids: frontingAlterIds,
        ...draftData,
      });
      toast.success("Diary card saved!");
    }
    queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
    queryClient.invalidateQueries({ queryKey: ["diaryCardsToday"] });
    setSaving(false);
    setView("list");
  };

  const completion = getCompletion(draftData);

  // ── LIST ──
  if (view === "list") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold">Diary Cards</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{cards.length} entries</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView("analytics")} className="gap-1.5">
              <BarChart2 className="w-4 h-4" />
              Analytics
            </Button>
            <Button onClick={startNew} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Plus className="w-4 h-4" />
              New Entry
            </Button>
          </div>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No diary cards yet.</p>
            <Button variant="link" onClick={startNew} className="mt-1 text-primary text-sm">
              Fill out your first daily card
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {cardsByDate.map(([date, dateCards]) => (
              <div key={date} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm text-foreground">{format(new Date(date), "EEEE, MMMM d, yyyy")}</h3>
                  <span className="text-xs text-muted-foreground ml-auto">{dateCards.length} entry{dateCards.length !== 1 ? "ies" : ""}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dateCards.map((card) => {
                    const comp = getCompletion(card);
                    const fronters = (card.fronting_alter_ids || []).map((id) => altersById[id]?.name).filter(Boolean);
                    return (
                      <div
                        key={card.id}
                        className="text-left bg-card border border-border/50 rounded-xl p-4 hover:shadow-md transition-all space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => { setViewingEntry(card); setView("entry"); }}
                            className="flex-1 text-left"
                          >
                            <p className="font-medium text-sm">{card.name || `Daily — ${card.date}`}</p>
                            {fronters.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">Fronting: {fronters.join(", ")}</p>
                            )}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(card.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${comp}%` }} />
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block ${
                          comp === 100 ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"
                        }`}>
                          {comp}%
                        </span>
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
            <h1 className="font-display text-2xl font-semibold">Diary Analytics</h1>
            <p className="text-muted-foreground text-xs">Track patterns over time</p>
          </div>
        </div>
        <DiaryAnalytics cards={cards} altersById={altersById} />
      </motion.div>
    );
  }

  // ── ENTRY VIEW ──
  if (view === "entry" && viewingEntry) {
    const card = viewingEntry;
    const fronters = (card.fronting_alter_ids || []).map((id) => altersById[id]).filter(Boolean);
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="font-display text-2xl font-semibold">{card.name}</h1>
              <p className="text-muted-foreground text-xs">{card.date}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              handleDelete(card.id);
              setView("list");
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Fronters display */}
        {fronters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fronters.map((alter) => (
              <div key={alter.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border/50 text-xs font-medium">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: alter.color || "#8b5cf6" }} />
                {alter.alias || alter.name}
              </div>
            ))}
          </div>
        )}

        <DiaryCardView card={card} altersById={altersById} sections={sections} />

        <Button onClick={() => startEdit(card)} className="w-full bg-primary hover:bg-primary/90 gap-1.5">
          Edit Card
        </Button>
      </motion.div>
    );
  }

  // ── EDIT ENTRY ──
  if (view === "edit" && editingEntry) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setView("entry")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-display text-2xl font-semibold">Edit Diary Card</h1>
            <p className="text-muted-foreground text-xs">{editingEntry.date}</p>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Completion</span>
            <span>{completion}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${completion}%` }} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Entry name</label>
          <Input value={entryName} onChange={(e) => setEntryName(e.target.value)} />
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4">
          <AlterSelector alters={alters} selected={frontingAlterIds} onChange={setFrontingAlterIds} />
        </div>

        <AnimatePresence mode="wait">
          {activeSection ? (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="bg-card border border-border/60 rounded-xl p-4"
            >
              <DailySectionPanel
                section={activeSection}
                data={draftData}
                onChange={handleChange}
                onClose={() => setActiveSection(null)}
              />
            </motion.div>
          ) : (
            <motion.div key="sections" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
               {sections.map((s) => (
                 <SectionRow
                   key={s.id}
                   emoji={s.emoji}
                   title={s.title}
                   subtitle={s.subtitle}
                   value={getSectionSummary(s.id, draftData)}
                   onClick={() => setActiveSection(s.id)}
                 />
               ))}
             </motion.div>
          )}
        </AnimatePresence>

        {!activeSection && (
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </motion.div>
    );
  }

  // ── NEW ENTRY ──
  const pageTitle = editingEntry ? "Edit Diary Card" : "Daily Diary Card";
  const pageDate = editingEntry ? editingEntry.date : format(new Date(), "MMMM d, yyyy");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => {
          if (editingEntry) setView("entry");
          else setView("list");
        }} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-semibold">{pageTitle}</h1>
          <p className="text-muted-foreground text-xs">{pageDate}</p>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Completion</span>
          <span>{completion}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${completion}%` }} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Entry name <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Input value={entryName} onChange={(e) => setEntryName(e.target.value)} placeholder={`Daily — ${format(new Date(), "MMM d, yyyy")}`} />
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <AlterSelector alters={alters} selected={frontingAlterIds} onChange={setFrontingAlterIds} />
      </div>

      <AnimatePresence mode="wait">
        {activeSection ? (
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-card border border-border/60 rounded-xl p-4"
          >
            <DailySectionPanel
              section={activeSection}
              data={draftData}
              onChange={handleChange}
              onClose={() => setActiveSection(null)}
            />
          </motion.div>
        ) : (
          <motion.div key="sections" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
             {sections.map((s) => (
               <SectionRow
                 key={s.id}
                 emoji={s.emoji}
                 title={s.title}
                 subtitle={s.subtitle}
                 value={getSectionSummary(s.id, draftData)}
                 onClick={() => setActiveSection(s.id)}
               />
             ))}
           </motion.div>
        )}
      </AnimatePresence>

      {!activeSection && (
        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? "Saving..." : editingEntry ? "Save Changes" : "Save Diary Card"}
        </Button>
      )}

      <ExistingCardDialog
        isOpen={showExistingCardDialog}
        onClose={() => {
          setShowExistingCardDialog(false);
          setExistingCardToday(null);
        }}
        onUpdate={proceedWithUpdate}
        onCreateNew={proceedWithNewCard}
        existingCard={existingCardToday}
      />
    </motion.div>
  );
}