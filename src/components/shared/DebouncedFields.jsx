// Text fields that save as you type (debounced) and never lose the last
// letters: they flush on blur, on unmount, and when the app is hidden or
// closed. Shared by the widget inspector and the Alter info list (v0.294.0).
import React from "react";
import useFieldToolbar from "@/components/shared/useFieldToolbar";
const WysiwygEditorLazy = React.lazy(() => import("@/components/shared/WysiwygEditor"));

// Rich text with a DEBOUNCED commit — the wysiwyg emits per keystroke and
// committing straight through would persist the whole board every letter.
// Local state is the truth while typing (never re-seeded from the prop —
// the "description won't delete" lesson); pending text flushes on unmount.
export function RichTextField({ value, onCommit, placeholder }) {
  const [draft, setDraft] = React.useState(value || "");
  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;
  const flushNow = React.useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current != null) { const v = pending.current; pending.current = null; commitRef.current(v); }
  }, []);
  React.useEffect(() => {
    // Same as DebouncedText: write what was typed if the app is closed or
    // backgrounded with the editor still open.
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
  }, [flushNow]);
  const change = (v) => {
    setDraft(v);
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = null; commitRef.current(v); }, 600);
  };
  return (
    // Leaving the editor (tapping Undo, another field) writes what was typed
    // first, so an undo right after typing undoes that text too.
    <div onBlur={flushNow}>
      <React.Suspense fallback={<div className="h-24 rounded-lg border border-input bg-background animate-pulse" />}>
        <WysiwygEditorLazy value={draft} onChange={change} placeholder={placeholder || "Write anything here…"} />
      </React.Suspense>
    </div>
  );
}

// Text inputs here commit as you type (debounced) AND flush on unmount.
// Committing only onBlur loses whatever was typed when the sheet is closed
// with Escape or the drag handle — the input unmounts without ever blurring,
// and the user's text is simply gone.
// toolbar: the shared formatting toolbar while the box is focused (v0.311.0)
// — only where the saved text renders rich (MarkdownText and friends).
export function DebouncedText({ value, onCommit, multiline, rows, maxLength, placeholder, className, type, inputMode, ariaLabel, toolbar = false }) {
  const [local, setLocal] = React.useState(value ?? "");
  const fieldRef = React.useRef(null);
  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;

  React.useEffect(() => {
    const flushNow = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (pending.current !== null) { const v = pending.current; pending.current = null; commitRef.current(v); }
    };
    // The Android back button can close the app outright, and a phone can
    // background it mid-typing; neither unmounts this field in time, so
    // the last few letters would never be written. Flush as the page hides.
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
  }, []);

  const change = (v) => {
    setLocal(v);
    pending.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const val = pending.current;
      pending.current = null;
      if (val !== null) commitRef.current(val);
    }, 350);
  };
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { const v = pending.current; pending.current = null; onCommit(v); }
  };

  const fieldToolbar = useFieldToolbar({ enabled: toolbar, fieldRef, value: local, onChange: change });

  const props = {
    ref: fieldRef, value: local, placeholder, maxLength, className, "aria-label": ariaLabel,
    onChange: (e) => change(e.target.value),
    onFocus: fieldToolbar.onFocus,
    onBlur: () => { flush(); fieldToolbar.onBlur(); },
  };
  const field = multiline ? <textarea {...props} rows={rows || 3} /> : <input {...props} type={type} inputMode={inputMode} />;
  if (!toolbar) return field;
  return <div className="min-w-0">{field}{fieldToolbar.toolbar}</div>;
}

