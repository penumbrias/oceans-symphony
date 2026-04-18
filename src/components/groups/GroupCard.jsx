import React from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";

export default function GroupCard({ group, alters, onEdit, onDelete }) {
  const groupAlters = alters.filter((a) => group.alter_ids?.includes(a.id));

  return (
    <div
      className="p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors space-y-3 cursor-pointer"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          {group.icon && <span className="text-2xl flex-shrink-0">{group.icon}</span>}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">{group.name}</h3>
            {group.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>
            )}
          </div>
        </div>
        <div
          className="w-6 h-6 rounded-lg flex-shrink-0 border border-border/50"
          style={{ backgroundColor: group.color || "#8b5cf6" }}
        />
      </div>

      {/* Alter avatars stack */}
      {groupAlters.length > 0 && (
        <div className="flex items-center gap-1">
          <div className="flex -space-x-2">
            {groupAlters.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="w-6 h-6 rounded-full border-2 border-card flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: a.color || "#8b5cf6" }}
                title={a.name}
              >
                {a.name?.charAt(0)?.toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {groupAlters.length} {groupAlters.length === 1 ? "alter" : "alters"}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 border-t border-border/30">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs h-7"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Edit className="w-3 h-3 mr-1" /> Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive h-7 px-2"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete group "${group.name}"?`)) {
              onDelete();
            }
          }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}