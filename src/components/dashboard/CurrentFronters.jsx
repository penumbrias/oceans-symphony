import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { User, Zap, RefreshCw, X, Edit2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import PrivateMessagesIndicator from "./PrivateMessagesIndicator";
import { useTerms } from "@/lib/useTerms";
import { saveMentions } from "@/lib/mentionUtils";

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
      className="flex items-center gap-2.5 bg-card border border-border/50 rounded-2xl px-1.5 py-2. hover:border-border transition-all min-w-0 cursor-pointer"
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
          {startTime ? formatDistanceToNow(new Date(startTime), { addSuffix: false }) : "—"}
        </p>
      </div>
    </div>
  );
}

export default function CurrentFronters({ alters }) {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handler = () => setShowModal(true);
    window.addEventListener("open-set-front", handler);
    return () => window.removeEventListener("open-set-front", handler);
  }, []);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [tempStatus, setTempStatus] = useState("");
  const queryClient = useQueryClient();
  const terms = useTerms();

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

  // New model: each active session = one alter
  const activeSessions = sessions.filter(s => s.is_active);
  // Support both new (alter_id) and legacy (primary_alter_id)
  const primarySession = activeSessions.find(s => s.alter_id ? s.is_primary : true);
  const active = primarySession || activeSessions[0] || null;

  useEffect(() => {
    if (!active) { setStatusText(""); setTempStatus(""); return; }
    // Load persisted note from the active session
    try {
      const raw = active.note;
      if (raw) {
        const parsed = JSON.parse(raw);
        const text = Array.isArray(parsed) ? (parsed[parsed.length - 1]?.text || "") : raw;
        setStatusText(text);
        setTempStatus(text);
      } else {
        setStatusText("");
        setTempStatus("");
      }
    } catch {
      setStatusText(active.note || "");
      setTempStatus(active.note || "");
    }
  }, [active?.id]);

  const handleSetPrimaryFromHold = async (alter) => {
    try {
      // New model: update is_primary on the individual session records
      const targetSession = activeSessions.find(s => (s.alter_id || s.primary_alter_id) === alter.id);
      const currentPrimarySession = activeSessions.find(s => s.alter_id ? s.is_primary : s.primary_alter_id === alter.id);

      if (targetSession?.alter_id) {
        // New model
        if (currentPrimarySession && currentPrimarySession.id !== targetSession.id) {
          await base44.entities.FrontingSession.update(currentPrimarySession.id, { is_primary: false });
        }
        await base44.entities.FrontingSession.update(targetSession.id, { is_primary: true });
      } else if (active) {
        // Legacy fallback
        const newCoFronters = [active.primary_alter_id, ...(active.co_fronter_ids || [])].filter(id => id !== alter.id);
        await base44.entities.FrontingSession.update(active.id, { primary_alter_id: alter.id, co_fronter_ids: newCoFronters });
      }
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success(`${alter.name} is now primary!`);
    } catch (e) {
      toast.error("Failed to update primary fronter");
    }
  };

  const handleSaveStatus = async () => {
    const note = tempStatus.trim();
    setStatusText(note);
    setEditingStatus(false);
    // Persist the note — append to existing notes array to preserve history
    try {
      const nowIso = new Date().toISOString();
      for (const s of activeSessions) {
        let existing = [];
        try {
          const parsed = JSON.parse(s.note || "[]");
          existing = Array.isArray(parsed) ? parsed : [];
        } catch {}
        const updated = [...existing, { text: note, timestamp: nowIso }];
        await base44.entities.FrontingSession.update(s.id, { note: JSON.stringify(updated) });
      }
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch {}
    toast.success("Status saved");
  };

  if (!active) {
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
        <SetFrontModal open={showModal} onClose={() => setShowModal(false)} alters={alters} currentSession={null} />
      </>
    );
  }

  // New model: collect all active alter IDs from individual session records
  let primary = null;
  let coFronters = [];
  if (activeSessions.some(s => s.alter_id)) {
    // New model
    const primarySess = activeSessions.find(s => s.alter_id && s.is_primary);
    const coSessions = activeSessions.filter(s => s.alter_id && !s.is_primary);
    primary = primarySess ? altersById[primarySess.alter_id] : null;
    coFronters = coSessions.map(s => altersById[s.alter_id]).filter(Boolean);
  } else {
    // Legacy fallback
    primary = altersById[active.primary_alter_id];
    coFronters = (active.co_fronter_ids || []).map(id => altersById[id]).filter(Boolean);
  }
  const all = [primary, ...coFronters].filter(Boolean);

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
          {all.map((alter, i) => {
            const alterSession = activeSessions.find(s => (s.alter_id || s.primary_alter_id) === alter.id);
            return (
              <FronterChip
                 key={alter.id}
                 alter={alter}
                 isPrimary={i === 0}
                 startTime={alterSession?.start_time}
                 onHold={handleSetPrimaryFromHold}
                 coFronterLabel={`Co-${terms.fronting}`}
               />
            );
          })}
        </div>

        {/* Private Messages Indicator */}
        <PrivateMessagesIndicator activeFronters={all} />

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
      <SetFrontModal open={showModal} onClose={() => setShowModal(false)} alters={alters} currentSession={active} />
    </>
  );
}