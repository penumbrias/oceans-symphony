import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { createIndividualSession, normalizeSessions } from "@/lib/frontingUtils";


export default function AlterGridView({ alters, currentSession = null, allAlters = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);

const handleDoubleClick = async (alter) => {
  try {
    const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
    const normalized = normalizeSessions(activeSessions);
    const activeIds = normalized.filter(s => s.is_active).map(s => s.alterId);
    const isAlreadyFronting = activeIds.includes(alter.id);

    if (activeSessions.length === 0) {
      await createIndividualSession(base44.entities, {
        alterId: alter.id,
        startTime: new Date().toISOString(),
        isActive: true,
      });
      toast.success(`${alter.name} is now fronting!`);
    } else if (isAlreadyFronting) {
      // Find and end this alter's session
      const alterEntry = normalized.find(s => s.alterId === alter.id && s.is_active);
      if (alterEntry) {
        if (alterEntry.isLegacy) {
          const raw = alterEntry.raw;
          const remaining = [raw.primary_alter_id, ...(raw.co_fronter_ids || [])].filter(id => id && id !== alter.id);
          if (remaining.length === 0) {
            await base44.entities.FrontingSession.update(raw.id, { is_active: false, end_time: new Date().toISOString() });
          } else {
            await base44.entities.FrontingSession.update(raw.id, { primary_alter_id: remaining[0], co_fronter_ids: remaining.slice(1) });
          }
        } else {
          await base44.entities.FrontingSession.update(alterEntry.sessionId, { is_active: false, end_time: new Date().toISOString() });
        }
      }
      toast.success(`${alter.name} removed from front`);
    } else {
      await createIndividualSession(base44.entities, {
        alterId: alter.id,
        startTime: new Date().toISOString(),
        isActive: true,
      });
      toast.success(`${alter.name} added to front!`);
    }
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
  } catch (err) {
    toast.error(err.message || "Failed to update front");
  }
};

// Update isFronting:
const isFronting = (alterId) => {
  if (!currentSession) return false;
  return currentSession.alter_id === alterId ||
    currentSession.primary_alter_id === alterId ||
    currentSession.co_fronter_ids?.includes(alterId);
};



  const handleMouseDown = (alter) => {
    const timeoutId = setTimeout(() => {
      navigate(`/alter/${alter.id}`);
    }, 500);
    setLongPressTimeoutId(timeoutId);
  };

  const handleMouseUp = () => {
    if (longPressTimeoutId) {
      clearTimeout(longPressTimeoutId);
      setLongPressTimeoutId(null);
    }
  };

  const handleMouseLeave = () => {
    if (longPressTimeoutId) {
      clearTimeout(longPressTimeoutId);
      setLongPressTimeoutId(null);
    }
  };

  return (
    <>
      <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {alters.map((alter) => {
          const fronting = isFronting(alter.id);
          const isPrimary = currentSession?.primary_alter_id === alter.id;
          const alterColor = alter.color || "#9333ea";
          
          return (
            <div
              key={alter.id}
              className="flex flex-col items-center gap-2"
              onDoubleClick={() => handleDoubleClick(alter)}
              onMouseDown={() => handleMouseDown(alter)}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              {alter.avatar_url ? (
                <img
                  src={alter.avatar_url}
                  alt={alter.name}
                  style={{
                    boxShadow: fronting 
                      ? isPrimary
                        ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
                        : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
                      : `inset 0 0 0 2px ${alterColor}80`
                  }}
                  className={`rounded-full object-cover transition-all cursor-pointer select-none ${fronting ? "w-20 h-20" : "w-16 h-16"}`}
                  draggable={false}
                />
              ) : (
                <div 
                  style={{
                    backgroundColor: fronting ? `${alterColor}30` : "hsl(var(--muted))",
                    boxShadow: fronting 
                      ? isPrimary
                        ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
                        : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
                      : `inset 0 0 0 2px ${alterColor}80`
                  }}
                  className={`rounded-full flex items-center justify-center transition-all cursor-pointer select-none ${fronting ? "w-20 h-20" : "w-16 h-16"}`}
                >
                  <span className="text-xs font-semibold text-muted-foreground">
                    {alter.name.slice(0, 2)}
                  </span>
                </div>
              )}
              <span className="text-xs text-center font-medium truncate w-full px-1">
                {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
              </span>
            </div>
          );
        })}
      </div>
      </>
      );
      }