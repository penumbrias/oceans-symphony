import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Plus } from "lucide-react";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import BulletinComposerModal from "@/components/bulletin/BulletinComposerModal";
import { UI_V2_ENABLED } from "@/lib/featureFlags";

// Full-screen Bulletin Board view. Same component the dashboard
// widget uses, but mounted in `pageMode` so it:
//   - searches by default (search bar always open)
//   - uses a larger initial batch (25)
//   - auto-loads more as the user scrolls (no Load-more button)
//   - fetches up to 2000 rows so genuine browsing is possible
//
// Navigated to via the dashboard grid tile ("Bulletin Board") when
// the user adds it back to the grid, or from any link that targets
// `/bulletins`.
export default function BulletinsPage() {
  const [composerOpen, setComposerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const highlightId = new URLSearchParams(location.search).get("id");

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const uiV2On = UI_V2_ENABLED && settingsList[0]?.ui_v2?.enabled === true;

  // Active fronter context — bulletins composed from this page should
  // attribute to current fronters just like the dashboard widget does.
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const frontingAlterIds = [...new Set(
    (activeFront || [])
      .map((s) => s.alter_id || s.primary_alter_id)
      .filter(Boolean)
  )];
  const primaryFronter = (activeFront || []).find(
    (s) => (s.alter_id || s.primary_alter_id) && s.is_primary
  );
  const currentAlterId = primaryFronter
    ? (primaryFronter.alter_id || primaryFronter.primary_alter_id)
    : (frontingAlterIds[0] || null);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} aria-label="Back" title="Back">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold">Bulletin Board</h1>
        <div className="w-16" aria-hidden /> {/* spacer to balance header */}
      </div>

      {/* Compose from the page header, like a new journal entry — the board
          is chosen inside the popup. */}
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={() => setComposerOpen(true)} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> New post
        </Button>
      </div>
      <BulletinComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        alters={alters}
        authorAlterId={currentAlterId}
        frontingAlterIds={frontingAlterIds}
      />

      <BulletinBoard
        alters={alters}
        currentAlterId={currentAlterId}
        frontingAlterIds={frontingAlterIds}
        highlightBulletinId={highlightId}
        pageMode
        // With the new UI on, capture lives in the quick-actions bar — the
        // page is just the board. Classic keeps its rows.
        boardOnly={uiV2On}
      />
    </div>
  );
}
