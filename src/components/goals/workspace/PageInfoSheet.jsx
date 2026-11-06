// Page info (v0.359.0): everything about one Notebook page, in one place —
// the garden model the profiles follow. The page's record (title, icon,
// status, target date, tags, word target, what its sections are) is
// entered here; the widgets on the page's board show it. A half-height,
// non-modal sheet like Alter info, so the page stays in view while it's
// open. Pages: Info · Writing. Rare actions (pin, move, delete) sit under ⋯.
//
// Every change saves as it's made (title and numbers when you stop typing).

import React, { useEffect, useState } from "react";
import { Info, PenLine, MoreHorizontal, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { Group, Row, ChoiceRow, StackedRow, Chips, LinkRow, TabBar } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { inputBase } from "@/components/alters/info/entryEditors";
import { GOAL_STATUSES, setGoalStatus } from "@/lib/goals";
import { updatePage, childPages } from "@/lib/goalTree";
import { SECTION_STYLES, sectionStyleOf, wordTargetOf, pageWordCount, wordProgressLabel } from "@/lib/goalWriting";
import { openGoalNoteEditor } from "@/lib/goalNoteEvents";
import { plainNoteText } from "@/lib/plainNote";
import { TagEditorBody } from "./TagEditor";
import { useWorkspace } from "./WorkspaceContext";

const STYLE_OPTIONS = [...SECTION_STYLES.map((s) => ({ value: s.id, label: s.label })), { value: "plain", label: "Plain" }];

function InfoTab({ page, isTop, onClose }) {
  const { run } = useWorkspace();
  const statusOptions = [
    ...GOAL_STATUSES.map((s) => ({ value: s.id, label: s.label })),
    ...(isTop ? [] : [{ value: "none", label: "No status" }]),
  ];
  const note = plainNoteText(page.why || "");
  return (
    <>
      <Group title="Page" first>
        <Row label="Title">
          <DebouncedText value={page.title || ""} ariaLabel="Title" maxLength={200} className={`${inputBase} w-[13rem]`}
            onCommit={(v) => { const t = String(v).trim(); if (t && t !== page.title) run(() => updatePage(page.id, { title: t })); }} />
        </Row>
        <Row label="Icon" hint="An emoji, or leave it empty">
          <DebouncedText value={page.icon || ""} ariaLabel="Icon" maxLength={8} className={`${inputBase} w-[5rem] text-center`}
            onCommit={(v) => run(() => updatePage(page.id, { icon: String(v).trim().slice(0, 8) || null }))} />
        </Row>
        <StackedRow label="Status">
          <Chips label="Status" options={statusOptions} value={page.status || (isTop ? "active" : "none")}
            onChange={(v) => run(() => (v === "none" ? updatePage(page.id, { status: null }) : setGoalStatus(page, v)), v === "done" ? "Reached 🎉" : null)} />
        </StackedRow>
        <Row label="Aiming for" hint="A day to reach it by">
          <span className="flex items-center gap-1">
            <input type="date" value={page.target_date || ""} aria-label="Aiming for"
              onChange={(e) => run(() => updatePage(page.id, { target_date: e.target.value || null }))}
              className={`${inputBase} w-[10.5rem]`} />
            {page.target_date && (
              <button type="button" aria-label="Clear the day" onClick={() => run(() => updatePage(page.id, { target_date: null }))}
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            )}
          </span>
        </Row>
        <LinkRow label="Page note" value={note ? (note.length > 24 ? `${note.slice(0, 24)}…` : note) : "Add"}
          hint="Shown by the Note widget" onClick={() => { onClose(); openGoalNoteEditor(page.id); }} />
      </Group>
      <Group title="Tags">
        <TagEditorBody page={page} />
      </Group>
    </>
  );
}

function WritingTab({ page, isTop }) {
  const { run, index, steps } = useWorkspace();
  const target = wordTargetOf(page);
  const words = pageWordCount(index, steps, page.id);
  const kids = childPages(index, page.id);
  const childStyle = SECTION_STYLES.some((s) => s.id === page.child_section_style) ? page.child_section_style : "plain";
  const setChildStyle = (v) => {
    const style = v === "plain" ? null : v;
    run(async () => {
      await updatePage(page.id, { child_section_style: style });
      for (const k of kids) {
        if (sectionStyleOf(k) !== style) await updatePage(k.id, { section_style: style });
      }
    });
  };
  return (
    <>
      <Group title="Words" first>
        <Row label="Word target" hint={wordProgressLabel(words, target)}>
          <DebouncedText value={target ? String(target) : ""} ariaLabel="Word target" inputMode="numeric" placeholder="None"
            className={`${inputBase} w-[7rem] text-right tabular-nums`}
            onCommit={(v) => {
              const n = Math.round(Number(String(v).replace(/[^\d]/g, "")));
              run(() => updatePage(page.id, { word_target: Number.isFinite(n) && n > 0 ? n : null }));
            }} />
        </Row>
      </Group>
      <Group title="Chapters">
        {!isTop && (
          <ChoiceRow label="This section is a" options={STYLE_OPTIONS} value={sectionStyleOf(page) || "plain"}
            onChange={(v) => run(() => updatePage(page.id, { section_style: v === "plain" ? null : v }))} />
        )}
        <ChoiceRow label="Sections here are" hint={kids.length ? "Changes the sections already here too" : "New sections start as this"}
          options={STYLE_OPTIONS} value={childStyle} onChange={setChildStyle} />
      </Group>
    </>
  );
}

export default function PageInfoSheet({ page, open, onClose, onMove, onDelete }) {
  const { run, index } = useWorkspace();
  const peek = usePeekHeight("symphony_goal_info_peek_h", 55);
  const [tab, setTab] = useState("info");
  useEffect(() => { if (!open) setTab("info"); }, [open]);
  const isTop = !index.parent.get(page.id);
  const tabs = [
    { id: "info", label: "Info", icon: Info },
    { id: "writing", label: "Writing", icon: PenLine },
  ];
  return (
    <Drawer open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent hideHandle style={{ maxHeight: `${peek.peekH}vh`, height: `${peek.peekH}vh` }} {...sheetPortalGuards} data-goal-info-sheet="">
        <PeekHandle resize={peek} />
        <DrawerTitle className="sr-only">{page.title || "Page"} · info</DrawerTitle>
        <DrawerDescription className="sr-only">Everything about this page. Changes save as you make them.</DrawerDescription>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
          <div className="sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur">
            <div className="py-2 flex items-center gap-2">
              <p className="flex-1 min-w-0 text-sm font-semibold truncate">{page.icon ? `${page.icon} ` : ""}{page.title || "Untitled"} · info</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="More" title="More"
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><MoreHorizontal className="w-4 h-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => run(() => updatePage(page.id, { pinned: !page.pinned }))}>
                    {page.pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onMove}>Move to…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={onDelete}>Delete…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" aria-label="Close" onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><X className="w-4 h-4" /></button>
            </div>
            <TabBar tabs={tabs} value={tab} onChange={setTab} />
          </div>
          <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
            {tab === "info" && <InfoTab page={page} isTop={isTop} onClose={onClose} />}
            {tab === "writing" && <WritingTab page={page} isTop={isTop} />}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
