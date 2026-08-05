// How an alter profile lays out its custom fields (owner request via a
// tester: a long vertical stack is a lot of scrolling when the values are
// short). Three modes, system-wide:
//
//   stacked — one field per row, full width (the original layout)
//   wrap    — fields sit side by side and WRAP onto more lines as needed
//   scroll  — fields sit side by side on ONE line that scrolls sideways
//
// Stored on SystemSettings.custom_fields_layout. Reads ride the shared
// ["systemSettings"] cache (same as useTerms / useFrontLevels) — no extra
// fetch per profile.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const FIELD_LAYOUTS = [
  { id: "stacked", label: "Stacked", hint: "One per row, full width" },
  { id: "wrap", label: "Side by side", hint: "In a line, wrapping down as needed" },
  { id: "scroll", label: "One line", hint: "In a line that scrolls sideways" },
];
export const DEFAULT_FIELD_LAYOUT = "stacked";

export function resolveFieldLayout(settingsRow) {
  const raw = settingsRow?.custom_fields_layout;
  return FIELD_LAYOUTS.some((l) => l.id === raw) ? raw : DEFAULT_FIELD_LAYOUT;
}

export function useCustomFieldsLayout() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  return resolveFieldLayout(settingsList[0]);
}

// Container + item classes for a field list in the chosen layout. The
// inline modes give each field a minimum width so a short value can't
// collapse to an unreadable sliver, and cap it so one long value can't
// eat the row.
export function fieldLayoutClasses(layout) {
  if (layout === "wrap") {
    return {
      container: "flex flex-wrap gap-2",
      item: "min-w-[9rem] max-w-full flex-1 basis-[calc(50%-0.25rem)]",
      divider: false,
    };
  }
  if (layout === "scroll") {
    return {
      container: "flex gap-2 overflow-x-auto overscroll-contain pb-1",
      item: "min-w-[9rem] max-w-[14rem] flex-shrink-0",
      divider: false,
    };
  }
  return { container: "", item: "", divider: true };
}
