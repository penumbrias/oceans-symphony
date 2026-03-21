import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function AlterGridView({ alters, currentSession = null, allAlters = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);

  const handleDoubleClick = async (alter) => {
    try {
      const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
      
      if (activeSessions.length === 0) {
        // No active session, create one with this alter as primary
        await base44.entities.FrontingSession.create({
          primary_alter_id: alter.id,
          co_fronter_ids: [],
          start_time: new Date().toISOString(),
          is_active: true,
        });
        toast.success(`${alter.name} is now fronting!`);
      } else {
        // Toggle fronting status
        const session = activeSessions[0];
        const allFronters = new Set([session.primary_alter_id, ...session.co_fronter_ids]);
        
        if (allFronters.has(alter.id)) {
          // Remove from front
          allFronters.delete(alter.id);
          
          if (allFronters.size === 0) {
            // Clear front if no one left
            await base44.entities.FrontingSession.update(session.id, {
              is_active: false,
              end_time: new Date().toISOString(),
            });
            toast.success(`${alter.name} removed from front`);
          } else {
            // Update session with remaining fronters
            const newPrimary = Array.from(allFronters)[0];
            const newCoFronters = Array.from(allFronters).filter(id => id !== newPrimary);
            
            await base44.entities.FrontingSession.update(session.id, {
              primary_alter_id: newPrimary,
              co_fronter_ids: newCoFronters,
            });
            toast.success(`${alter.name} removed from front`);
          }
        } else {
          // Add to front
          allFronters.add(alter.id);
          const newCoFronters = Array.from(allFronters).filter(id => id !== session.primary_alter_id);
          
          await base44.entities.FrontingSession.update(session.id, {
            co_fronter_ids: newCoFronters,
          });
          toast.success(`${alter.name} added to front!`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to update front");
    }
  };

  const isFronting = (alterId) => {
    if (!currentSession) return false;
    return currentSession.primary_alter_id === alterId || currentSession.co_fronter_ids?.includes(alterId);
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