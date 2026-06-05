import React, { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { AlterPanel } from "@/components/dashboard/CurrentFronters";
import SetFrontModal from "@/components/fronting/SetFrontModal";

// ── "Notice who's near" — the single participants section ─────────────────────
//
// This is the system-meeting equivalent of the dashboard's "Currently fronting"
// widget, and the ONLY "notice who's near" surface in the meeting form (the old
// separate AlterGroupPicker section was removed — this replaces it).
//
// REUSE, not rebuild:
//   • Picking who's near opens the real Set Fronters modal (SetFrontModal) in
//     its new `selectionMode` — instead of starting a front it just hands back
//     the chosen alter ids, which we add as participants.
//   • Each participant is rendered with the exact same per-alter panel the
//     "Currently fronting" widget uses — CurrentFronters' exported <AlterPanel>
//     in its controlled mode (avatar + name + EmotionWheelPicker + 1–5/boolean
//     symptom rows + free-text note). No bespoke participant card.
//
// Data shape (stored on the SystemCheckIn record under `participants`):
//   [{ alter_id, emotions: string[], symptoms: [{id,label,value,type}],
//      note: "" }]
// `normalizeParticipants` defends old/short records gracefully.

export function normalizeParticipants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && p.alter_id)
    .map((p) => ({
      alter_id: p.alter_id,
      emotions: Array.isArray(p.emotions) ? p.emotions : [],
      symptoms: Array.isArray(p.symptoms) ? p.symptoms : [],
      note: typeof p.note === "string" ? p.note : "",
    }));
}

export default function MeetingParticipantsSection({ participants = [], onChange, alters = [] }) {
  const terms = useTerms();
  const list = useMemo(() => normalizeParticipants(participants), [participants]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const selectedIds = useMemo(() => list.map((p) => p.alter_id), [list]);

  // Merge the modal's chosen ids into the participants list: add new ones with
  // empty per-alter data, drop any de-selected ones, keep the data of the ones
  // that stay. (Removing here mirrors un-checking them in the modal.)
  const applySelection = (ids) => {
    const idSet = new Set(ids);
    const kept = list.filter((p) => idSet.has(p.alter_id));
    const keptIds = new Set(kept.map((p) => p.alter_id));
    const added = ids
      .filter((id) => !keptIds.has(id))
      .map((id) => ({ alter_id: id, emotions: [], symptoms: [], note: "" }));
    onChange([...kept, ...added]);
  };

  const updateParticipant = (alterId, next) => {
    onChange(list.map((p) => (p.alter_id === alterId ? { ...next, alter_id: alterId } : p)));
  };
  const removeParticipant = (alterId) => {
    onChange(list.filter((p) => p.alter_id !== alterId));
  };

  // No heading and no boxed container here — this renders directly under Step
  // 2's single "Notice Who's Near" header (CheckInStep2 passes it as children),
  // so it's just the "Choose who's near…" button + the per-participant panels.
  return (
    <div data-tour="meetings-participants" className="space-y-3">
      {/* Open the real Set Fronters modal to choose who's near — sits directly
          under Step 2's header. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setPickerOpen(true)}
        className="w-full gap-2"
      >
        <UserPlus className="w-4 h-4" />
        {list.length > 0 ? `Add or remove ${terms.alters}` : `Choose who's near…`}
      </Button>

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((p) => {
            const alter = altersById[p.alter_id];
            if (!alter) return null;
            return (
              <AlterPanel
                key={p.alter_id}
                alter={alter}
                participant={p}
                onChange={(next) => updateParticipant(p.alter_id, next)}
                onClose={() => removeParticipant(p.alter_id)}
              />
            );
          })}
        </div>
      )}

      <SetFrontModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        alters={alters}
        selectionMode
        preselectedIds={selectedIds}
        onConfirm={applySelection}
        confirmLabel="Add to meeting"
      />
    </div>
  );
}
