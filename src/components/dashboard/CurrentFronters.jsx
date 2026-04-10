import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { User, Zap, RefreshCw, X, Edit2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { useTerms } from "@/lib/useTerms";
import { normalizeSessions } from "@/lib/frontingUtils";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

function FronterChip({ alter, isPrimary, startTime, onHold, coFronterLabel }) {
  const navigate = useNavigate();
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);

  const handleMouseDown = () => {
    const timeoutId = setTimeout(() => { onHold(alter); }, 500);
    setLongPressTimeoutId(timeoutId);
  };

  const handleMouseUp = () => {
    if (longPressTimeoutId) {
      clearTimeout(longPressTimeoutId);
      setLongPressTimeoutId(null);
    }
  };

  const handleClick = () => { navigate(`/alter/${alter.id}`); };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      className="flex items-center gap-2.5 bg-card border border-border/50 rounded-2xl px-1.5 py-2 hover:border-border transition-all min-w-0 cursor-pointer"
    >
      <div className="relative flex-shrink-0">
        <div
          className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border border-border/30"
          style={{ backgroundColor: bg || "hsl(var(--muted))" }}
        >
          {alter.avatar_url ? (
            <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5" style={{ color: text || "hsl(var(--muted-foreground))" }} />
          )}
        </div>
        {isPrimary && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
            <Zap className="w-2 h-2 text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{alter.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {isPrimary ? `Primary · ` : `${coFronterLabel} · `}
          {formatDistanceToNow(new Date(startTime), { addSuffix: false })}
        </p>
      </div>
    </div>
  );
}

export default function CurrentFronters({ alters }) {
  const [showModal, setShowModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [tempStatus, setTempStatus] = useState("");
  const queryClient = useQueryClient();
  const terms = useTerms();

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  const altersById = useMemo(() =>
    Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  // Normalize to handle both legacy grouped and new individual sessions
  const activeSessions = useMemo(() =>
    sessions.filter(s => s.is_active), [sessions]);

  const normalized = useMemo(() =>
    normalizeSessions(activeSessions), [activeSessions]);

  const activeAlterIds = useMemo(() =>
    [...new Set(normalized.map(s => s.alterId))], [normalized]);

  // For status note editing, use the earliest active session's note
  const earliestSession = useMemo(() =>
    activeSessions.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0],
    [activeSessions]);

  // For passing to SetFrontModal — pass the first active session for compatibility
  const activeSessionForModal = useMemo(() =>
    activeSessions[0] || null, [activeSessions]);

  useEffect(() => {
    if (earliestSession) {
      let latest = "";
      try {
        const parsed = JSON.parse(earliestSession.note || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          latest = parsed[parsed.length - 1].text;
        } else if (earliestSession.note && !earliestSession.note.startsWith("[")) {
          latest = earliestSession.note;
        }
      } catch {
        latest = earliestSession.note || "";
      }
      setStatusText(latest);
      setTempStatus(latest);
    }
  }, [earliestSession?.id]);

  const handleSetPrimaryFromHold = async (alter) => {
    // With individual sessions, "primary" is just visual — no-op for now
    toast.success(`${alter.name} noted as primary`);
  };

  const handleSaveStatus = async () => {
    if (!earliestSession || !tempStatus.trim()) return;
    try {
      let existing = [];
      try {
        const parsed = JSON.parse(earliestSession.note || "[]");
        existing = Array.isArray(parsed) ? parsed : [{ text: earliestSession.note, timestamp: earliestSession.start_time }];
      } catch {
        existing = earliestSession.note ? [{ text: earliestSession.note, timestamp: earliestSession.start_time }] : [];
      }
      const updated = [...existing, { text: tempStatus.trim(), timestamp: new Date().toISOString() }];
      await base44.entities.FrontingSession.update(earliestSession.id, {
        note: JSON.stringify(updated),
      });
      setStatusText(tempStatus.trim());
      setEditingStatus(false);
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success("Status updated!");
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  if (activeAlterIds.length === 0) {
    return (
      <>
        <div className="bg-muted/40 border border-border/40 rounded-2xl px-4 py-4 mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No one is currently {terms.fronting}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5 text-xs">
            <RefreshCw className="w-3 h-3" />
            Set {terms.Front}
          </Button>
        </div>
// Replace SetFrontModal call at the bottom with:
<SetFrontModal 
  open={showModal} 
  onClose={() => setShowModal(false)} 
  alters={alters} 
  currentSession={null}
  currentAlterIds={activeAlterIds}  // ← pass all active alter IDs
/>
      </>
    );
  }

  const startTime = earliestSession?.start_time || new Date().toISOString();

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Currently {terms.Fronting}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5 text-xs h-7 px-2.5">
            <RefreshCw className="w-3 h-3" />
            {terms.Switch}
          </Button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          {activeAlterIds.map((alterId, i) => {
            const alter = altersById[alterId];
            if (!alter) return null;
            return (
              <FronterChip
                key={alterId}
                alter={alter}
                isPrimary={i === 0}
                startTime={startTime}
                onHold={handleSetPrimaryFromHold}
                coFronterLabel={`Co-${terms.fronting}`}
              />
            );
          })}
        </div>

        {/* Custom Status */}
        {editingStatus ? (
          <div className="flex gap-2 items-center">
            <Input
              value={tempStatus}
              onChange={(e) => setTempStatus(e.target.value)}
              placeholder="Add a status..."
              className="text-sm h-8 flex-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveStatus(); }}
            />
            <Button size="sm" onClick={handleSaveStatus} className="gap-1.5 text-xs h-8 px-2.5">
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setTempStatus(statusText); setEditingStatus(false); }} className="h-8 px-2">
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setEditingStatus(true)}
            className="w-full text-left px-3 py-2 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
          >
            {statusText ? (
              <div className="flex items-center justify-between">
                <span>{statusText}</span>
                <Edit2 className="w-3 h-3" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="italic">Add a custom status...</span>
                <Edit2 className="w-3 h-3" />
              </div>
            )}
          </button>
        )}
      </div>
      <SetFrontModal open={showModal} onClose={() => setShowModal(false)} alters={alters} currentSession={activeSessionForModal} />
    </>
  );
}