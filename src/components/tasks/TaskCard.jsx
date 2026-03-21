import React from "react";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TaskCard({ task, completed, onToggle }) {
  const navigate = useNavigate();

  const handlePartsCheckInClick = () => {
    if (task.id === "parts_checkin") {
      navigate("/system-checkin");
    }
  };

  return (
    <div 
      onClick={handlePartsCheckInClick}
      className={`bg-card border rounded-xl p-4 transition-all cursor-pointer hover:border-primary/40 ${
        completed ? "border-primary/30 bg-primary/5" : "border-border/50"
      }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-foreground">{task.label}</span>
            <span className="text-xs px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground font-medium">
              {task.type}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {task.xp} pts
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
        </div>

        {task.type === "MANUAL" ? (
          <button
            onClick={() => onToggle(task.id)}
            className={`flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 relative ${
              completed ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${
                completed ? "left-6" : "left-0.5"
              }`}
            />
          </button>
        ) : (
          <span className={`text-xs font-semibold flex-shrink-0 ${completed ? "text-primary" : "text-muted-foreground"}`}>
            {completed ? (
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Done
              </span>
            ) : "Pending"}
          </span>
        )}
      </div>
    </div>
  );
}