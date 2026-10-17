// A gentle, skippable note when an activity starts that an alter tends to
// interrupt (AlterActivityLink "interrupts"): who, and what they've been
// wishing for — interrupting is usually a need that hasn't been met yet.
// Shows once per start; "Got it" or leaving it alone is fine.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeartHandshake, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { ACTIVITY_STARTED_EVENT } from "@/lib/activitySession";
import { interruptersFor } from "@/lib/needs";

const safe = async (entity) => { try { return (await base44.entities[entity].list()) || []; } catch { return []; } };

export default function InterruptCheckNote() {
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const [note, setNote] = useState(null); // { name, people: [...] }

  useEffect(() => {
    const onStart = async (e) => {
      const session = e?.detail;
      if (!session?.categoryId) return;
      try {
        const links = await safe("AlterActivityLink");
        if (!links.some((l) => l.relation === "interrupts")) return;
        const [categories, wishes, alters] = await Promise.all([safe("ActivityCategory"), safe("Wish"), safe("Alter")]);
        const people = interruptersFor(session.categoryId, { links, categories, wishes, alters, excludeIds: session.alterIds || [] });
        if (people.length) setNote({ name: session.name || "this", people });
      } catch { /* a check-in note is never worth an error */ }
    };
    window.addEventListener(ACTIVITY_STARTED_EVENT, onStart);
    return () => window.removeEventListener(ACTIVITY_STARTED_EVENT, onStart);
  }, []);

  if (!note) return null;
  const names = note.people.map((p) => formatAlter(p.alter)).join(", ");
  return (
    <div role="status" data-tour="needs-interrupt-note"
      className="fixed left-3 right-3 z-50 mx-auto max-w-md rounded-2xl border border-primary/30 bg-card shadow-lg p-3 space-y-2"
      style={{ bottom: "calc(0.75rem + var(--bottom-nav-height, 56px) + var(--os-sab, 0px))" }}>
      <div className="flex items-start gap-2">
        <HeartHandshake className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="flex-1 text-sm">
          Starting {note.name}: {names} sometimes {note.people.length === 1 ? "needs" : "need"} something during it.
        </p>
        <button type="button" aria-label="Close" className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setNote(null)}>
          <X className="w-4 h-4" />
        </button>
      </div>
      {note.people.map((p) => (
        <div key={p.alter.id} className="pl-6 text-xs text-muted-foreground">
          {p.wishes.length > 0
            ? <>{formatAlter(p.alter)} has been wishing for: {p.wishes.slice(0, 3).map((w) => w.title).join(", ")}{p.wishes.length > 3 ? "…" : ""}</>
            : <>Nothing on {formatAlter(p.alter)}'s wishlist yet. A quick check-in with them might help.</>}
        </div>
      ))}
      <div className="flex gap-2 justify-end">
        <button type="button" className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
          onClick={() => { setNote(null); navigate(`/needs?tab=balance&highlight=${note.people[0].alter.id}`); }}>
          See their needs
        </button>
        <button type="button" className="text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground" onClick={() => setNote(null)}>
          Got it
        </button>
      </div>
    </div>
  );
}
