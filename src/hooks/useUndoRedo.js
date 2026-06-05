import { useState, useCallback, useRef } from "react";

// Drop-in replacement for useState that records an undo/redo history of the
// in-progress value. Used by the alter & group edit forms so the user can step
// backward/forward through their unsaved edits.
//
//   const [state, setState, controls] = useUndoRedo(initial);
//
// - `state`      : current value (same as useState's value).
// - `setState`   : accepts a value OR an updater fn (prev) => next, matching
//                  useState semantics. Each call pushes the previous value onto
//                  the undo stack and clears the redo stack. `setState` is
//                  stable (useCallback) so it can be passed around like a
//                  normal dispatcher.
// - `controls`   : { undo, redo, canUndo, canRedo, reset }
//     - undo()        restore the previous value (no-op if !canUndo).
//     - redo()        re-apply the next value (no-op if !canRedo).
//     - canUndo/canRedo  booleans.
//     - reset(next)   set a fresh baseline and CLEAR both stacks — use this on
//                     entity load so the initial load is not a history entry
//                     and undo can never wipe past the loaded data.
//
// History is capped at MAX_HISTORY entries (oldest dropped).

const MAX_HISTORY = 50;

export function useUndoRedo(initialState) {
  const [hist, setHist] = useState({ past: [], present: initialState, future: [] });

  // Keep a ref in sync so updater-function callers see the freshest present
  // even if multiple setState calls are batched before a re-render.
  const presentRef = useRef(initialState);
  presentRef.current = hist.present;

  const setState = useCallback((next) => {
    setHist((cur) => {
      const resolved = typeof next === "function" ? next(cur.present) : next;
      // No-op if nothing actually changed — avoids junk history entries from
      // re-renders that re-set the same value.
      if (Object.is(resolved, cur.present)) return cur;
      const past = [...cur.past, cur.present];
      // Cap history — drop oldest.
      if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
      return { past, present: resolved, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHist((cur) => {
      if (cur.past.length === 0) return cur;
      const previous = cur.past[cur.past.length - 1];
      const past = cur.past.slice(0, -1);
      return { past, present: previous, future: [cur.present, ...cur.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((cur) => {
      if (cur.future.length === 0) return cur;
      const next = cur.future[0];
      const future = cur.future.slice(1);
      return { past: [...cur.past, cur.present], present: next, future };
    });
  }, []);

  // Set a fresh baseline and clear both stacks. The baseline itself is NOT a
  // history entry, so undo can never restore something from before the reset.
  const reset = useCallback((newState) => {
    setHist({ past: [], present: newState, future: [] });
  }, []);

  const controls = {
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    reset,
  };

  return [hist.present, setState, controls];
}

export default useUndoRedo;
