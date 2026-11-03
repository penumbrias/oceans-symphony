import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { useTerms } from "@/lib/useTerms";
import UndoRedoButtons from "@/components/v2/UndoRedoHistory";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { DOCK_KEY } from "@/components/v2/V2Frame";
import { ChoiceRow, Group } from "@/components/shared/SettingRows";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";

// Who a home-screen page is for. A half-height non-modal sheet over the
// board (inspector guide), the mode as one ChoiceRow, and the standard
// AlterTreeSelect for the list — the same picker every other "which
// alters" choice uses (search, sort, subsystems, groups, select all).
//
// Stored on the page as `visibleTo` (ids) + `visibleMode` ("only" |
// "except"); an empty list means everyone. Choosing Everyone clears the
// list, so the sheet remembers it while open and puts it back if the
// person switches straight back.
export default function PageAudienceSheet({ open, onClose, page, pageName, onChange }) {
  const t = useTerms();
  const [dock, setDock] = useState(() => {
    try { return localStorage.getItem(DOCK_KEY) === "top" ? "top" : "bottom"; } catch { return "bottom"; }
  });
  const flipDock = () => {
    const next = dock === "top" ? "bottom" : "top";
    setDock(next);
    try { localStorage.setItem(DOCK_KEY, next); } catch { /* storage off */ }
  };
  const peekResize = usePeekHeight("symphony_page_audience_peek_h", 55);
  useEffect(() => {
    if (!open) return undefined;
    document.documentElement.setAttribute("data-v2-peek", "1");
    return () => document.documentElement.removeAttribute("data-v2-peek");
  }, [open]);

  const ids = useMemo(() => (Array.isArray(page?.visibleTo) ? page.visibleTo : []), [page?.visibleTo]);
  const storedMode = page?.visibleMode === "except" ? "except" : "only";
  // "Only these" / "Everyone except" picked but nobody ticked yet: still
  // everyone on disk, but the sheet shows the list to pick from.
  const [pendingMode, setPendingMode] = useState(null);
  const lastIds = useRef(ids);
  useEffect(() => { if (ids.length) lastIds.current = ids; }, [ids]);
  useEffect(() => { setPendingMode(null); }, [page?.id]);

  const mode = ids.length ? storedMode : (pendingMode || "all");

  const pickMode = (m) => {
    if (m === "all") {
      setPendingMode(null);
      if (ids.length) onChange({ visibleTo: [] });
      return;
    }
    setPendingMode(m);
    const restore = !ids.length && lastIds.current.length ? lastIds.current : ids;
    onChange({ visibleMode: m, visibleTo: restore });
  };

  const setIds = (next) => onChange({ visibleTo: next, visibleMode: mode === "all" ? storedMode : mode });
  const selected = new Set(ids);
  const toggle = (alter, on) => {
    const n = new Set(selected);
    if (on) n.add(alter.id); else n.delete(alter.id);
    setIds([...n]);
  };
  const setMany = (arr, on) => {
    const n = new Set(selected);
    for (const a of arr) { if (on) n.add(a.id); else n.delete(a.id); }
    setIds([...n]);
  };

  const hint = mode === "all"
    ? `Shown whoever is ${t.fronting}.`
    : !ids.length
      ? `Pick the ${t.alters} below.`
      : mode === "except"
        ? `Hidden while one of these ${t.alters} is ${t.fronting}.`
        : `Only shown while one of these ${t.alters} is ${t.fronting}.`;

  return (
    <Drawer key={dock} direction={dock} open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent direction={dock} hideHandle data-page-audience-sheet=""
        style={{ maxHeight: `${peekResize.peekH}vh`, height: `${peekResize.peekH}vh` }} {...sheetPortalGuards}>
        <PeekHandle resize={peekResize} dock={dock} />
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <button type="button" onClick={onClose} aria-label="Close"
                className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
                {dock === "top" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <span className="min-w-0">
                <DrawerTitle className="text-base truncate">Who sees this page</DrawerTitle>
                <DrawerDescription className="text-xs truncate">{pageName}</DrawerDescription>
              </span>
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <UndoRedoButtons />
              <button type="button" onClick={flipDock}
                aria-label="Move this sheet to the other edge" title="Move this sheet to the other edge"
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
                {dock === "top" ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpToLine className="w-3.5 h-3.5" />}
              </button>
            </span>
          </div>
        </DrawerHeader>
        <div className="px-4 overflow-y-auto overscroll-contain flex-1 min-h-0"
          style={{ paddingBottom: "calc(var(--os-sab) + 24px)" }}>
          {open && page && (
            <>
              <Group first>
                <ChoiceRow
                  label="Show to"
                  hint={hint}
                  options={[
                    { value: "all", label: "Everyone" },
                    { value: "only", label: "Only these" },
                    { value: "except", label: "Not these" },
                  ]}
                  value={mode}
                  onChange={pickMode}
                />
              </Group>
              {mode !== "all" && (
                <Group title={mode === "except" ? `Hide from these ${t.alters}` : `Show to these ${t.alters}`}>
                  <div className="py-2">
                    <AlterTreeSelect
                      isSelected={(id) => selected.has(id)}
                      onToggle={toggle}
                      onSetMany={setMany}
                      selectionMode="multi"
                      maxHeight="40vh"
                    />
                  </div>
                </Group>
              )}
              <p className="text-[0.625rem] text-muted-foreground pt-2">
                The page is never deleted — if no page is left for whoever is {t.fronting}, every page shows.
              </p>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
