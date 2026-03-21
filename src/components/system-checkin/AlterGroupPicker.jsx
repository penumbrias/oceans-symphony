import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export default function AlterGroupPicker({ alters = [], groups = [], selected = [], onChange }) {
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Combine alters and groups for filtering
  const items = useMemo(() => {
    const alterItems = alters.map(a => ({
      id: a.id,
      type: "alter",
      name: a.name,
      alias: a.alias,
      displayText: a.alias ? `${a.name} (${a.alias})` : a.name
    }));
    const groupItems = groups.map(g => ({
      id: g.id,
      type: "group",
      name: g.name,
      displayText: g.name
    }));
    return [...alterItems, ...groupItems];
  }, [alters, groups]);

  // Filter items based on input
  const filtered = useMemo(() => {
    if (!input.trim()) return [];
    const query = input.toLowerCase();
    return items.filter(item =>
      item.displayText.toLowerCase().includes(query) ||
      item.name.toLowerCase().includes(query) ||
      (item.alias && item.alias.toLowerCase().includes(query))
    );
  }, [input, items]);

  const selectedItems = useMemo(() => {
    return selected.map(id => items.find(item => item.id === id)).filter(Boolean);
  }, [selected, items]);

  const handleSelect = (item) => {
    if (!selected.includes(item.id)) {
      onChange([...selected, item.id]);
    }
    setInput("");
    setIsOpen(false);
  };

  const handleRemove = (id) => {
    onChange(selected.filter(sid => sid !== id));
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder="Type alter name or alias to add..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          className="w-full"
        />
        {isOpen && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm flex items-center gap-2"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {item.type === "alter" ? "🧑" : "👥"}
                </span>
                <span>{item.displayText}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedItems.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full flex items-center gap-2"
            >
              <span className="text-xs">{item.type === "alter" ? "🧑" : "👥"}</span>
              <span>{item.displayText}</span>
              <button
                onClick={() => handleRemove(item.id)}
                className="hover:text-destructive transition-colors ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}