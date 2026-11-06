// Notes & lists widget (v0.363.0, garden step 5): every note, list and
// flash-card deck, one row each, from the same stores the lists panel uses
// (useNoteLists). Tapping a row opens it on the Notes & lists page, which is
// the one place a list is edited. "New note" makes one and opens it.
//
// The Notes & lists page is a board of these; the same widget can go on
// home or a profile.

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Section, Row, Muted, TextAction, useWidgetMode } from "@/v2/primitives";
import {
  useNoteLists, useNoteListWriters, listLabel, listProgress, isDeck, isItemList, listKind, notesPath,
} from "@/lib/noteLists";
import { plainNoteText } from "@/lib/plainNote";

const limitOf = (settings, fallback) => {
  const n = parseInt(settings?.limit, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const newest = (l) => String(l.updated_date || l.created_date || "");

export function NotesIndexWidget({ settings }) {
  const navigate = useNavigate();
  const mode = useWidgetMode();
  const { lists, items } = useNoteLists();
  const { createNote } = useNoteListWriters();
  const show = settings?.show || "all";
  const rows = useMemo(() => {
    const pool = lists.filter((l) => (show === "decks" ? isDeck(l) : show === "lists" ? isItemList(l) : true));
    return [...pool].sort((a, b) => newest(b).localeCompare(newest(a)));
  }, [lists, show]);
  const shown = mode === "expanded" ? rows : rows.slice(0, limitOf(settings, 6));

  const describe = (l) => {
    const its = items(l.id);
    if (isDeck(l)) return its.length === 1 ? "1 card" : `${its.length} cards`;
    const note = plainNoteText(l.note_content || "").split("\n").find((x) => x.trim()) || "";
    if (its.length > 0) {
      const p = listProgress(its);
      return note ? `${p.done} of ${p.total} ticked · ${note}` : `${p.done} of ${p.total} ticked`;
    }
    return note || (listKind(l) === "note" ? "Empty note" : "Nothing on it yet");
  };

  const newNote = async () => {
    try {
      const made = await createNote();
      if (made?.id) navigate(notesPath(made.id));
    } catch (e) { toast.error(e?.message || "Couldn't make a note."); }
  };

  return (
    <Section label="Notes & lists" action={<TextAction onClick={newNote}>New note</TextAction>}>
      {rows.length === 0 && <Muted>No notes or lists yet. New note starts one.</Muted>}
      {shown.map((l) => (
        <Row key={`${l.source || "db"}-${l.id}`} primary={listLabel(l)}
          secondary={mode === "minimal" ? undefined : describe(l)}
          onClick={() => navigate(notesPath(l.id))} />
      ))}
      {mode !== "expanded" && rows.length > shown.length && (
        <TextAction onClick={() => navigate("/notes")}>{`All ${rows.length}`}</TextAction>
      )}
    </Section>
  );
}
