// The shared formatting toolbar (MiniToolbar) for a plain textarea or input
// (v0.311.0) — so every place a person writes text offers the same
// bold / colour / font / headings / censor / fun tools the journals, bios and
// chat have. The toolbar wraps the selection in the same tags those editors
// write, and the text renders through the shared rich renderers (RichText,
// MarkdownText, renderBulletinContent), so unformatted text stays exactly the
// plain text it always was.
//
// It shows only while its field is focused (or one of its own pop-ups is
// open), so a page with many boxes never stacks toolbars, and with the
// on-screen keyboard up it docks right above it (MiniToolbar float="keyboard").
//
//   const tb = useFieldToolbar({ enabled, fieldRef, value, onChange });
//   <textarea ref={fieldRef} onFocus={tb.onFocus} onBlur={tb.onBlur} … />
//   {tb.toolbar}
//
// onChange takes the new string (not an event).
import React, { useRef, useState, useCallback } from "react";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";

export default function useFieldToolbar({ enabled = true, fieldRef, value, onChange }) {
  const [focused, setFocused] = useState(false);
  // One of the toolbar's own modals (colour, link, help) is open — those take
  // focus by design, and the toolbar must stay mounted or the modal goes too.
  const [modal, setModal] = useState(false);
  // Last touch on the toolbar. Some Android WebViews blur the field even
  // though the buttons preventDefault; the blur check waits for the tap's
  // click to land (same guard as WysiwygEditor's dock).
  const touchAt = useRef(0);
  const insert = useTextareaInsert(fieldRef, value ?? "", onChange);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => {
    const check = (attempt) => {
      if (fieldRef.current && document.activeElement === fieldRef.current) return;
      if (attempt < 8 && Date.now() - touchAt.current < 1000) {
        setTimeout(() => check(attempt + 1), 120);
        return;
      }
      setFocused(false);
    };
    setTimeout(() => check(0), 120);
  }, [fieldRef]);

  const stamp = () => { touchAt.current = Date.now(); };
  const toolbar = enabled && (focused || modal) ? (
    <div data-field-toolbar="" className="mt-1"
      onPointerDown={stamp} onTouchStart={stamp}>
      <MiniToolbar onInsert={insert} float="keyboard" onModalChange={setModal} />
    </div>
  ) : null;

  return { onFocus, onBlur, toolbar };
}
