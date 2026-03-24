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
import { useTerms } from "@/lib/useTerms";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

function FronterChip({ alter, isPrimary, startTime, onHold }) {
  const navigate = useNavigate();
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);

  const handleMouseDown = () => {
    const timeoutId = setTimeout(() => {
      onHold(alter);
    }, 500);
    setLongPressTimeoutId(timeoutId);
  };

  const handleMouseUp = () => {
    if (longPressTimeoutId) {
      clearTimeout(longPressTimeoutId);
      setLongPressTimeoutId(null);
    }
  };

  const handleClick = () => {
    navigate(`/alter/${alter.id}`);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      className="flex items-center gap-2.5 bg-card border border-border/50 rounded-2xl px-3 py-2.5 hover:border-border transition-all min-w-0 cursor-pointer"
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
          {isPrimary ? `Primary · ` : `${useTermsLocal} · `}
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

  const active = sessions.find((s) => s.is_active);
  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

  useEffect(() => {
    if (active && active.note) {
      setStatusText(active.note);
      setTempStatus(active.note);
    }
  }, [active?.id]);

  const handleSetPrimaryFromHold = async (alter) => {
    if (!active) return;
    try {
      const newCoFronters = [active.primary_alter_id, ...(active.co_fronter_ids || [])]
        .filter((id) => id !== alter.id);
      await base44.entities.FrontingSession.update(active.id, {
        primary_alter_id: alter.id,
        co_fronter_ids: newCoFronters,
      });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success(`${alter.name} is now primary!`);
    } catch (e) {
      toast.error("Failed to update primary fronter");
    }
  };

  const handleSaveStatus = async () => {
    if (!active) return;
    try {
      await base44.entities.FrontingSession.update(active.id, {
        note: tempStatus || null,
      });
      setStatusText(tempStatus);
      setEditingStatus(false);
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success("Status updated!");
    } catch (e) {
      toast.error("Failed to update status");
    }
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

  const primary = altersById[active.primary_alter_id];
  const coFronters = (active.co_fronter_ids || []).map((id) => altersById[id]).filter(Boolean);
  const all = [primary, ...coFronters].filter(Boolean);

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currently {terms.Fronting}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5 text-xs h-7 px-2.5">
            <RefreshCw className="w-3 h-3" />
            {terms.Switch}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {all.map((alter, i) => (
            <FronterChip
              key={alter.id}
              alter={alter}
              isPrimary={i === 0}
              startTime={active.start_time}
              onHold={handleSetPrimaryFromHold}
            />
          ))}
        </div>

        {/* Custom Status */}
        {editingStatus ? (
          <div className="flex gap-2">
            <Input
              placeholder="Add a status..."
              value={tempStatus}
              onChange={(e) => setTempStatus(e.target.value)}
              className="text-sm h-8 bg-card/50"
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleSaveStatus}
              className="gap-1.5 text-xs h-8 px-2.5"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingStatus(false)}
              className="gap-1.5 text-xs h-8 px-2.5"
            >
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