import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, User, Star, X, Loader2, BookOpen, HelpCircle, List, Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";
import { useTerms } from "@/lib/useTerms";
import { formatInTimeZone } from "date-fns-tz";

// Returns an ISO string in the user's detected local timezone (not hardcoded)
function nowLocalIso() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
}

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
      selected ?
      "border-primary/60 bg-primary/5" :
      "border-border/50 bg-card hover:bg-muted/30"}`
      }>
      
      <div
        className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
        style={{ backgroundColor: bg || "hsl(var(--muted))" }}>
        
        {alter.avatar_url ?
        <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" /> :

        <User className="w-4 h-4" style={{ color: text || "hsl(var(--muted-foreground))" }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{alter.name}</p>
        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
      </div>
      {selected &&
      <button
        onClick={(e) => {e.stopPropagation();onSetPrimary();}}
        title="Set as primary"
        className={`p-1 rounded-md transition-colors ${isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-400"}`}>
        
          <Star className={`w-4 h-4 ${isPrimary ? "fill-amber-500" : ""}`} />
        </button>
      }
    </div>);

}

export default function SetFrontModal({ open, onClose, alters: altersProp, currentSession }) {
  const queryClient = useQueryClient();
  const terms = useTerms();

  // Always fetch alters internally so the modal is never dependent on caller passing fresh data
  const { data: fetchedAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: open,
  });
  const alters = altersProp?.length ? altersProp : fetchedAlters;
  const [search, setSearch] = useState("");
  // Derive current fronter state from active sessions (new individual model)
  // currentSession may be a single session record; fetch all active sessions to initialize properly
  const getInitialState = () => {
    if (!currentSession) return { primary: "", coFronters: [] };
    if (currentSession.alter_id) {
      // New model: we only have one session record here — we can only read this alter's primary state
      // The caller (CurrentFronters/FrontingBar) should pass activeSessions instead, but for compat:
      return {
        primary: currentSession.is_primary ? currentSession.alter_id : "",
        coFronters: [],
      };
    }
    // Legacy fallback
    return {
      primary: currentSession.primary_alter_id || "",
      coFronters: currentSession.co_fronter_ids || [],
    };
  };
  const init = getInitialState();
  const [primaryId, setPrimaryId] = useState(init.primary);
  const [coFronterIds, setCoFronterIds] = useState(init.coFronters);
  const [saving, setSaving] = useState(false);
  const [journalSwitch, setJournalSwitch] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [newSessionId, setNewSessionId] = useState(null);
  const [isUnsure, setIsUnsure] = useState(false);
  const [viewMode, setViewMode] = useState("list");

  // Sync state when modal opens — load actual active sessions to populate current front
  useEffect(() => {
    if (open) {
      setIsUnsure(false);
      setJournalSwitch(false);
      // Re-initialize from live active sessions (new model)
      base44.entities.FrontingSession.filter({ is_active: true }).then((active) => {
        const newModelSessions = active.filter(s => s.alter_id);
        if (newModelSessions.length > 0) {
          const primarySess = newModelSessions.find(s => s.is_primary);
          const coSessions = newModelSessions.filter(s => !s.is_primary);
          setPrimaryId(primarySess?.alter_id || "");
          setCoFronterIds(coSessions.map(s => s.alter_id));
        } else if (active.length > 0) {
          // Legacy fallback
          const s = active[0];
          setPrimaryId(s.primary_alter_id || "");
          setCoFronterIds(s.co_fronter_ids || []);
        }
      }).catch(() => {});
    }
  }, [open]);

  const activeAlters = useMemo(() => (alters || []).filter((a) => !a.is_archived), [alters]);
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
      const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });

      if (isUnsure) {
        const now = nowLocalIso();
        for (const s of activeSessions) {
          await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        }
        toast.success("✅ Front cleared");
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        onClose();
      } else {
        const now = nowLocalIso();
        const coIds = coFronterIds.filter((id) => id !== primaryId);
        const allSelectedIds = [primaryId, ...coIds].filter(Boolean);

        // Build desired state: alter_id -> is_primary
        const desiredMap = {};
        for (const id of allSelectedIds) {
          desiredMap[id] = id === primaryId;
        }

        // Handle legacy sessions (old format with primary_alter_id)
        const legacySessions = activeSessions.filter(s => !s.alter_id && s.primary_alter_id);
        for (const s of legacySessions) {
          await base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now });
        }

        const newModelSessions = activeSessions.filter(s => s.alter_id);

        // 1. End sessions for alters who are removed OR whose is_primary status changed
        for (const session of newModelSessions) {
          const desiredPrimary = desiredMap[session.alter_id];
          const isStillPresent = session.alter_id in desiredMap;
          const primaryStatusChanged = isStillPresent && session.is_primary !== desiredPrimary;

          if (!isStillPresent || primaryStatusChanged) {
            await base44.entities.FrontingSession.update(session.id, { is_active: false, end_time: now });
          }
        }

        // 2. Create new sessions for alters who are new OR whose status changed (old session was ended above)
        let firstSessionId = null;
        for (const id of allSelectedIds) {
          const existingSession = newModelSessions.find(s => s.alter_id === id);
          const statusUnchanged = existingSession && existingSession.is_primary === desiredMap[id];

          if (!statusUnchanged) {
            const newSession = await base44.entities.FrontingSession.create({
              alter_id: id,
              is_primary: desiredMap[id],
              start_time: now,
              is_active: true,
            });
            if (!firstSessionId) firstSessionId = newSession?.id || null;
          }
        }

        toast.success("✅ Front updated!");
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        if (journalSwitch) {
          setNewSessionId(firstSessionId);
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

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Set {terms.Front}ers</DialogTitle>
          </DialogHeader>

          {/* Selected chips */}
          {(selectedIds.size > 0 || isUnsure) &&
          <div className="bg-muted/30 rounded-lg p-3 mb-2 border border-border/50">
              <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto">
                {isUnsure ?
              <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs">Unsure</span> :

              [...selectedIds].map((id) => {
                const a = (alters || []).find((x) => x.id === id);
                if (!a) return null;
                return (
                  <span
                    key={id} className="px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1 border"

                    style={{ backgroundColor: a.color ? `${a.color}20` : undefined, borderColor: a.color || undefined }}>
                    
                        {id === primaryId && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        <button
                      onClick={() => setPrimary(id)} className="text-sm hover:underline"

                      title="Set as primary">
                      
                          {a.name}
                        </button>
                        <button
                      onClick={(e) => {e.stopPropagation();toggleAlter(id);}}
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove">
                      
                          <X className="lucide lucide-x w-3 h-3" />
                        </button>
                      </span>);

              })
              }
              </div>
            </div>
          }

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Click to select · <Star className="inline w-3 h-3 text-amber-500 fill-amber-500" /> = Primary {terms.alter}</p>
            {selectedIds.size > 0 && <p className="text-primary">Click primary to make them co-{terms.front} only</p>}
          </div>

          {/* Search and View Toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${terms.alters}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9" />
              
            </div>
            <div className="flex gap-1 bg-muted/50 rounded-md p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded transition-colors ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="List view">
                
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded transition-colors ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="Grid view">
                
                <Grid3x3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List or Grid View */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {viewMode === "list" ?
            <div className="space-y-1.5">
                {filtered.map((a) =>
              <AlterPill
                key={a.id}
                alter={a}
                selected={selectedIds.has(a.id)}
                isPrimary={primaryId === a.id}
                onToggle={() => toggleAlter(a.id)}
                onSetPrimary={() => setPrimary(a.id)} />

              )}
              </div> :

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filtered.map((a) => {
                const isFronting = selectedIds.has(a.id);
                const isPrimary = primaryId === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAlter(a.id)}
                    className="flex flex-col items-center gap-2 p-2 rounded-lg border transition-all hover:bg-muted/50"
                    style={{
                      borderColor: isFronting ? a.color || "hsl(var(--primary))" : "hsl(var(--border))",
                      backgroundColor: isFronting ? `${a.color || "hsl(var(--primary))"}15` : "transparent"
                    }}>
                    
                      <div
                      className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border-2 flex-shrink-0"
                      style={{
                        backgroundColor: a.color || "hsl(var(--muted))",
                        borderColor: isPrimary ? "hsl(var(--accent))" : isFronting ? a.color || "hsl(var(--primary))" : "hsl(var(--border))"
                      }}>
                      
                        {a.avatar_url ?
                      <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" /> :

                      <User className="w-6 h-6 text-white/70" />
                      }
                      </div>
                      <div className="text-center min-w-0">
                        <p className="text-xs font-medium truncate">{a.name}</p>
                        {isPrimary && <p className="text-xs text-primary leading-none">Primary</p>}
                      </div>
                    </button>);

              })}
              </div>
            }
          </div>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Checkbox
                id="journal-switch"
                checked={journalSwitch}
                onCheckedChange={setJournalSwitch}
                disabled={isUnsure} />
              
              <label htmlFor="journal-switch" className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
                <BookOpen className="w-3.5 h-3.5" />
                Journal this {terms.switch}?
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
                className="flex-1">
                
                <HelpCircle className="w-4 h-4 mr-2" />
                Unsure
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
                Set {terms.Front}ers
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showJournalModal &&
      <SwitchJournalModal
        open={showJournalModal}
        onClose={() => {setShowJournalModal(false);onClose();}}
        sessionId={newSessionId}
        authorAlterId={primaryId} />

      }
    </>);

}