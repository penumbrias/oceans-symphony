import React, { useState, useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Imperative, promise-based confirmation — a drop-in replacement for the native
// window.confirm(). It renders the app's styled AlertDialog instead of the
// browser's blocking prompt (which looks foreign, especially in the native
// build). Usage mirrors window.confirm():
//
//   if (await confirm("Delete this folder?")) { ... }
//   if (await confirm({ title: "Delete folder?", body: "This can't be undone.",
//                       confirmLabel: "Delete", destructive: true })) { ... }
//
// <ConfirmRoot /> is mounted once at the app root; confirm() talks to it via a
// module-level handle (same pattern as sonner's toast()), so callers just import
// and call — no context/hook wiring needed.

let _show = null;

export function confirm(opts) {
  const options = typeof opts === "string" ? { body: opts } : (opts || {});
  if (!_show) {
    // Root not mounted (e.g. a unit context) — fall back to the native prompt
    // so the call still resolves sensibly rather than hanging.
    return Promise.resolve(
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(options.body || options.title || "Are you sure?")
        : true
    );
  }
  return _show(options);
}

export function ConfirmRoot() {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  useEffect(() => {
    _show = (opts) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setOptions(opts);
      });
    return () => { _show = null; };
  }, []);

  // Idempotent: resolveRef is cleared on the first settle so the follow-up
  // onOpenChange(false) that Radix fires can't double-resolve.
  const settle = (result) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    setOptions(null);
    if (r) r(result);
  };

  const o = options || {};
  return (
    <AlertDialog open={!!options} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{o.title || "Are you sure?"}</AlertDialogTitle>
          {o.body ? <AlertDialogDescription>{o.body}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {o.cancelLabel || "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={o.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >
            {o.confirmLabel || "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
