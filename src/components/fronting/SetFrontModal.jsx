import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, User, Star, X, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function AlterPill({ alter, selected, isPrimary, onToggle, onSetPrimary }) {
  const bg = alter.color || null;
  const text = bg ? getContrastColor(bg) : null;
  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
        selected
          ? "border-primary/60 bg-primary/5"
          : "border-border/50 bg-card hover:bg-muted/30"
      }`}
    >
      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
        style={{ backgroundColor: bg || "hsl(var(--muted))" }}
      >
        {alter.avatar_url ? (
          <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4" style={{ color: text || "hsl(var(--muted-foreground))" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{alter.name}</p>
        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
      </div>
      {selected && (
        <button
          onClick={(e) => { e.stopPropagation(); onSetPrimary(); }}
          title="Set as primary"
          className={`p-1 rounded-md transition-colors ${isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-400"}`}
        >
          <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
        </button>
      )}
    </div>
  );
}

export default function SetFrontModal({ open, onClose, alters, currentSession }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [primaryId, setPrimaryId] = useState(currentSession?.primary_alter_id || "");
  const [coFronterIds, setCoFronterIds] = useState(currentSession?.co_fronter_ids || []);
  const [saving, setSaving] = useState(false);
  const [journalSwitch, setJournalSwitch] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [newSessionId, setNewSessionId] = useState(null);

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const filtered = activeAlters.filter((a) =>
    a.name?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedIds = useMemo(() => {
    const ids = new Set(coFronterIds);
    if (primaryId) ids.add(primaryId);
    return ids;
  }, [primaryId, coFronterIds]);

  const toggleAlter = (id) => {
    if (primaryId === id) {
      setPrimaryId("");
      return;
    }
    if (coFronterIds.includes(id)) {
      setCoFronterIds(coFronterIds.filter((x) => x !== id));
    } else {
      setCoFronterIds([...coFronterIds, id]);
      if (!primaryId) setPrimaryId(id);
    }
  };

  const setPrimary = (id) => {
    if (!coFronterIds.includes(id) && primaryId !== id) {
      setCoFronterIds([...coFronterIds, primaryId].filter(Boolean).filter((x) => x !== id));
    } else {
      setCoFronterIds([...coFronterIds.filter((x) => x !== id), primaryId].filter(Boolean));
    }
    setPrimaryId(id);
  };

  const handleSave = async () => {
    if (!primaryId && coFronterIds.length === 0) {
      toast.error("Select at least one fronter");
      return;
    }
    setSaving(true);
    try {
      // End any active sessions
      const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
      for (const s of activeSessions) {
        await base44.entities.FrontingSession.update(s.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
      }
      // Create new session
      const newSession = await base44.entities.FrontingSession.create({
        primary_alter_id: primaryId,
        co_fronter_ids: coFronterIds.filter((id) => id !== primaryId),
        start_time: new Date().toISOString(),
        is_active: true,
      });
      toast.success("Front updated!");
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      if (journalSwitch) {
        setNewSessionId(newSession?.id || null);
        setShowJournalModal(true);
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(e.message || "Failed to set front");
    } finally {
      setSaving(false);
    }
  };

  const handleEndFront = async () => {
    if (!currentSession) return;
    setSaving(true);
    try {
      await base44.entities.FrontingSession.update(currentSession.id, {
        is_active: false,
        end_time: new Date().toISOString(),
      });
      toast.success("Front ended.");
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Front</DialogTitle>
        </DialogHeader>

        {/* Selected chips */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 border-b border-border/50">
            {[...selectedIds].map((id) => {
              const a = activeAlters.find((x) => x.id === id);
              if (!a) return null;
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                  style={{
                    backgroundColor: a.color ? `${a.color}18` : "hsl(var(--muted))",
                    borderColor: a.color ? `${a.color}40` : "hsl(var(--border))",
                    color: a.color || "hsl(var(--foreground))",
                  }}
                >
                  {primaryId === id && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                  {a.name}
                  <button onClick={() => toggleAlter(id)}>
                    <X className="w-3 h-3 opacity-60 hover:opacity-100" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Click to select · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> = Primary fronter
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search alters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {filtered.map((a) => (
            <AlterPill
              key={a.id}
              alter={a}
              selected={selectedIds.has(a.id)}
              isPrimary={primaryId === a.id}
              onToggle={() => toggleAlter(a.id)}
              onSetPrimary={() => setPrimary(a.id)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="journal-switch"
            checked={journalSwitch}
            onCheckedChange={setJournalSwitch}
          />
          <label htmlFor="journal-switch" className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <BookOpen className="w-3.5 h-3.5" />
            Journal this switch?
          </label>
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/50">
          {currentSession && (
            <Button variant="outline" onClick={handleEndFront} disabled={saving} className="flex-1">
              End Front
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Set Front
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {showJournalModal && (
      <SwitchJournalModal
        open={showJournalModal}
        onClose={() => { setShowJournalModal(false); onClose(); }}
        sessionId={newSessionId}
        authorAlterId={primaryId}
      />
    )}
  );
}