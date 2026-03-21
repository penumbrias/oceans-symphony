import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import SetFrontModal from "@/components/fronting/SetFrontModal";

export default function AlterGridView({ alters, currentSession = null, allAlters = [] }) {
  const navigate = useNavigate();
  const [setFrontOpen, setSetFrontOpen] = useState(false);
  const [selectedAlter, setSelectedAlter] = useState(null);
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);

  const handleDoubleClick = (alter) => {
    setSelectedAlter(alter);
    setSetFrontOpen(true);
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