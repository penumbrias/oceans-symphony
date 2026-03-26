import React from "react";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TaskCard({ task, completed, onToggle }) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    if (task.mode === "AUTO" && task.nav_path) navigate(task.nav_path);
    if (task.mode === "MANUAL" && task.nav_path) navigate(task.nav_path);
  };

  const isClickable = !!task.nav_path;

  return (
    <div
      onClick={isClickable ? handleCardClick : undefined}
      className={`bg-card border rounded-xl p-4 transition-all ${isClickable ? "cursor-pointer hover:border-primary/40" : ""} ${
        completed ? "border-primary/30 bg-primary/5" : "border-border/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-foreground">{task.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              task.mode === "AUTO"
                ? "border-blue-400/50 text-blue-500"
                : "border-border/60 text-muted-foreground"
            }`}>
              {task.mode}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {task.points} pts
            </span>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
          )}
        </div>

        {task.mode === "MANUAL" ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
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