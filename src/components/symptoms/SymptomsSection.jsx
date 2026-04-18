import React, { useState, useRef, useEffect } from "react";
import { Search, Plus, ArrowDownAZ, ArrowUpAZ, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import SymptomCard from "./SymptomCard";

const TABS = ["symptom", "habit"];
const TAB_LABELS = { symptom: "Symptoms", habit: "Habits" };

export default function SymptomsSection({ onSymptomCheckInsReady }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("symptom");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  // card states: { [definitionId]: { checked: bool, severity: number|null } }
  const [cardStates, setCardStates] = useState({});
  const newInputRef = useRef(null);

  const { data: definitions = [] } = useQuery({
    queryKey: ["symptomDefinitions"],
    queryFn: () => base44.entities.SymptomDefinition.list(),
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
  });

  const visibleDefs = definitions
    .filter(
      (d) =>
        !d.is_archived &&
        d.category === activeTab &&
        d.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const cmp = (a.name || "").localeCompare(b.name || "");
      return sortAsc ? cmp : -cmp;
    });

  const getActiveSession = (defId) =>
    activeSessions.find((s) => s.symptom_definition_id === defId) || null;

  const setCard = (defId, checked, severity) => {
    setCardStates((prev) => ({ ...prev, [defId]: { checked, severity } }));
  };

  // Expose collected check-ins to parent via callback ref pattern
  // Parent calls this on save
  const getCheckIns = () =>
    Object.entries(cardStates)
      .filter(([, s]) => s.checked)
      .map(([id, s]) => ({ symptom_definition_id: id, severity: s.severity ?? null }));

  // Pass getter up whenever it changes
  React.useEffect(() => {
    onSymptomCheckInsReady?.(getCheckIns);
  });

  const handleAddNew = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await base44.entities.SymptomDefinition.create({
        name: newName.trim(),
        category: activeTab,
        is_default: false,
        is_archived: false,
        order: 999,
      });
      queryClient.invalidateQueries({ queryKey: ["symptomDefinitions"] });
      setNewName("");
      setAddingNew(false);
      toast.success("Added!");
    } catch (e) {
      toast.error(e.message || "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Header row */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${TAB_LABELS[activeTab].toLowerCase()}...`}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/40 border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 text-muted-foreground"
          title={sortAsc ? "A→Z" : "Z→A"}
        >
          {sortAsc ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
        </button>
        <button
          onClick={() => {
            setAddingNew(true);
            setTimeout(() => newInputRef.current?.focus(), 50);
          }}
          className="p-1.5 rounded-lg border border-border/50 hover:bg-muted/50 text-muted-foreground"
          title="Add new"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Add new inline */}
      {addingNew && (
        <div className="flex gap-2">
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddNew();
              if (e.key === "Escape") { setAddingNew(false); setNewName(""); }
            }}
            placeholder={`New ${TAB_LABELS[activeTab].toLowerCase()} name...`}
            className="flex-1 px-3 py-1.5 text-sm bg-muted/40 border border-primary/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleAddNew}
            disabled={adding}
            className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg flex items-center gap-1"
          >
            {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
          </button>
          <button
            onClick={() => { setAddingNew(false); setNewName(""); }}
            className="px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:bg-muted/50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Symptom cards */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {visibleDefs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No {TAB_LABELS[activeTab].toLowerCase()} found
          </p>
        ) : (
          visibleDefs.map((def) => (
            <SymptomCardWrapper
              key={def.id}
              definition={def}
              activeSession={getActiveSession(def.id)}
              cardState={cardStates[def.id]}
              onStateChange={(checked, severity) => setCard(def.id, checked, severity)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Wrapper that manages local checked/severity state and reports up
function SymptomCardWrapper({ definition, activeSession, cardState, onStateChange }) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(cardState?.checked ?? !!activeSession);
  const [severity, setSeverity] = useState(cardState?.severity ?? null);
  const [toggling, setToggling] = useState(false);
  const [holdTimer, setHoldTimer] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const color = definition.color || "#8B5CF6";
  const isActive = !!activeSession;

  const SEVERITY_LABELS = ["—", "0", "1", "2", "3", "4", "5"];

  const handleSeverityClick = async (idx) => {
    if (idx === 0) {
      setSeverity(null);
      setChecked(false);
      onStateChange(false, null);
      return;
    }
    const val = idx - 1;
    setSeverity(val);
    setChecked(true);
    onStateChange(true, val);
    if (activeSession) {
      const snapshots = activeSession.severity_snapshots || [];
      await base44.entities.SymptomSession.update(activeSession.id, {
        severity_snapshots: [...snapshots, { severity: val, timestamp: new Date().toISOString() }],
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    }
  };

  const handleCheckbox = () => {
    const next = !checked;
    setChecked(next);
    onStateChange(next, severity);
  };

  const handleToggleSession = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      if (isActive) {
        await base44.entities.SymptomSession.update(activeSession.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
        toast.success(`${definition.name} session ended`);
      } else {
        await base44.entities.SymptomSession.create({
          symptom_definition_id: definition.id,
          start_time: new Date().toISOString(),
          is_active: true,
          severity_snapshots: [],
        });
        setChecked(true);
        onStateChange(true, severity);
        toast.success(`${definition.name} set to active`);
      }
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setToggling(false);
    }
  };

  const handlePointerDown = () => {
    const t = setTimeout(() => setShowDeleteConfirm(true), 5000);
    setHoldTimer(t);
  };
  const handlePointerUp = () => {
    if (holdTimer) { clearTimeout(holdTimer); setHoldTimer(null); }
  };

  const handleArchive = async () => {
    await base44.entities.SymptomDefinition.update(definition.id, { is_archived: true });
    queryClient.invalidateQueries({ queryKey: ["symptomDefinitions"] });
    setShowDeleteConfirm(false);
    toast.success(`${definition.name} removed`);
  };

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
        style={{
          borderColor: isActive ? color : "hsl(var(--border))",
          backgroundColor: isActive ? `${color}15` : "hsl(var(--card))",
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Checkbox */}
        <button
          onClick={handleCheckbox}
          className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
          style={{
            borderColor: checked ? color : "hsl(var(--border))",
            backgroundColor: checked ? color : "transparent",
          }}
        >
          {checked && <div className="w-2 h-2 rounded-sm bg-white" />}
        </button>

        {/* Name + Severity */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{definition.name}</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {SEVERITY_LABELS.map((label, idx) => {
              const isSelected = idx === 0 ? severity === null : severity === idx - 1;
              return (
                <button
                  key={idx}
                  onClick={() => handleSeverityClick(idx)}
                  className="w-6 h-6 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? idx === 0 ? `${color}30` : color
                      : "hsl(var(--muted))",
                    color: isSelected
                      ? idx === 0 ? color : "#fff"
                      : "hsl(var(--muted-foreground))",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggle session */}
        <button
          onClick={handleToggleSession}
          disabled={toggling}
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all border"
          style={{
            borderColor: isActive ? color : "hsl(var(--border))",
            backgroundColor: isActive ? color : "transparent",
            color: isActive ? "#fff" : color,
          }}
          title={isActive ? "End active session" : "Start active session"}
        >
          {isActive ? <Minus className="w-3 h-3" /> : <PlusIcon className="w-3 h-3" />}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 space-y-4">
            <p className="text-sm font-medium">Delete "{definition.name}"?</p>
            <p className="text-xs text-muted-foreground">This will not delete existing session history.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-3 py-2 rounded-lg border text-sm hover:bg-muted/50">Cancel</button>
              <button onClick={handleArchive} className="flex-1 px-3 py-2 rounded-lg bg-destructive text-white text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlusIcon({ className }) {
  return <Plus className={className} />;
}
function Minus({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}