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
      // End any active sessions
      const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
      for (const s of activeSessions) {
        await base44.entities.FrontingSession.update(s.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
      }

      // Create new session with this alter as primary
      await base44.entities.FrontingSession.create({
        primary_alter_id: alter.id,
        co_fronter_ids: [],
        start_time: new Date().toISOString(),
        is_active: true,
      });

      toast.success(`${alter.name} is now fronting!`);
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to set front");
    }
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
        {alters.map((alter) => (
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
                className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer select-none"
                draggable={false}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer select-none">
                <span className="text-xs font-semibold text-muted-foreground">
                  {alter.name.slice(0, 2)}
                </span>
              </div>
            )}
            <span className="text-xs text-center font-medium truncate w-full px-1">
              {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
            </span>
          </div>
        ))}
      </div>

      {selectedAlter && (
        <SetFrontModal
          open={setFrontOpen}
          onClose={() => {
            setSetFrontOpen(false);
            setSelectedAlter(null);
          }}
          alters={allAlters}
          currentSession={currentSession}
        />
      )}
    </>
  );
}