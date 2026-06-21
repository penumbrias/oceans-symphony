import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import BulletinBoard from "@/components/bulletin/BulletinBoard";

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
  const navigate = useNavigate();
  const location = useLocation();
  const highlightId = new URLSearchParams(location.search).get("id");

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

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
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold">Bulletin Board</h1>
        <div className="w-16" aria-hidden /> {/* spacer to balance header */}
      </div>

      <BulletinBoard
        alters={alters}
        currentAlterId={currentAlterId}
        frontingAlterIds={frontingAlterIds}
        highlightBulletinId={highlightId}
        pageMode
      />
    </div>
  );
}
