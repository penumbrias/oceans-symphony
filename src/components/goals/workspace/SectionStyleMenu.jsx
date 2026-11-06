// "Make it a…" (one section: chapter, part, scene or plain section), in a
// section's ⋯ menu. A page's own choices are on its Info sheet.
import React from "react";
import { Check } from "lucide-react";
import {
  DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { updatePage } from "@/lib/goalTree";
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
