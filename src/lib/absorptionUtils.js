/**
 * Builds a map of { absorbedAlterId → persistentAlterId } for all absorption
 * fusion events. Follows chains transitively: if A→B and B→C, then A→C.
 */
export function buildAbsorptionMap(systemChangeEvents = []) {
  const direct = {};
  systemChangeEvents
    .filter(e => e.type === "fusion" && e.fusion_type === "absorption" && e.absorbed_into_alter_id)
    .forEach(e => {
      const persistentId = e.absorbed_into_alter_id;
      (e.source_alter_ids || []).forEach(id => {
        if (id !== persistentId) direct[id] = persistentId;
      });
    });

  // Resolve chains (cycle-guarded)
  function resolve(id, visited = new Set()) {
    if (visited.has(id)) return id;
    visited.add(id);
    const next = direct[id];
    if (!next) return id;
    return resolve(next, visited);
  }

  const map = {};
  Object.keys(direct).forEach(id => {
    map[id] = resolve(direct[id]);
  });
  return map;
}

/**
 * Folds absorbed alters' { total, primary, cofronting } time into their
 * persistent alter, then removes the absorbed entry so it isn't double-counted.
 *
 * @param {Object} timeMap      { alterId: { total, primary, cofronting } }
 * @param {Object} absorptionMap  { absorbedId: persistentId }
 * @returns {Object}
 */
export function foldAbsorptionTimes(timeMap, absorptionMap) {
  const result = {};
  Object.entries(timeMap).forEach(([id, t]) => { result[id] = { ...t }; });

  Object.entries(absorptionMap).forEach(([absorbedId, persistentId]) => {
    if (!result[absorbedId]) return;
    if (!result[persistentId]) result[persistentId] = { total: 0, primary: 0, cofronting: 0, sessions: [], count: 0, average: 0, max: 0, min: 0 };
    const src = result[absorbedId];
    const dst = result[persistentId];
    dst.total = (dst.total || 0) + (src.total || 0);
    dst.primary = (dst.primary || 0) + (src.primary || 0);
    dst.cofronting = (dst.cofronting || 0) + (src.cofronting || 0);
    if (src.sessions) dst.sessions = [...(dst.sessions || []), ...(src.sessions || [])];
    if (src.count != null) dst.count = (dst.count || 0) + (src.count || 0);
    delete result[absorbedId];
  });

  return result;
}

/**
 * Folds absorbed alters' co-fronting relationships into the persistent alter.
 *
 * @param {Object} cofrontMap   { idA: { idB: { total, primary, cofronting } } }
 * @param {Object} absorptionMap  { absorbedId: persistentId }
 * @returns {Object}
 */
export function foldAbsorptionCofronting(cofrontMap, absorptionMap) {
  // Deep copy first
  const result = {};
  Object.entries(cofrontMap).forEach(([idA, peers]) => {
    result[idA] = {};
    Object.entries(peers).forEach(([idB, t]) => { result[idA][idB] = { ...t }; });
  });

  const addPair = (idA, idB, t) => {
    if (idA === idB) return;
    if (!result[idA]) result[idA] = {};
    if (!result[idA][idB]) result[idA][idB] = { total: 0, primary: 0, cofronting: 0 };
    result[idA][idB].total += t.total || 0;
    result[idA][idB].primary += t.primary || 0;
    result[idA][idB].cofronting += t.cofronting || 0;
  };

  Object.entries(absorptionMap).forEach(([absorbedId, persistentId]) => {
    const peers = result[absorbedId];
    if (!peers) return;
    Object.entries(peers).forEach(([peerId, t]) => {
      // Resolve peer through absorption too
      const resolvedPeer = absorptionMap[peerId] || peerId;
      if (resolvedPeer === persistentId) return; // don't self-cofront

      // Fold absorbed's relationship with peer into persistent's relationship
      addPair(persistentId, resolvedPeer, t);
      addPair(resolvedPeer, persistentId, t);

      // Remove the old absorbed→peer reference from peer's side
      if (result[resolvedPeer]?.[absorbedId]) {
        delete result[resolvedPeer][absorbedId];
      }
    });
    delete result[absorbedId];
  });

  return result;
}
