// Restoring a multi-system backup ({ __multisystem: 1, systems: [...] })
// somewhere other than Settings → Import, which has its own Add/Replace
// flow: first-run setup (an empty device) and the recovery screen.

import { getActiveSystemId, renameSystem, createSystemWithData, setActiveSystem } from "@/lib/systems";

export function backupSystems(payload) {
  return (Array.isArray(payload?.systems) ? payload.systems : [])
    .filter((s) => s && s.data && typeof s.data === "object");
}

// The system that was open when the backup was made (flagged `active`),
// else one with the given name, else the first.
export function primarySystemIndex(systems, preferName = null) {
  const flagged = systems.findIndex((s) => s.active);
  if (flagged >= 0) return flagged;
  if (preferName) {
    const named = systems.findIndex((s) => (s.name || "") === preferName);
    if (named >= 0) return named;
  }
  return 0;
}

// Empty device: the primary system goes into the database that's already
// open (via loadDbDump), every other one becomes its own system. Returns
// how many systems were restored. The caller reloads afterwards.
export async function restoreMultiSystemIntoFreshDb(payload, loadDbDump) {
  const systems = backupSystems(payload);
  if (!systems.length) throw new Error("This backup has nothing in it to restore.");
  const i = primarySystemIndex(systems);
  await loadDbDump(systems[i].data);
  const primaryId = getActiveSystemId();
  if (primaryId && systems[i].name) {
    try { await renameSystem(primaryId, systems[i].name); } catch { /* keeps the default name */ }
  }
  for (let j = 0; j < systems.length; j++) {
    if (j === i) continue;
    await createSystemWithData(systems[j].name, systems[j].data);
  }
  if (primaryId) { try { await setActiveSystem(primaryId); } catch { /* already active */ } }
  return systems.length;
}
