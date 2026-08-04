// Quick-action "Start Activity" — a thin alias for the canonical
// ActivityLogModal opened in Active mode. It used to carry its OWN minimal
// start form, whose "log instead" toggle swapped in ActivityLogModal — a
// different-looking modal that itself has an Active mode. Two
// implementations of the same start flow, two toggles, two looks; flipping
// back and forth changed the whole design mid-task. Now there is ONE
// surface, and its own Active/Log toggle flips modes in place.

import ActivityLogModal from "@/components/activities/ActivityLogModal";

export default function StartActivityModal({ isOpen, onClose, alters = [] }) {
  return (
    <ActivityLogModal
      isOpen={isOpen}
      onClose={onClose}
      alters={alters}
      frontingHistory={[]}
      initialActive
      onSave={onClose}
    />
  );
}
