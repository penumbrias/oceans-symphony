import React, { useState, useRef, useEffect } from "react";
import { Search, Plus, ArrowDownAZ, ArrowUpAZ, Loader2, Minus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const TABS = ["symptom", "habit"];
const TAB_LABELS = { symptom: "Symptoms", habit: "Habits" };

// Exported so QuickCheckInModal can collect at save time
export default function SymptomsSection({ onCheckInsReady }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("symptom");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("boolean");
  const [adding, setAdding] = useState(false);
  // { [symptomId]: { checked: bool, severity: number|null } }
  const [cardStates, setCardStates] = useState({});
  const newInputRef = useRef(null);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list()
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true })
  });

  const visible = symptoms.
  filter((s) => !s.is_archived && s.category === activeTab &&
  (s.label || "").toLowerCase().includes(search.toLowerCase())).
  sort((a, b) => {
    const cmp = (a.label || "").localeCompare(b.label || "");
    return sortAsc ? cmp : -cmp;
  });

  const getSession = (id) => activeSessions.find((s) => s.symptom_id === id) || null;

  const setCard = (id, checked, severity) =>
  setCardStates((prev) => ({ ...prev, [id]: { checked, severity } }));

  // Provide getter to parent
  useEffect(() => {
    onCheckInsReady?.(() =>
    Object.entries(cardStates).
    filter(([, s]) => s.checked).
    map(([symptom_id, s]) => ({ symptom_id, severity: s.severity ?? null }))
    );
  });

  const handleAddNew = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await base44.entities.Symptom.create({
        label: newName.trim(),
        category: activeTab,
        type: newType,
        is_positive: activeTab === "habit",
        is_default: false,
        is_archived: false,
        order: 999
      });
      queryClient.invalidateQueries({ queryKey: ["symptoms"] });
      setNewName("");setAddingNew(false);
      toast.success("Added!");
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {TABS.map((tab) =>
        <button key={tab} onClick={() => setActiveTab(tab)}
        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
        activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`
        }>
            {TAB_LABELS[tab]}
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${TAB_LABELS[activeTab].toLowerCase()}...`} className="bg-transparent pr-3 pl-8 py-1.5 text-sm rounded-lg w-full border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary" />
          
        </div>
        <button onClick={() => setSortAsc(!sortAsc)}
        className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 text-muted-foreground" title={sortAsc ? "A→Z" : "Z→A"}>
          {sortAsc ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
        </button>
        <button onClick={() => {setAddingNew(true);setTimeout(() => newInputRef.current?.focus(), 50);}}
        className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 text-muted-foreground" title="Add new">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Add new inline */}
      {addingNew &&
      <div className="space-y-2">
          <div className="flex gap-2">
            <input ref={newInputRef} value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {if (e.key === "Enter") handleAddNew();if (e.key === "Escape") {setAddingNew(false);setNewName("");}}}
          placeholder={`New ${TAB_LABELS[activeTab].toLowerCase()} name...`}
          className="flex-1 px-3 py-1.5 text-sm bg-muted/40 border border-primary/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
          className="px-2 py-1.5 text-xs bg-muted/40 border border-border/50 rounded-lg focus:outline-none">
              <option value="boolean">Yes/No</option>
              <option value="rating">Rating</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddNew} disabled={adding}
          className="flex-1 px-3 py-1.5 text-sm bg-primary text-white rounded-lg flex items-center justify-center gap-1">
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
            </button>
            <button onClick={() => {setAddingNew(false);setNewName("");}}
          className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:bg-muted/50">
              Cancel
            </button>
          </div>
        </div>
      }

      {/* Cards */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {visible.length === 0 ?
        <p className="text-xs text-muted-foreground text-center py-6">No {TAB_LABELS[activeTab].toLowerCase()} found</p> :

        visible.map((symptom) =>
        <SymptomCardRow
          key={symptom.id}
          symptom={symptom}
          activeSession={getSession(symptom.id)}
          state={cardStates[symptom.id]}
          onStateChange={(checked, severity) => setCard(symptom.id, checked, severity)} />

        )
        }
      </div>
    </div>);

}

function SymptomCardRow({ symptom, activeSession, state = {}, onStateChange }) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(state.checked ?? !!activeSession);
  const [severity, setSeverity] = useState(state.severity ?? null);
  const [toggling, setToggling] = useState(false);
  const [holdTimer, setHoldTimer] = useState(null);
  const [showDelete, setShowDelete] = useState(false);

  const color = symptom.color || "#8B5CF6";
  const isActive = !!activeSession;
  const isRating = symptom.type === "rating";
  const LABELS = ["—", "0", "1", "2", "3", "4", "5"];

  const updateState = (c, s) => {
    setChecked(c);setSeverity(s);
    onStateChange(c, s);
  };

  const handleSeverity = async (idx) => {
    if (idx === 0) {updateState(false, null);return;}
    const val = idx - 1;
    updateState(true, val);
    if (activeSession) {
      const snaps = activeSession.severity_snapshots || [];
      await base44.entities.SymptomSession.update(activeSession.id, {
        severity_snapshots: [...snaps, { severity: val, timestamp: new Date().toISOString() }]
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    }
  };

  const handleToggleSession = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      if (isActive) {
        await base44.entities.SymptomSession.update(activeSession.id, { is_active: false, end_time: new Date().toISOString() });
        toast.success(`${symptom.label} session ended`);
      } else {
        await base44.entities.SymptomSession.create({
          symptom_id: symptom.id,
          start_time: new Date().toISOString(),
          is_active: true,
          severity_snapshots: []
        });
        updateState(true, severity);
        toast.success(`${symptom.label} set to active`);
      }
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setToggling(false);
    }
  };

  const handlePointerDown = () => {
    const t = setTimeout(() => setShowDelete(true), 5000);
    setHoldTimer(t);
  };
  const handlePointerUp = () => {if (holdTimer) {clearTimeout(holdTimer);setHoldTimer(null);}};

  const handleArchive = async () => {
    await base44.entities.Symptom.update(symptom.id, { is_archived: true });
    queryClient.invalidateQueries({ queryKey: ["symptoms"] });
    setShowDelete(false);
    toast.success(`${symptom.label} removed`);
  };

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
      style={{ borderColor: isActive ? color : "hsl(var(--border))", backgroundColor: isActive ? `${color}15` : "hsl(var(--card))" }}
      onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>

        {/* Checkbox */}
        <button onClick={() => updateState(!checked, severity)}
        className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
        style={{ borderColor: checked ? color : "hsl(var(--border))", backgroundColor: checked ? color : "transparent" }}>
          {checked && <div className="w-2 h-2 rounded-sm bg-white" />}
        </button>

        {/* Label + severity */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{symptom.label}</p>
          {isRating &&
          <div className="flex gap-1 mt-1">
              {LABELS.map((lbl, idx) => {
              const sel = idx === 0 ? severity === null : severity === idx - 1;
              return (
                <button key={idx} onClick={() => handleSeverity(idx)}
                className="w-6 h-6 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: sel ? idx === 0 ? `${color}30` : color : "hsl(var(--muted))",
                  color: sel ? idx === 0 ? color : "#fff" : "hsl(var(--muted-foreground))"
                }}>
                    {lbl}
                  </button>);

            })}
            </div>
          }
        </div>

        {/* Session toggle */}
        <button onClick={handleToggleSession} disabled={toggling}
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all border"
        style={{ borderColor: isActive ? color : "hsl(var(--border))", backgroundColor: isActive ? color : "transparent", color: isActive ? "#fff" : color }}
        title={isActive ? "End session" : "Start session"}>
          {isActive ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>
      </div>

      {showDelete &&
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 space-y-4">
            <p className="text-sm font-medium">Delete "{symptom.label}"?</p>
            <p className="text-xs text-muted-foreground">Existing session history will be preserved.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDelete(false)} className="flex-1 px-3 py-2 rounded-lg border text-sm hover:bg-muted/50">Cancel</button>
              <button onClick={handleArchive} className="flex-1 px-3 py-2 rounded-lg bg-destructive text-white text-sm">Delete</button>
            </div>
          </div>
        </div>
      }
    </>);

}