import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, User, Star, X, Loader2, BookOpen, HelpCircle } from "lucide-react";
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
  const [isUnsure, setIsUnsure] = useState(false);

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
    if (primaryId === id) {
      // Tapping primary fronter removes them from primary (co-front only)
      setPrimaryId("");
      return;
    }
    if (!coFronterIds.includes(id) && primaryId !== id) {
      setCoFronterIds([...coFronterIds, primaryId].filter(Boolean).filter((x) => x !== id));
    } else {
      setCoFronterIds([...coFronterIds.filter((x) => x !== id), primaryId].filter(Boolean));
    }
    setPrimaryId(id);
  };

  const handleSave = async () => {
    if (!isUnsure && !primaryId && coFronterIds.length === 0) {
      toast.error("Select at least one fronter or mark as unsure");
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
      
      // If unsure, don't create a session
      if (isUnsure) {
        toast.success("Front cleared");
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        onClose();
      } else {
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

        {/* Selected chips - larger display */}
         {(selectedIds.size > 0 || isUnsure) && (
           <div className="bg-muted/30 rounded-lg p-3 mb-2 border border-border/50">
             <div className="flex flex-wrap gap-2">
               {isUnsure ? (
                 <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-center flex-1">
                   <HelpCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                   <span className="text-sm font-medium">Unsure who's fronting</span>
                 </div>
               ) : (
                 [...selectedIds].map((id) => {
                   const a = activeAlters.find((x) => x.id === id);
                   if (!a) return null;
                   return (
                     <button
                       key={id}
                       onClick={() => setPrimary(id)}
                       className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md"
                       style={{
                         backgroundColor: a.color ? `${a.color}12` : "hsl(var(--card))",
                         borderColor: primaryId === id ? a.color || "hsl(var(--primary))" : `${a.color || "hsl(var(--border))"}40`,
                       }}
                       title={primaryId === id ? "Primary fronter (click to change)" : "Click to set as primary"}
                     >
                       <div
                         className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/30"
                         style={{ backgroundColor: a.color || "hsl(var(--muted))" }}
                       >
                         {a.avatar_url ? (
                           <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" />
                         ) : (
                           <User className="w-6 h-6 text-white" />
                         )}
                       </div>
                       <div className="text-left min-w-0">
                         <p className="font-semibold text-sm">{a.name}</p>
                         {primaryId === id && <p className="text-xs text-muted-foreground">Primary</p>}
                       </div>
                       {primaryId === id && <Star className="w-5 h-5 fill-amber-500 text-amber-500 flex-shrink-0" />}
                       <button
                         onClick={(e) => { e.stopPropagation(); toggleAlter(id); }}
                         className="ml-1 p-1 hover:bg-destructive/20 rounded transition-colors flex-shrink-0"
                       >
                         <X className="w-4 h-4 opacity-60 hover:opacity-100" />
                       </button>
                     </button>
                   );
                 })
               )}
             </div>
           </div>
         )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Click to select · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> = Primary fronter</p>
          {selectedIds.size > 0 && <p className="text-primary">Click primary to make them co-front only</p>}
        </div>

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

        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Checkbox
              id="journal-switch"
              checked={journalSwitch}
              onCheckedChange={setJournalSwitch}
              disabled={isUnsure}
            />
            <label htmlFor="journal-switch" className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
              <BookOpen className="w-3.5 h-3.5" />
              Journal this switch?
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              variant={isUnsure ? "default" : "outline"}
              onClick={() => {
                setIsUnsure(!isUnsure);
                if (!isUnsure) {
                  setPrimaryId("");
                  setCoFronterIds([]);
                }
              }}
              disabled={saving}
              className="flex-1"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Unsure
            </Button>
            {currentSession && (
              <Button variant="outline" onClick={handleEndFront} disabled={saving} className="flex-1">
                Clear Front
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Set Front
            </Button>
          </div>
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
    </>
  );
}