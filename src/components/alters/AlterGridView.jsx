import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

function AlterCard({ alter, fronting, isPrimary, compact, onDoubleClick, onMouseDown, onMouseUp, onMouseLeave, anonymize = "off" }) {
  const alterColor = alter.color || "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const boxShadow = fronting
    ? isPrimary
      ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
      : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
    : `inset 0 0 0 2px ${alterColor}80`;
  const sizeClass = compact
    ? (fronting ? "w-16 h-16" : "w-14 h-14")
    : (fronting ? "w-20 h-20" : "w-16 h-16");

  return (
    <div
      className="flex flex-col items-center gap-2"
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {resolvedUrl && !imgError ? (
        <img
          src={resolvedUrl}
          alt={alter.name}
          style={{ boxShadow }}
          className={`rounded-full object-cover transition-all cursor-pointer select-none ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
          draggable={false}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          style={{
            backgroundColor: fronting ? `${alterColor}30` : "hsl(var(--muted))",
            boxShadow,
          }}
          className={`rounded-full flex items-center justify-center transition-all cursor-pointer select-none ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
        >
          <span className="text-xs font-semibold text-muted-foreground">
            {alter.name.slice(0, 2)}
          </span>
        </div>
      )}
      <span className={`text-xs text-center font-medium truncate w-full px-1 ${anonymize !== "off" ? "blur-sm" : ""}`}>
        {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
      </span>
    </div>
  );
}

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], cols = 3, anonymize = "off" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);
  const compact = cols >= 4;

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

  const colsClass = {
    2: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    3: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
    4: "grid-cols-4 sm:grid-cols-5 md:grid-cols-6",
    5: "grid-cols-5 sm:grid-cols-6 md:grid-cols-7",
  }[cols] || "grid-cols-3 sm:grid-cols-4 md:grid-cols-5";

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {alters.map((alter) => (
        <AlterCard
          key={alter.id}
          alter={alter}
          fronting={isFronting(alter.id)}
          isPrimary={activeSessions.find(s => s.alter_id === alter.id)?.is_primary ?? false}
          compact={compact}
          onDoubleClick={() => handleDoubleClick(alter)}
          onMouseDown={() => handleMouseDown(alter)}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          anonymize={anonymize}
        />
      ))}
    </div>
  );
}