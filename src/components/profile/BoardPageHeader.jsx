// The one header for a page that is a widget board (docs/garden.md, part 3):
// title · Info · Edit page. App pages (Needs, Notebook, Notes & lists) and
// Notebook pages use it; profiles move onto it next.
//
//   <BoardPageHeader title="Needs" layoutEditing={page.layoutEditing}
//     onEditLayout={openPageLayoutEditor} tourId="needs-layout-btn" />
//
// `info` adds the Info button for a page that is one record
// ({ open, onToggle, title, "data-tour" }). A collection page has none: each
// item opens its own sheet. While the layout is being edited the buttons
// step aside — the canvas has its own edit bar.

import React from "react";
import { IdCard, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BoardPageHeader({
  title, icon = null, size = "lg", layoutEditing = false, onEditLayout = null,
  tourId = null, info = null, before = null, after = null,
}) {
  const h1 = size === "lg"
    ? "font-display text-3xl font-semibold text-foreground flex-1 min-w-0 break-words"
    : "font-display text-2xl font-semibold text-foreground flex-1 min-w-0 break-words";
  return (
    <header className="space-y-2">
      {before}
      <div className="flex items-start gap-2">
        {icon && <span className="text-2xl leading-none mt-1" aria-hidden="true">{icon}</span>}
        <h1 className={h1}>{title}</h1>
        {!layoutEditing && info && (
          <Button variant={info.open ? "default" : "outline"} size="sm" className="h-9 px-2.5 gap-1.5 flex-shrink-0"
            data-tour={info["data-tour"] || undefined} aria-pressed={!!info.open} onClick={info.onToggle}
            title={info.title || "Everything about this page"}>
            <IdCard className="w-3.5 h-3.5" /> Info
          </Button>
        )}
        {!layoutEditing && onEditLayout && (
          <Button variant="outline" size="sm" className="h-9 w-9 px-0 flex-shrink-0" onClick={onEditLayout}
            aria-label="Edit page" data-tour={tourId || undefined}
            title="Edit page — move, resize and add widgets">
            <Pencil className="w-4 h-4" />
          </Button>
        )}
      </div>
      {after}
    </header>
  );
}
