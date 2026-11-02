// "Make it a…" (one section: chapter, part, scene or plain section) and
// "Sections here are…" (a page: what its sections are, now and when added).
// Both are submenus inside a page's or section's ⋯ menu.
import React from "react";
import { Check } from "lucide-react";
import {
  DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { childPages, updatePage } from "@/lib/goalTree";
import { SECTION_STYLES, sectionStyleOf } from "@/lib/goalWriting";
import { useWorkspace } from "./WorkspaceContext";

const OPTIONS = [...SECTION_STYLES, { id: null, label: "Plain section", plural: "plain sections" }];

const Tick = ({ on }) => <Check className={`w-3.5 h-3.5 mr-2 ${on ? "" : "invisible"}`} />;

export function SectionStyleSub({ page }) {
  const { run } = useWorkspace();
  const cur = sectionStyleOf(page);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Make it a…</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.id || "plain"} onSelect={() => { if (o.id !== cur) run(() => updatePage(page.id, { section_style: o.id })); }}>
            <Tick on={o.id === cur} />{o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function ChildStyleSub({ page }) {
  const { index, run } = useWorkspace();
  const cur = SECTION_STYLES.some((s) => s.id === page.child_section_style) ? page.child_section_style : null;
  const kids = childPages(index, page.id);
  const apply = (style) => run(async () => {
    await updatePage(page.id, { child_section_style: style });
    for (const k of kids) {
      if (sectionStyleOf(k) !== style) await updatePage(k.id, { section_style: style });
    }
  }, kids.length ? `The sections here are ${OPTIONS.find((o) => o.id === style).plural} now` : null);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Sections here are…</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.id || "plain"} onSelect={() => apply(o.id)}>
            <Tick on={o.id === cur} />{o.id ? `${o.label}s` : "Plain sections"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
