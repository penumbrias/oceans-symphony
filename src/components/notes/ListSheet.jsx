// The list sheet (v0.363.0; its own file since v0.376.0): a note, list or
// flash-card deck opened in the lists panel (GroceryListPanel asPage) — the
// one place a list is edited. The Notebook opens it for ?list=<id>.
import React from "react";
import { X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import GroceryListPanel from "@/components/grocery/GroceryListPanel";

export default function ListSheet({ listId, onClose }) {
  const peek = usePeekHeight("symphony_note_list_peek_h", 85);
  return (
    <Drawer open={!!listId} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh` }} {...sheetPortalGuards}
        data-note-list-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">Note or list</DrawerTitle>
        <DrawerDescription className="sr-only">Changes save as you make them.</DrawerDescription>
        <div className="flex justify-end px-3 -mt-1">
          <button type="button" onClick={onClose} aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-vaul-no-drag="">
          {listId && <GroceryListPanel key={listId} asPage initialListId={listId} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
