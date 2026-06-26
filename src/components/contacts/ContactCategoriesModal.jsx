import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";

// Phase 2/categories — manage the contact category list (add / rename /
// recolour / delete). Categories are flat for now (a contact can be in
// several via Contact.category_ids); nesting is a possible follow-up.
const PALETTE = ["#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#6366f1"];

export default function ContactCategoriesModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [colorForId, setColorForId] = useState(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["contactCategories"],
    queryFn: () => base44.entities.ContactCategory.list(),
    enabled: open,
  });
  const sorted = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || ""));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["contactCategories"] });
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
  };

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await base44.entities.ContactCategory.create({
        name: n,
        color: PALETTE[categories.length % PALETTE.length],
        order: categories.length,
        created_date: new Date().toISOString(),
      });
      setName("");
      invalidate();
    } catch (err) { toast.error(err?.message || "Couldn't add"); }
  };

  const rename = async (cat, newName) => {
    const n = (newName || "").trim();
    if (!n || n === cat.name) return;
    try { await base44.entities.ContactCategory.update(cat.id, { name: n }); invalidate(); }
    catch (err) { toast.error(err?.message || "Couldn't rename"); }
  };

  const recolor = async (cat, color) => {
    try { await base44.entities.ContactCategory.update(cat.id, { color }); invalidate(); }
    catch (err) { toast.error(err?.message || "Couldn't update"); }
  };

  const remove = async (cat) => {
    if (!window.confirm(`Delete the "${cat.name}" category? Contacts keep their info — they're just no longer filed under it.`)) return;
    try { await base44.entities.ContactCategory.delete(cat.id); invalidate(); }
    catch (err) { toast.error(err?.message || "Couldn't delete"); }
  };

  const colorCat = sorted.find((c) => c.id === colorForId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderOpen className="w-4 h-4" /> Categories</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Group your contacts — Family, Friends, Work, Medical… A contact can be in more than one.
        </p>

        <div className="flex items-center gap-1.5 mt-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="New category (e.g. Family)"
            className="flex-1"
          />
          <Button type="button" size="sm" onClick={add} disabled={!name.trim()} className="gap-1 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>

        <div className="space-y-1.5 mt-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No categories yet.</p>
          ) : (
            sorted.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} onRename={rename} onColor={() => setColorForId(cat.id)} onDelete={remove} />
            ))
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>

      {colorCat && (
        <ColorPickerModal
          color={colorCat.color || "#8b5cf6"}
          label="Category colour"
          onSave={(hex) => recolor(colorCat, hex)}
          onClose={() => setColorForId(null)}
        />
      )}
    </Dialog>
  );
}

function CategoryRow({ cat, onRename, onColor, onDelete }) {
  const [val, setVal] = useState(cat.name || "");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5">
      <button type="button" onClick={onColor} className="w-5 h-5 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: cat.color || "#8b5cf6" }} title="Change colour" />
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onRename(cat, val)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="flex-1 h-8 text-sm border-0 bg-transparent px-1 focus-visible:ring-0"
      />
      <button type="button" onClick={() => onDelete(cat)} className="text-muted-foreground hover:text-destructive flex-shrink-0 p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
