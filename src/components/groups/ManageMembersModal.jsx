import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Search, User } from "lucide-react";
import { toast } from "sonner";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export default function ManageMembersModal({ group, allAlters, open, onClose }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !group) return;
    setSearch("");
    const groupKey = group.sp_id || group.id;
    // An alter is in this group if its groups array contains this group's key
    const initial = new Set(
      allAlters
        .filter((a) => (a.groups || []).some((g) => g.id === groupKey))
        .map((a) => a.id)
    );
    setSelectedIds(initial);
  }, [open, group?.id]);

  const filtered = useMemo(
    () =>
      allAlters
        .filter((a) => !a.is_archived)
        .filter((a) => a.name?.toLowerCase().includes(search.toLowerCase())),
    [allAlters, search]
  );

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build new member_sp_ids: use sp_id when available, else id
      const newMemberIds = allAlters
        .filter((a) => selectedIds.has(a.id))
        .map((a) => a.sp_id || a.id);

      await base44.entities.Group.update(group.id, { member_sp_ids: newMemberIds });

      // Update each alter's groups array
      const groupKey = group.sp_id || group.id;
      for (const alter of allAlters) {
        const wasIn = (alter.groups || []).some((g) => g.id === groupKey);
        const isIn = selectedIds.has(alter.id);
        if (wasIn === isIn) continue;

        const currentGroups = alter.groups || [];
        let newGroups;
        if (isIn) {
          // Add this group
          newGroups = [
            ...currentGroups.filter((g) => g.id !== (group.sp_id || group.id)),
            { id: group.sp_id || group.id, name: group.name, color: group.color || "" },
          ];
        } else {
          // Remove this group
          newGroups = currentGroups.filter((g) => g.id !== (group.sp_id || group.id));
        }
        await base44.entities.Alter.update(alter.id, { groups: newGroups });
      }

      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success("Members updated!");
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <span>Manage Members</span>
            {group?.color && (
              <span
                className="ml-2 inline-block w-3 h-3 rounded-full align-middle"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="ml-2 text-muted-foreground font-normal text-sm">{group?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search alters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.map((alter) => {
            const bg = alter.color || null;
            const text = bg ? getContrastColor(bg) : null;
            const checked = selectedIds.has(alter.id);
            return (
              <div
                key={alter.id}
                onClick={() => toggle(alter.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  checked ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-muted/30"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(alter.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0"
                />
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
                  style={{ backgroundColor: bg || "hsl(var(--muted))" }}
                >
                  {alter.avatar_url ? (
                    <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4" style={{ color: text || "hsl(var(--muted-foreground))" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{alter.name}</p>
                  {alter.pronouns && (
                    <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-border/50 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}