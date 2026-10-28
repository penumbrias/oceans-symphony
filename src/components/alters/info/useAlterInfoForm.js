// The Alter info list's form (v0.294.0): the alter's record as an editable
// draft that SAVES ITSELF.
//
// • Loaded once per alter (keyed on the id, never the object — the alters
//   query refreshes constantly and re-seeding would put back half-typed
//   text; the "bio won't delete" lesson from the pencil form).
// • Every change is written about half a second later through
//   saveAlterEdits, which writes only what differs from the last save onto
//   a fresh read, so edits made elsewhere meanwhile stay. Saves queue, so
//   two never race. A pending save is flushed when the list closes or the
//   app is hidden.
// • Undo / redo step through the whole list's history; the undone value is
//   saved like any other change. Every write of the alter also keeps the
//   previous version in Recent changes (localDb's history archive).
// • A blank name is never written — the list says the name is needed —
//   but every other change still saves.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { firstAppearanceOf, saveAlterEdits, refreshAlter } from "@/lib/alterEntry";
import { parsePreferences } from "@/lib/alterPreferences";

const SAVE_DELAY_MS = 500;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const blankName = (f) => !String(f?.name || "").trim();
// The draft to write: everything as typed, but a blank name stays as saved.
const keepName = (f, saved) => (f && blankName(f) ? { ...f, name: saved?.name ?? "" } : f);

const plainObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

export function formFromAlter(alter) {
  const { birthday, origin_year } = firstAppearanceOf(alter);
  const form = {
    name: alter.name || "",
    alias: alter.alias || "",
    emoji: alter.emoji || "",
    use_emoji_as_alias: !!alter.use_emoji_as_alias,
    pronouns: alter.pronouns || "",
    color: alter.color || "",
    avatar_url: alter.avatar_url || "",
    avatar_rotation_mode: alter.avatar_rotation_mode || "off",
    role: alter.role || "",
    birthday,
    origin_year,
    description: alter.description || "",
    subsystems_icon: alter.subsystems_icon || "",
    custom_fields: alter.custom_fields || {},
    preferences: parsePreferences(alter),
    tags: Array.isArray(alter.tags) ? alter.tags : [],
    preset_answers: plainObject(alter.preset_answers) || {},
  };
  // The alter's own fields are an array of { name, value, field_type }.
  // Older Get to know me rows stored an id-keyed map here instead; that
  // shape is left out of the form entirely so it is never written over.
  if (Array.isArray(alter.alter_custom_fields)) form.alter_custom_fields = alter.alter_custom_fields;
  return form;
}

export function useAlterInfoForm(alter) {
  const queryClient = useQueryClient();
  const [form, setForm, history] = useUndoRedo(null);
  const [status, setStatus] = useState("saved"); // saved | saving | needs-name | error
  // Bumped on load / undo / redo so text fields (which keep their own draft
  // while typing) re-seed from the form.
  const [revision, setRevision] = useState(0);
  const savedRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;
  const queueRef = useRef(Promise.resolve());
  const timerRef = useRef(null);
  const alterId = alter?.id || null;
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!alter || loadedFor.current === alter.id) return;
    loadedFor.current = alter.id;
    const loaded = formFromAlter(alter);
    savedRef.current = loaded;
    history.reset(loaded);
    setStatus("saved");
    setRevision((r) => r + 1);
  }, [alter?.id, !!alter]);

  const save = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!alterId || !savedRef.current || !formRef.current) return queueRef.current;
    if (same(formRef.current, savedRef.current)) return queueRef.current;
    setStatus(blankName(formRef.current) ? "needs-name" : "saving");
    queueRef.current = queueRef.current.then(async () => {
      // Read the latest draft at run time — more typing may have arrived
      // while an earlier save was still going. A blank name is never
      // written, but everything else still is.
      const baseline = savedRef.current;
      const target = keepName(formRef.current, baseline);
      if (!target || same(target, baseline)) return;
      await saveAlterEdits({ alterId, baseline, form: target });
      savedRef.current = target;
      refreshAlter(queryClient, alterId);
    }).then(
      () => {
        const now = formRef.current;
        setStatus(blankName(now) ? "needs-name" : same(now, savedRef.current) ? "saved" : "saving");
      },
      (e) => {
        setStatus("error");
        toast.error(e?.message || "Couldn't save — your changes are still here, try again");
      },
    );
    return queueRef.current;
  }, [alterId, queryClient]);

  // Autosave after each change.
  useEffect(() => {
    if (!form || !savedRef.current) return;
    if (same(form, savedRef.current)) return;
    setStatus(blankName(form) ? "needs-name" : "saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_DELAY_MS);
  }, [form, save]);

  // Flush when the list closes, or the app is hidden / closed mid-edit.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const flush = () => { saveRef.current(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const set = useCallback((key, value) => setForm((f) => (f ? { ...f, [key]: value } : f)), [setForm]);
  const update = useCallback((fn) => setForm((f) => (f ? fn(f) : f)), [setForm]);
  const setCustomField = useCallback((key, value) => setForm((f) => {
    if (!f) return f;
    const cf = { ...(f.custom_fields || {}) };
    if (value === undefined) delete cf[key];
    else cf[key] = value;
    return { ...f, custom_fields: cf };
  }), [setForm]);

  // Text fields keep their own draft while typing; after a change that moves
  // or replaces what a field shows (undo, a removed or reordered entry, a
  // pasted bio) they are re-seeded from the form.
  const reseed = useCallback(() => setRevision((r) => r + 1), []);
  const undo = useCallback(() => { history.undo(); setRevision((r) => r + 1); }, [history]);
  const redo = useCallback(() => { history.redo(); setRevision((r) => r + 1); }, [history]);

  // Start over from the record as stored now, after something else wrote it
  // (the profile conversion): the draft, its baseline and undo history.
  // Flush first so nothing typed is lost.
  const reload = useCallback((fresh) => {
    if (!fresh) return;
    const loaded = formFromAlter(fresh);
    savedRef.current = loaded;
    history.reset(loaded);
    setStatus("saved");
    setRevision((r) => r + 1);
  }, [history]);

  return {
    form, set, update, setCustomField, status, revision, reseed, flush: save, reload,
    undo, redo, canUndo: history.canUndo, canRedo: history.canRedo,
  };
}
