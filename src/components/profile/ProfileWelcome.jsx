// "How this page works" (v0.361.0) — a one-time card at the top of the
// first profile someone opens after the profiles became widget pages.
// People coming from the old profile couldn't tell reading from editing;
// this says it once, plainly, and points at the two buttons. Answering it
// is a field on SystemSettings (profile_welcome_seen), so it syncs and
// never comes back on another device.
import React, { useState } from "react";
import { toast } from "sonner";
import { Eye, IdCard, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { useProfileViewPrefs } from "@/lib/profileViewPrefs";

export default function ProfileWelcome() {
  const t = useTerms();
  const prefs = useProfileViewPrefs();
  const [busy, setBusy] = useState(false);
  if (!prefs.loaded || prefs.welcomeSeen) return null;
  const done = async () => {
    setBusy(true);
    try { await prefs.set("welcomeSeen", true); } catch (e) { toast.error(e?.message || "That didn't save"); } finally { setBusy(false); }
  };
  const rows = [
    { icon: Eye, text: "You're reading this page. Nothing on it moves unless you ask it to." },
    { icon: IdCard, text: `Info changes the details: name, pronouns, bio, custom fields, pictures and groups.` },
    { icon: Pencil, text: "Edit page moves, resizes, hides or adds parts of the page. Each part is a widget, so the page can be shaped however suits you." },
  ];
  return (
    <section aria-labelledby="profile-welcome-title" data-profile-welcome=""
      className="mx-2 mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
      <h2 id="profile-welcome-title" className="text-sm font-semibold text-foreground">How {t.alter} profiles work now</h2>
      <ul className="space-y-1.5">
        {rows.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Icon className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Prefer the older one-page form? Settings → {t.Alters} → Profile layouts → "Classic edit form for every {t.alter}".
      </p>
      <div className="pt-1">
        <Button size="sm" disabled={busy} onClick={done} className="min-h-[44px]">Got it</Button>
      </div>
    </section>
  );
}
