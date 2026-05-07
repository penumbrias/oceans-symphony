import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Check, X, Zap, Plus } from "lucide-react";
import { toast } from "sonner";

const EMOJI_SUGGESTIONS = ["🌀","🔥","❄️","🌊","💤","🫁","💊","🏠","🌩️","😶","🪨","💔","🧩","🫀","🦷","🌑","🎭","🧸","🪞","🌿"];

function TriggerRow({ trigger, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(trigger.label);
  const [emoji, setEmoji] = useState(trigger.emoji || "🏷️");
  const [hint, setHint] = useState(trigger.hint || "");

  const handleSave = () => {
    if (!label.trim()) return;
    onUpdate(trigger.id, { label: label.trim(), emoji: emoji.trim() || "🏷️", hint: hint.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2">
          <Input
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            className="h-7 text-sm w-12 text-center px-1"
            placeholder="🏷️"
            maxLength={4}
          />
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className="h-7 text-sm flex-1"
            placeholder="Trigger type name"
            autoFocus
          />
          <button onClick={handleSave} className="text-green-500 hover:text-green-600 flex-shrink-0">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { setEditing(false); setLabel(trigger.label); setEmoji(trigger.emoji || "🏷️"); setHint(trigger.hint || ""); }}
            className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Input
          value={hint}
          onChange={e => setHint(e.target.value)}
          className="h-7 text-xs"
          placeholder="Short description (optional)"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/10 group">
      <span className="text-base flex-shrink-0">{trigger.emoji || "🏷️"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{trigger.label}</p>
        {trigger.hint && <p className="text-xs text-muted-foreground truncate">{trigger.hint}</p>}
      </div>
      <button onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onDelete(trigger.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function CustomTriggerTypesManager() {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState("🏷️");
  const [newHint, setNewHint] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: triggerTypes = [] } = useQuery({
    queryKey: ["customTriggerTypes"],
    queryFn: () => base44.entities.TriggerType.list(),
  });

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      await base44.entities.TriggerType.create({
        label: newLabel.trim(),
        emoji: newEmoji.trim() || "🏷️",
        hint: newHint.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["customTriggerTypes"] });
      setNewLabel("");
      setNewEmoji("🏷️");
      setNewHint("");
      setShowAdd(false);
      toast.success("Trigger type added");
    } catch {
      toast.error("Failed to add trigger type");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.TriggerType.delete(id);
      queryClient.invalidateQueries({ queryKey: ["customTriggerTypes"] });
      toast.success("Trigger type removed");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      await base44.entities.TriggerType.update(id, data);
      queryClient.invalidateQueries({ queryKey: ["customTriggerTypes"] });
      toast.success("Updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Trigger Types</CardTitle>
            <CardDescription>
              Add custom trigger categories that appear alongside the built-in presets.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(v => !v)} className="gap-1.5 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Trigger Type</p>
            <div className="flex items-center gap-2">
              <Input
                value={newEmoji}
                onChange={e => setNewEmoji(e.target.value)}
                className="h-8 text-sm w-12 text-center px-1"
                placeholder="🏷️"
                maxLength={4}
              />
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                className="h-8 text-sm flex-1"
                placeholder="e.g. Medical, Sleep deprivation..."
                autoFocus
              />
            </div>
            <Input
              value={newHint}
              onChange={e => setNewHint(e.target.value)}
              className="h-8 text-xs"
              placeholder="Short hint (optional)"
            />
            <div className="flex gap-1.5 flex-wrap">
              {EMOJI_SUGGESTIONS.map(e => (
                <button key={e} onClick={() => setNewEmoji(e)}
                  className={`text-base w-7 h-7 rounded flex items-center justify-center hover:bg-muted transition-colors ${newEmoji === e ? "bg-muted ring-1 ring-primary" : ""}`}>
                  {e}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving || !newLabel.trim()} className="gap-1.5">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setNewLabel(""); setNewEmoji("🏷️"); setNewHint(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {triggerTypes.length === 0 && !showAdd ? (
          <p className="text-sm text-muted-foreground italic px-1">
            No custom trigger types yet. Click Add to create one.
          </p>
        ) : (
          <div className="space-y-1.5">
            {triggerTypes.map(t => (
              <TriggerRow key={t.id} trigger={t} onDelete={handleDelete} onUpdate={handleUpdate} />
            ))}
          </div>
        )}

        {triggerTypes.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            These appear alongside the built-in trigger categories when logging a triggered switch.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
