import React from "react";
import { Switch } from "@/components/ui/switch";
import { useTerms } from "@/lib/useTerms";
import { UserSquare, Users, AtSign, PenLine, Map, BarChart3, List } from "lucide-react";

// The "Group config" toggle list — shared by the create-group modal and the
// in-profile group editor so both stay in sync. Each row maps to a boolean
// flag on the Group entity (see src/lib/groupConfig.js); the flags are
// enforced wherever those members would otherwise surface.
//
// `values` is the group/form object (we read values[flag]); `onChange(flag,
// next)` writes a single flag.
export default function GroupConfigToggles({ values, onChange }) {
  const t = useTerms();
  const rows = [
    {
      key: "hide_from_set_front",
      icon: UserSquare,
      label: `Hide members from Set ${t.Front} modals`,
      hint: `They won't appear when choosing who's ${t.fronting}.`,
    },
    {
      key: "hide_from_friends",
      icon: Users,
      label: "Hide members from Friends",
      hint: "Their fronting won't be shared with friend systems.",
    },
    {
      key: "hide_from_mentions",
      icon: AtSign,
      label: "Hide members from @mentions, signposts & whispers",
      hint: "They won't appear in mention, signpost, or whisper suggestions.",
    },
    {
      key: "hide_from_authorship",
      icon: PenLine,
      label: "Hide members from authorship lists",
      hint: "They won't be listed as authors on bulletins and posts.",
    },
    {
      key: "hide_from_system_maps",
      icon: Map,
      label: `Hide members from ${t.system} maps`,
      hint: `They won't appear on the ${t.system} map.`,
    },
    {
      key: "hide_from_analytics",
      icon: BarChart3,
      label: "Hide members from Analytics",
      hint: "They won't be counted in analytics and patterns.",
    },
    {
      key: "hide_from_lists",
      icon: List,
      label: `Hide members from the ${t.alters} list`,
      hint: `They won't show in the main ${t.alters} directory — still reachable through this group.`,
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map(({ key, icon: Icon, label, hint }) => (
        <div key={key} className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2">
            <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{label}</p>
              <p className="text-xs text-muted-foreground leading-snug">{hint}</p>
            </div>
          </div>
          <Switch checked={!!values?.[key]} onCheckedChange={(v) => onChange(key, v)} />
        </div>
      ))}
    </div>
  );
}
