import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

export default function AlterSelector({ alters, selected, onChange }) {
  const terms = useTerms();
  const [alterInput, setAlterInput] = useState("");

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);

  const filteredAlters = useMemo(() => {
    if (!alterInput.trim()) return [];
    return activeAlters.filter(
      (a) =>
        !selected.includes(a.id) &&
        (a.name.toLowerCase().includes(alterInput.toLowerCase()) ||
          a.alias?.toLowerCase().includes(alterInput.toLowerCase()))
    );
  }, [alterInput, activeAlters, selected]);

  const removeAlter = (id) => onChange(selected.filter((x) => x !== id));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Who's {terms.fronting}?</p>
      <div className="relative">
        <Input
          placeholder={`Type ${terms.alter} name or alias...`}
          value={alterInput}
          onChange={(e) => setAlterInput(e.target.value)}
          className="text-sm"
        />
        {filteredAlters.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
            {filteredAlters.map((alter) => (
              <button
                key={alter.id}
                onClick={() => {
                  onChange([...selected, alter.id]);
                  setAlterInput("");
                }}
                className="w-full text-left p-2 hover:bg-muted flex items-center gap-2 text-sm transition-colors"
              >
                {alter.avatar_url ? (
                  <img src={alter.avatar_url} alt={alter.name} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: alter.color || "#8b5cf6" }}
                  >
                    {alter.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{alter.name}</p>
                  {alter.alias && <p className="text-xs text-muted-foreground truncate">{alter.alias}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {selected.map((alterId) => {
            const alter = activeAlters.find((a) => a.id === alterId);
            return (
              <div key={alterId} className="relative group">
                <div className="aspect-square rounded-lg bg-muted flex flex-col items-center justify-center p-1 text-center">
                  {alter?.avatar_url ? (
                    <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full rounded-lg object-cover" />
                  ) : (
                    <div
                      className="w-full h-full rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: alter?.color ? alter.color + "30" : "#8b5cf620" }}
                    >
                      <span className="text-sm font-bold" style={{ color: alter?.color || "#8b5cf6" }}>
                        {alter?.name?.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <button
                    onClick={() => removeAlter(alterId)}
                    className="bg-destructive text-destructive-foreground rounded-full p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs font-medium text-center mt-1 truncate">{alter?.alias || alter?.name}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}