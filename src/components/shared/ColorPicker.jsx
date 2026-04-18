import React from "react";

export default function ColorPicker({ value, onChange, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="color"
        value={value || "#6366f1"}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent flex-shrink-0"
      />
      <input
        type="text"
        value={value || "#6366f1"}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#6366f1"
        className="flex-1 h-10 px-3 rounded border border-border bg-background text-sm font-mono"
      />
    </div>
  );
}