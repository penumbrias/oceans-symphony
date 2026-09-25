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

// Text-input variant of confirm(): resolves the trimmed string the user
// entered, or null when they cancel. The house replacement for
// window.prompt() (unstyled, blocks the thread, suppressed on some
// Android WebViews and on desktop).
//
//   const name = await promptText({ title: "New folder", placeholder: "Folder name" });
//   const name = await promptText({ title: "Rename", defaultValue: current });
export function promptText(opts) {
  const options = typeof opts === "string" ? { title: opts } : (opts || {});
  if (!_show) {
    return Promise.resolve(
      typeof window !== "undefined" && typeof window.prompt === "function"
        ? window.prompt(options.body || options.title || "", options.defaultValue || "")
        : null
    );
  }
  return _show({ ...options, input: true, confirmLabel: options.confirmLabel || "OK" });
}

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
  const [text, setText] = useState("");
  const resolveRef = useRef(null);

  useEffect(() => {
    _show = (opts) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setText(opts?.input ? String(opts.defaultValue ?? "") : "");
        setOptions(opts);
      });
    return () => { _show = null; };
  }, []);

  // Idempotent: resolveRef is cleared on the first settle so the follow-up
  // onOpenChange(false) that Radix fires can't double-resolve.
  const settle = (result) => {
    const r = resolveRef.current;
    const isInput = !!options?.input;
    resolveRef.current = null;
    setOptions(null);
    if (!r) return;
    if (isInput) r(result ? text.trim() : null);
    else r(result);
  };

  const o = options || {};
  return (
    <AlertDialog open={!!options} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{o.title || "Are you sure?"}</AlertDialogTitle>
          {o.body ? <AlertDialogDescription>{o.body}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {o.input && (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); settle(true); } }}
            placeholder={o.placeholder || ""}
            aria-label={o.title || "Value"}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
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
