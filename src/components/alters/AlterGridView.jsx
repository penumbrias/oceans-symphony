import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function AlterGridView({ alters, activeSessions = [], allAlters = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);

  const handleDoubleClick = async (alter) => {
    try {
      const mySession = activeSessions.find(s => s.alter_id === alter.id);
      if (mySession) {
        // Remove from front
        await base44.entities.FrontingSession.update(mySession.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
        toast.success(`✅ ${alter.name} removed from front`);
      } else {
        // Add to front
        const hasPrimary = activeSessions.some(s => s.is_primary);
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: false,
          start_time: new Date().toISOString(),
          is_active: true,
        });
        toast.success(`✅ ${alter.name} added to front!`);
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to update front");
    }
  };

  const isFronting = (alterId) => activeSessions.some(s => s.alter_id === alterId);

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
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
        {alters.map((alter) => {
          const fronting = isFronting(alter.id);
          const isPrimary = activeSessions.find(s => s.alter_id === alter.id)?.is_primary ?? false;
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