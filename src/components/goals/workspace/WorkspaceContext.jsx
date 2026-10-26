// What every part of the Goals workspace needs: the page tree, every line,
// the records lines read their state from, and the shared actions.
import React, { createContext, useContext, useState, useCallback } from "react";
import { toast } from "sonner";

const Ctx = createContext(null);

export function WorkspaceProvider({ value, children }) {
  const [busy, setBusy] = useState(false);
  const { refresh } = value;
  // Every write goes through run: one at a time, errors become a toast,
  // and the lists refresh afterwards.
  const run = useCallback(async (fn, msg) => {
    setBusy(true);
    try {
      const out = await fn();
      if (msg) toast.success(msg);
      return out;
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
      return undefined;
    } finally {
      setBusy(false);
      refresh();
    }
  }, [refresh]);
  return <Ctx.Provider value={{ ...value, busy, run }}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  return useContext(Ctx);
}

export const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
export const chipCls = "text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40";
