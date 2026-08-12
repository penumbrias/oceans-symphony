// Member lists, grouped the way the user grouped them.
//
// One builder for every picker that offers the nested view (rule 23): a
// section per group/subsystem in the user's own tree order (cycle-guarded,
// via the shared flattener), members read through the one membership reader,
// and anyone in no group gathered at the end.
//
// A member in several groups appears under each — selection is by id, so the
// checkbox state stays consistent across appearances.

import { flattenGroupTree } from "@/lib/groupTree";
import { getMemberAlters } from "@/lib/subsystemUtils";

export function groupedAlterSections({ alters = [], groups = [], sort = (x) => x, toOption }) {
  const live = alters.filter((a) => !a.is_archived);
  const inAnyGroup = new Set();
  const sections = [];

  for (const g of flattenGroupTree(groups)) {
    const members = getMemberAlters(g, live);
    if (!members.length) continue;
    members.forEach((m) => inAnyGroup.add(m.id));
    sections.push({
      id: g.id,
      label: g.name || "Group",
      color: g.color || null,
      depth: g._depth || 0,
      options: sort(members).map(toOption),
    });
  }

  const rest = live.filter((a) => !inAnyGroup.has(a.id));
  if (rest.length) {
    sections.push({ id: "_rest", label: null, color: null, depth: 0, options: sort(rest).map(toOption) });
  }
  return sections;
}
