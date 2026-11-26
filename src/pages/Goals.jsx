// Goals: a workspace that works like a notebook (v0.285.0). Every goal is
// a page; pages hold sections (smaller pages, nested as deep as you like),
// notes, to-dos, checkboxes, links and trackers. See src/lib/goalTree.js.
//
// The front page is a widget board (Add a goal, the goal cards).
//
// ?page=<id> opens a page (?highlight=<id> from older links does too);
// ?new=1 starts a new goal; ?fromWish=<id> makes a goal from a wish.
//
// Notes & lists live here too (v0.376.0): ?notes=1 shows their board
// (NotesView), ?list=<id> opens a note, list or deck in the list sheet on
// top of whatever is showing. They stay stored in the lists panel's stores.

import React, { useState } from "react";
import { Repeat, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useNotebookWorkspace } from "@/components/goals/workspace/useNotebookWorkspace";
import {
  NOTEBOOK_PAGES, NOTEBOOK_ICONS, GOAL_PAGE_REGISTRY, useHasOwnBoard, useEditWhenShown,
} from "@/components/goals/workspace/notebookBoards";
import { WorkspaceProvider, useWorkspace } from "@/components/goals/workspace/WorkspaceContext";
import PageTree from "@/components/goals/workspace/PageTree";
import BoardPageHeader from "@/components/profile/BoardPageHeader";
import PageBoardCanvas, { openPageLayoutEditor } from "@/components/profile/PageBoardCanvas";
import { useProfilePageState } from "@/components/profile/ProfileBoardCanvas";
import { GOAL_PAGE_PAGES, GoalPageContext } from "@/v2/goalPageWidgets";
import { goalBoardPageId } from "@/lib/goalTree";
import PageView from "@/components/goals/workspace/PageView";
import ListSheet from "@/components/notes/ListSheet";
import { NotesView } from "@/pages/Notes";
import { useUiLook, usePixelDesk, UI_LOOKS } from "@/lib/uiLook";
import {
  PixelPages, PixelOverview, PixelPhoneHome, PixelPageDesk, Panel, useAddPage,
} from "@/components/goals/workspace/NotebookPixel";
import "@/styles/pixel/notebook.css";

// The front board, a goal page's registry and "Edit page" for a board not
// on screen yet live in notebookBoards.js (shared with the house's room).
export { NOTEBOOK_PAGES };

function Home({ toCarry, onCarry, carrying }) {
  const [hideCarry, setHideCarry] = useState(false);
  const boardPage = useProfilePageState(NOTEBOOK_PAGES);
  return (
    <div className="space-y-4">
      <BoardPageHeader title="Notebook" layoutEditing={boardPage.layoutEditing}
        onEditLayout={openPageLayoutEditor} tourId="notebook-layout-btn" />

      {toCarry.length > 0 && !hideCarry && !boardPage.layoutEditing && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
          <p className="text-sm flex items-center gap-1.5"><Repeat className="w-4 h-4 text-primary" /> Keep the weekly goals here?</p>
          <p className="text-xs text-muted-foreground">
            {toCarry.length === 1 ? "1 weekly goal" : `${toCarry.length} weekly goals`} ({toCarry.map((s) => s.name).join(", ")})
            {" "}can become goals that count up each week. The old weekly goals stay as they are.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onCarry} disabled={carrying}>Keep them as goals</Button>
            <Button size="sm" variant="ghost" onClick={() => setHideCarry(true)}>Not now</Button>
          </div>
        </div>
      )}

      <PageBoardCanvas pageId="notebook" pages={NOTEBOOK_PAGES} page={boardPage} pageIcons={NOTEBOOK_ICONS} tourId="notebook-tabs" />
    </div>
  );
}

// The weekly-goals carry-over offer, as a pixel panel.
function CarryOffer({ toCarry, onCarry, carrying }) {
  const [hide, setHide] = useState(false);
  if (hide) return null;
  return (
    <Panel title="Keep the weekly goals here?" bodyClass="pxn-pad pxn-col">
      <p className="pxn-note">
        {toCarry.length === 1 ? "1 weekly goal" : `${toCarry.length} weekly goals`} ({toCarry.map((s) => s.name).join(", ")})
        {" "}can become goals that count up each week. The old weekly goals stay as they are.
      </p>
      <span className="pxn-row-gap">
        <button type="button" className="pxn-btn on" onClick={onCarry} disabled={carrying}>Keep them as goals</button>
        <button type="button" className="pxn-btn" onClick={() => setHide(true)}>Not now</button>
      </span>
    </Panel>
  );
}

// The left "Pages" panel of the pixel desk.
function PixelSideFrame({ currentId, onOpen }) {
  const addPage = useAddPage(onOpen);
  return (
    <aside className="pxn-panel pxn-side">
      <header className="pxn-ttl"><span className="pxn-ttl-name">Pages</span>
        <button type="button" className="pxn-link" onClick={addPage}>+ new page</button></header>
      <PixelPages currentId={currentId} onOpen={onOpen} />
    </aside>
  );
}

// The pixel Notebook front page: the overview (desk) or the phone board,
// with the person's own Notebook board ("Edit page", "+ Add to this
// page") in a panel underneath — Add a goal, the goal cards and anything
// else they put there stay one tap away.
function PixelHome({ range, setRange, carry, phone = false, onOpenTree = null }) {
  const boardPage = useProfilePageState(NOTEBOOK_PAGES);
  const { open } = useWorkspace();
  const addPage = useAddPage(open);
  const board = (
    <Panel title="On this page" className="pxn-boardpanel"
      action={<button type="button" className="pxn-link" onClick={openPageLayoutEditor}>{boardPage.layoutEditing ? "editing" : "edit page"}</button>}>
      <PageBoardCanvas pageId="notebook" pages={NOTEBOOK_PAGES} page={boardPage} pageIcons={NOTEBOOK_ICONS} tourId="notebook-tabs" />
    </Panel>
  );
  if (phone) {
    return <PixelPhoneHome range={range} setRange={setRange} onOpenTree={onOpenTree} onAddPage={addPage} carry={carry} board={board} />;
  }
  return <PixelOverview range={range} setRange={setRange} onEditLayout={openPageLayoutEditor} carry={carry} board={board} />;
}

// A goal page: its header, then its widget board (v0.338.0). The pixel
// desk shows the mockup's fixed panes until the person lays the page out
// themselves, then their board.
function GoalPage({ page }) {
  const boardPage = useProfilePageState(GOAL_PAGE_PAGES);
  const desk = usePixelDesk();
  const own = useHasOwnBoard(goalBoardPageId(page.id));
  const editShown = useEditWhenShown(boardPage.layoutEditing);
  if (desk && !own && !boardPage.layoutEditing && !editShown.want) {
    return <PageView page={page} onEditLayout={editShown.edit} layoutEditing={false} body={<PixelPageDesk page={page} />} />;
  }
  return (
    <PageView page={page} onEditLayout={openPageLayoutEditor} layoutEditing={boardPage.layoutEditing}
      body={(
        <GoalPageContext.Provider value={page}>
          <PageBoardCanvas pageId={goalBoardPageId(page.id)} pages={GOAL_PAGE_PAGES} page={boardPage}
            registry={GOAL_PAGE_REGISTRY} />
        </GoalPageContext.Provider>
      )} />
  );
}

export default function Goals() {
  const {
    value, page, pageId, notesOpen, listId, openList, open, isFetched, toCarry, carry, carrying, treeOpen, setTreeOpen,
  } = useNotebookWorkspace();
  const pixel = useUiLook() === UI_LOOKS.PIXEL;
  const desk = usePixelDesk();
  const [range, setRange] = useState("week");

  const carryCard = toCarry.length > 0 ? <CarryOffer toCarry={toCarry} onCarry={carry} carrying={carrying} /> : null;

  if (pixel) {
    const missing = pageId && !page && isFetched
      ? <p className="pxn-empty">That page isn't here any more. It may be in the trash.</p> : null;
    const main = page ? <GoalPage key={page.id} page={page} />
      : notesOpen ? <NotesView onOpenNotebook={() => open(null)} />
        : desk ? <>{missing}<PixelHome range={range} setRange={setRange} carry={carryCard} /></>
          : <>{missing}<PixelHome phone range={range} setRange={setRange} carry={carryCard} onOpenTree={() => setTreeOpen(true)} /></>;
    return (
      <WorkspaceProvider value={value}>
        <div className={`pxn-root${desk ? " desk" : " phone"}`} data-tour="goals-page">
          {desk && <PixelSideFrame currentId={page?.id || null} onOpen={open} />}
          <main className="pxn-mainwrap">
            {!desk && (page || notesOpen) && (
              <button type="button" className="pxn-link pxn-pagesbtn" onClick={() => setTreeOpen(true)} aria-label="All pages"><Menu className="w-4 h-4" /> Pages</button>
            )}
            {main}
          </main>
        </div>
        <ListSheet listId={listId} onClose={() => openList(null)} />
        <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto pt-12">
            <SheetTitle className="sr-only">Notebook pages</SheetTitle>
            <PixelPages currentId={page?.id || null} onOpen={open} footer={false} />
          </SheetContent>
        </Sheet>
      </WorkspaceProvider>
    );
  }

  return (
    <WorkspaceProvider value={value}>
      <div className="min-h-screen p-4" style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
        <div className="max-w-6xl mx-auto md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-6" data-tour="goals-page">
          <aside className="hidden md:block sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain pr-1">
            <PageTree currentId={page?.id || null} onOpen={open} />
          </aside>
          <main className="min-w-0 max-w-3xl space-y-3">
            <div className="md:hidden">
              <button type="button" onClick={() => setTreeOpen(true)} aria-label="All pages"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-1">
                <Menu className="w-4 h-4" /> Pages
              </button>
            </div>
            {page ? <GoalPage key={page.id} page={page} /> : notesOpen ? <NotesView onOpenNotebook={() => open(null)} /> : (
              <>
                {pageId && isFetched && <p className="text-sm text-muted-foreground">That page isn't here any more. It may be in the trash.</p>}
                <Home toCarry={toCarry} onCarry={carry} carrying={carrying} />
              </>
            )}
          </main>
        </div>
      </div>
      <ListSheet listId={listId} onClose={() => openList(null)} />
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto pt-12">
          <SheetTitle className="sr-only">Notebook pages</SheetTitle>
          <PageTree currentId={page?.id || null} onOpen={open} />
        </SheetContent>
      </Sheet>
    </WorkspaceProvider>
  );
}
