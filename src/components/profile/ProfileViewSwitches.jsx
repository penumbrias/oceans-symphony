// The two "how profiles behave" switches (v0.361.0), shown in Settings →
// Alter setup → Profile layouts. The classic-form switch is also on the
// alter's Info → Profile page group, where people look for it.
import React, { useState } from "react";
import { toast } from "sonner";
import { SwitchRow } from "@/components/shared/SettingRows";
import { useTerms } from "@/lib/useTerms";
import { useProfileViewPrefs } from "@/lib/profileViewPrefs";

export default function ProfileViewSwitches({ show = ["holdToEdit", "classicForm"] }) {
  const t = useTerms();
  const prefs = useProfileViewPrefs();
  const [busy, setBusy] = useState(false);
  const flip = async (key, on) => {
    if (busy) return;
    setBusy(true);
    try { await prefs.set(key, on); } catch (e) { toast.error(e?.message || "That didn't save"); } finally { setBusy(false); }
  };
  return (
    <div data-profile-view-switches="">
      {show.includes("holdToEdit") && (
        <SwitchRow label="Hold a widget to change the page"
          hint="Off: a profile only changes layout when you tap Edit page (the pencil). The home screen isn't affected."
          checked={prefs.holdToEdit} onChange={(on) => flip("holdToEdit", on)} />
      )}
      {show.includes("classicForm") && (
        <SwitchRow label={`Classic edit form for every ${t.alter}`}
          hint={`One switch for the whole app: on every ${t.alter} profile, Info opens the older one-page form with a Save button. Both change the same details.`}
          checked={prefs.classicForm} onChange={(on) => flip("classicForm", on)} />
      )}
    </div>
  );
}
