import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import ColorPicker from "@/components/shared/ColorPicker";
import { X } from "lucide-react";

const EMOJI_PRESETS = [
  "🌊", "💜", "🔒", "⚡", "🌙", "☀️", "🌸", "🔥", "🌿", "💎",
  "🦋", "🌀", "👁️", "🗡️", "🛡️", "🎭", "🌺", "❄️", "🌑", "✨",
];

export default function CreateGroupModal({ group = null, onClose, onSave }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");
  const [color, setColor] = useState(group?.color || "#8b5cf6");
  const [icon, setIcon] = useState(group?.icon || "");
  const [customEmoji, setCustomEmoji] = useState("");
  const [selectedAlterIds, setSelectedAlterIds] = useState(new Set(group?.alter_ids || []));
  const [searchQuery, setSearchQuery] = useState("");

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const activeAlters = useMemo(
    () => alters.filter((a) => !a.is_archived).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [alters]
  );

  const filteredAlters = useMemo(() => {
    if (!searchQuery) return activeAlters;
    const q = searchQuery.toLowerCase();
    return activeAlters.filter((a) => a.name?.toLowerCase().includes(q));
  }, [activeAlters, searchQuery]);

  const toggleAlter = (alterId) => {
    const newSet = new Set(selectedAlterIds);
    if (newSet.has(alterId)) newSet.delete(alterId);
    else newSet.add(alterId);
    setSelectedAlterIds(newSet);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Group name is required");
      return;
    }

    const finalIcon = customEmoji.trim() || icon;

    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        color,
        icon: finalIcon,
        alter_ids: Array.from(selectedAlterIds),
      };

      if (group) {
        await base44.entities.Group.update(group.id, data);
      } else {
        await base44.entities.Group.create(data);
      }

      queryClient.invalidateQueries({ queryKey: ["groups"] });
      onSave();
    } catch (error) {
      alert(error.message || "Failed to save group");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 sticky top-0 bg-card">
          <h2 className="text-xl font-semibold text-foreground">
            {group ? "Edit Group" : "Create Group"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Group Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Protectors, Trauma Holders"
              className="w-full"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this group"
              rows={2}
              className="w-full resize-none"
            />
          </div>

          {/* Color & Icon */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Color
              </label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Icon
              </label>
              <div className="grid grid-cols-5 gap-2 mb-3">
                {EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setIcon(emoji);
                      setCustomEmoji("");
                    }}
                    className={`p-2 rounded-lg border transition-all text-lg ${
                      icon === emoji && !customEmoji
                        ? "border-primary bg-primary/10"
                        : "border-border/50 bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <Input
                value={customEmoji}
                onChange={(e) => {
                  setCustomEmoji(e.target.value);
                  if (e.target.value) setIcon("");
                }}
                placeholder="Or paste custom emoji"
                maxLength={2}
                className="text-center text-lg"
              />
            </div>
          </div>

          {/* Alter selector */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Group Members
            </label>
            <Input
              type="search"
              placeholder="Search alters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-3"
            />
            <div className="space-y-2 bg-muted/30 p-3 rounded-lg max-h-48 overflow-y-auto">
              {filteredAlters.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No alters found</p>
              ) : (
                filteredAlters.map((alter) => (
                  <label
                    key={alter.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedAlterIds.has(alter.id)}
                      onChange={() => toggleAlter(alter.id)}
                    />
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: alter.color || "#8b5cf6" }}
                    >
                      {alter.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground">{alter.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedAlterIds.size} alter{selectedAlterIds.size !== 1 ? "s" : ""} selected
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-6 border-t border-border/50 bg-muted/20">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleSave}>
            {group ? "Update Group" : "Create Group"}
          </Button>
        </div>
      </div>
    </div>
  );
}