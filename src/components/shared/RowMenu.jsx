// The ⋯ on a list row (UI critique H3, v0.364.8). Row actions — Edit,
// Delete and the like — live in this menu instead of as small icons on
// every row, so a delete can't be hit by a slightly-off tap. The button
// is a 44 px target; every item has words.
//
//   <RowMenu label="Check-in actions" items={[
//     { label: "Edit", icon: Pencil, onSelect: () => … },
//     { label: "Delete", icon: Trash2, onSelect: () => …, destructive: true },
//   ]} />
//
// Pair a recoverable delete with deleteWithUndo (src/lib/undoDelete.js):
// no confirmation, an Undo on the toast.

import React from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function RowMenu({ items = [], label = "Actions", className = "" }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  const firstDestructive = shown.findIndex((i) => i.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`-my-2 -mr-2 w-11 h-11 flex-shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 ${className}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {shown.map((item, i) => {
          const Icon = item.icon;
          return (
            <React.Fragment key={item.label}>
              {i > 0 && i === firstDestructive && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => item.onSelect?.()}
                disabled={item.disabled}
                className={`min-h-[44px] gap-2 ${item.destructive ? "text-destructive focus:text-destructive" : ""}`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {item.label}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
