import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GripVertical, Hash, Type, ToggleLeft, MoreVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TYPE_ICONS = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
};

const TYPE_LABELS = {
  text: "Text",
  number: "Number",
  boolean: "Yes/No",
};

export default function CustomFieldsManager() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const [saving, setSaving] = useState(false);

  const { data: fields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });

  const moveField = async (index, dir) => {
    const swapIndex = index + dir;
    if (swapIndex < 0 || swapIndex >= fields.length) return;
    const a = fields[index];
    const b = fields[swapIndex];
    await Promise.all([
      base44.entities.CustomField.update(a.id, { order: b.order ?? swapIndex }),
      base44.entities.CustomField.update(b.id, { order: a.order ?? index }),
    ]);
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
  };

  const addField = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await base44.entities.CustomField.create({
      name: newName.trim(),
      field_type: newType,
      order: fields.length,
    });
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
    setNewName("");
    setNewType("text");
    setAdding(false);
    setSaving(false);
  };

  const deleteField = async (id) => {
    await base44.entities.CustomField.delete(id);
    queryClient.invalidateQueries({ queryKey: ["customFields"] });
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Hash className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Custom Fields</CardTitle>
            <CardDescription>
              Fields that appear on every alter's Info tab. You can fill them in per-alter.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground italic py-2">No custom fields defined yet.</p>
        )}

        {fields.map((field, index) => {
          const Icon = TYPE_ICONS[field.field_type] || Type;
          return (
            <div key={field.id} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border/50 bg-muted/10">
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0}
                  className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-20 hover:bg-muted/60 transition-colors">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1}
                  className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-20 hover:bg-muted/60 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{field.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground border border-border/50 rounded-md px-2 py-0.5">
                    <Icon className="w-3 h-3" />
                    {TYPE_LABELS[field.field_type] || field.field_type}
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => deleteField(field.id)} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        {adding ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
            <Input
              placeholder="Field name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addField()}
              autoFocus
              className="text-sm"
            />
            <div className="flex gap-2">
              {["text", "number", "boolean"].map((t) => {
                const Icon = TYPE_ICONS[t];
                return (
                  <button key={t} onClick={() => setNewType(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      newType === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"
                    }`}>
                    <Icon className="w-3.5 h-3.5" />
                    {TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Button>
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={addField} disabled={saving || !newName.trim()}>
                Add Field
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add Custom Field
          </Button>
        )}
      </CardContent>
    </Card>
  );
}