import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow } from "date-fns";
import { Users, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { endEncounter } from "@/lib/contactEncounters";
import { contactDisplayName } from "@/lib/contacts";

// Dashboard "Currently with" row — mirrors Active Activities / Current
// Symptoms. Shows the contacts you've marked yourself as with right now
// (active ContactEncounter sessions), each tappable to their profile with a
// quick End button. Renders nothing when you're not with anyone.
//
// Starting an encounter happens from a contact's profile ("I'm with them")
// or, later, the Quick Check-In "Who are you with?" section.
export default function CurrentContacts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [busyId, setBusyId] = useState(null);

  const { data: encounters = [] } = useQuery({
    queryKey: ["contactEncounters"],
    queryFn: () => base44.entities.ContactEncounter.list(),
  });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const contactsById = Object.fromEntries(contacts.map((c) => [c.id, c]));

  const active = encounters
    .filter((e) => e.is_active && contactsById[e.contact_id])
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  // Keep the "· for N minutes" labels fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  if (active.length === 0) return null;

  const end = async (enc) => {
    setBusyId(enc.id);
    try {
      await endEncounter(enc.id);
      queryClient.invalidateQueries({ queryKey: ["contactEncounters"] });
      const c = contactsById[enc.contact_id];
      toast.success(`Ended time with ${c ? contactDisplayName(c) : "contact"}`);
    } catch (err) {
      toast.error(err?.message || "Couldn't end");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" /> Currently with
      </p>
      <div className="flex flex-wrap gap-2">
        {active.map((enc) => {
          const c = contactsById[enc.contact_id];
          const color = c.color || "#0ea5e9";
          const name = contactDisplayName(c);
          return (
            <div
              key={enc.id}
              className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border text-xs font-medium"
              style={{ borderColor: color, backgroundColor: `${color}15`, color }}
            >
              <button onClick={() => navigate(`/contacts/${c.id}`)} className="flex items-center gap-1.5 active:scale-95" title="Open profile">
                {name}
                {enc.start_time && <span className="opacity-60 font-normal">· {formatDistanceToNow(new Date(enc.start_time))}</span>}
              </button>
              <button
                onClick={() => end(enc)}
                disabled={busyId === enc.id}
                title="End"
                className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10"
              >
                {busyId === enc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
