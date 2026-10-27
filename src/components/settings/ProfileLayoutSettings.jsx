// Settings → Alter setup → Profile layouts (v0.292.0). A profile type can
// have ONE default layout — a ProfileBoard row owned by DEFAULT_OWNER_ID —
// which every profile of that type shows until its own layout is edited.
// It is set from a profile ("Use as the default layout…" in the layout
// editor's Save menu) and cleared here. Clearing trashes the row, so
// Recent changes / the trash can bring it back.
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { listProfileBoardRows, profileBoardQueryKey } from "@/lib/boardStore";
import { DEFAULT_OWNER_ID, pickProfileBoardRows, PROFILE_OWNER_TYPES } from "@/lib/profileBoard";
import { clearDefaultLayout } from "@/lib/profileBoardBulk";

const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
};

function TypeRow({ type, label, labelOne }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: rows = [], isFetched } = useQuery({
    queryKey: profileBoardQueryKey(type, DEFAULT_OWNER_ID),
    queryFn: () => listProfileBoardRows(type, DEFAULT_OWNER_ID),
  });
  const { keeper } = pickProfileBoardRows(rows);
  const pages = Array.isArray(keeper?.board?.pages) ? keeper.board.pages.length : 0;
  const clear = async () => {
    const ok = await confirm({
      title: `Clear the default ${labelOne} layout?`,
      body: `Every ${labelOne} whose layout hasn't been edited goes back to the standard layout. Edited layouts stay as they are. The default goes to the trash, where Recent changes can bring it back.`,
      confirmLabel: "Clear default",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await clearDefaultLayout(type, { qc });
      toast.success(`Default ${labelOne} layout cleared.`);
    } catch (e) {
      toast.error(e?.message || "That didn't save.");
    } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-b-0" data-profile-layout-type={type}>
      <LayoutGrid className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium capitalize">{label}</div>
        <div className="text-xs text-muted-foreground">
          {!isFetched ? "…" : keeper
            ? `Default set${when(keeper.updated_date || keeper.created_date) ? ` ${when(keeper.updated_date || keeper.created_date)}` : ""} · ${pages} page${pages === 1 ? "" : "s"}`
            : "No default — every unedited profile shows the standard layout."}
        </div>
      </div>
      {keeper && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clear} className="flex-shrink-0 gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}

export default function ProfileLayoutSettings() {
  const t = useTerms();
  const labels = {
    alter: [t.alters, t.alter],
    group: ["groups", "group"],
    contact: ["contacts", "contact"],
    location: ["inner-world locations", "location"],
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        To set a default, open any profile, tap its grid button, then Save → "Use as the default layout…". Profiles whose layout you have edited keep their own.
      </p>
      <div>
        {PROFILE_OWNER_TYPES.map((type) => (
          <TypeRow key={type} type={type} label={labels[type][0]} labelOne={labels[type][1]} />
        ))}
      </div>
    </div>
  );
}
