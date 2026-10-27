// The subject of a board (v0.289.0): whose page the widgets are on.
//
// The home screen and the widget board have no subject (null). A profile
// board provides { type, id } — type is one of PROFILE_OWNER_TYPES
// (profileBoard.js) — and a widget placed on it reads useBoardSubject() to
// default its scope: the journal widget shows that alter's entries, the
// bulletin board that group's posts. A widget's own `subject` setting can
// point it at a different record; the context is only the default.
//
// A widget says where it belongs with `subjects` on its registry entry
// (["home"] when absent). The add-widget library lists only widgets that
// fit the board it was opened from (widgetFitsSubject).

import React from "react";

export const HOME_SUBJECT = "home";

export const BoardSubjectContext = React.createContext(null);
export const useBoardSubject = () => React.useContext(BoardSubjectContext);

export const subjectTypeOf = (subject) => (subject && typeof subject === "object" && subject.type) || HOME_SUBJECT;

export function widgetSubjects(def) {
  const s = def?.subjects;
  return Array.isArray(s) && s.length ? s : [HOME_SUBJECT];
}

export const widgetFitsSubject = (def, subjectOrType) => {
  const type = typeof subjectOrType === "string" ? subjectOrType : subjectTypeOf(subjectOrType);
  return widgetSubjects(def).includes(type);
};

// ── A shared widget's scope on a profile board (v0.292.0) ─────────────
// A widget that can live on a profile (journal, wishes, bulletin board,
// inner world places, timeline, fronting panel) shows that profile's slice
// by default. Its own "Whose" setting can widen it to everyone; the option
// only appears on a profile board (the home screen has no subject).
export const SCOPE_FIELD = {
  key: "scope", type: "select", label: "Whose", default: "subject",
  options: [
    { value: "subject", label: "This profile's" },
    { value: "all", label: "Everyone's" },
  ],
  showIf: (st, ctx) => !!ctx?.subject,
};

// The subject this widget is scoped to, or null for everyone's.
export function useWidgetScope(settings) {
  const subject = useBoardSubject();
  if (!subject || settings?.scope === "all") return null;
  return subject;
}

// Fields that name alters on a record, for scoping a list to some alters.
const ALTER_ID_FIELDS = [
  "alter_id", "primary_alter_id", "author_alter_id", "owner_alter_id",
  "alter_ids", "fronting_alter_ids", "co_author_alter_ids", "author_alter_ids",
  "owner_alter_ids", "source_alter_ids", "result_alter_ids", "alters_present",
];
export function recordMentionsAlters(rec, ids) {
  if (!rec || !ids || ids.length === 0) return false;
  for (const f of ALTER_ID_FIELDS) {
    const v = rec[f];
    if (!v) continue;
    if (Array.isArray(v)) { if (v.some((x) => ids.includes(x))) return true; }
    else if (ids.includes(v)) return true;
  }
  return false;
}
