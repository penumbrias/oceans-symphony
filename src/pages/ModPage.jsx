// One page of an installed mod: /mod/:modId/:pageId. The mod itself draws
// inside ModFrame's sandbox; this page only adds the title and the states
// for a mod that's missing or switched off.
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMods } from "@/lib/mods/modStore";
import ModFrame from "@/components/mods/ModFrame";

export default function ModPage() {
  const { modId, pageId } = useParams();
  const navigate = useNavigate();
  const { mods, isLoading } = useMods();
  if (isLoading) return null;
  const mod = mods.find((m) => m.mod_id === modId);
  const page = mod?.pages?.find((p) => p.id === pageId) || (mod?.pages?.[0] && !pageId ? mod.pages[0] : null);

  if (!mod || !mod.enabled || !page) {
    return (
      <div className="os-page-shell text-center py-16 px-4 space-y-3">
        <Puzzle className="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {!mod ? "This mod isn't installed." : !mod.enabled ? `${mod.name} is turned off.` : `${mod.name} has no page here.`}
        </p>
        <Button variant="outline" onClick={() => navigate("/mods")}>Go to Mods</Button>
      </div>
    );
  }

  return (
    <div className="os-page-shell space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2 min-w-0">
          <Puzzle className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="truncate">{page.title}</span>
        </h1>
        <Link to="/mods" className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">
          {mod.name} · mod
        </Link>
      </div>
      <ModFrame mod={mod} pageId={page.id} />
    </div>
  );
}
