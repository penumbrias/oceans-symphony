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
