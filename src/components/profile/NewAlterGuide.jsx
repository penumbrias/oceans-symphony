// The first-time guide on a just-made profile (v0.378.0, Penumbra): the
// "new alter" sheet now asks only for the basics and opens the profile, so
// the first time this happens a small card points at Info, where the rest
// (pronouns, bio, custom fields, pictures, groups) is added. Shown when the
// profile opens with ?new=1 and the guide hasn't been answered yet; the
// answer is SystemSettings.new_alter_guide_seen (profileViewPrefs), so it
// syncs and never comes back on another device.
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { useProfileViewPrefs } from "@/lib/profileViewPrefs";

const TARGET = '[data-tour="alter-profile-edit-btn"]';
const CARD_W = 300;

export function useNewAlterGuide() {
  const [params] = useSearchParams();
  const prefs = useProfileViewPrefs();
  return params.get("new") === "1" && prefs.loaded && !prefs.newAlterGuideSeen;
}

export default function NewAlterGuide({ alter }) {
  const t = useTerms();
  const prefs = useProfileViewPrefs();
  const [params, setParams] = useSearchParams();
  const show = useNewAlterGuide();
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);

  // Sit under the Info button, kept on screen; follow it on resize/scroll.
  useLayoutEffect(() => {
    if (!show) return undefined;
    const place = () => {
      const el = document.querySelector(TARGET);
      if (!el) { setPos(null); return; }
      const r = el.getBoundingClientRect();
      const left = Math.max(12, Math.min(window.innerWidth - CARD_W - 12, r.left + r.width / 2 - CARD_W / 2));
      setPos({ top: r.bottom + 10, left, arrow: Math.max(16, Math.min(CARD_W - 16, r.left + r.width / 2 - left)) });
    };
    place();
    const id = setInterval(place, 500); // the header settles after fonts load
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { clearInterval(id); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [show]);

  // The ?new=1 marker is only for this first open.
  useEffect(() => {
    if (show || params.get("new") !== "1" || !prefs.loaded) return;
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }, [show, params, prefs.loaded, setParams]);

  if (!show) return null;
  const finish = async (openInfo) => {
    setBusy(true);
    try { await prefs.set("newAlterGuideSeen", true); } catch (e) { toast.error(e?.message || "That didn't save"); } finally { setBusy(false); }
    if (openInfo) document.querySelector(TARGET)?.click();
  };
  const name = alter?.name || `this ${t.alter}`;
  return (
    <div role="dialog" aria-labelledby="new-alter-guide-title" data-new-alter-guide=""
      className="fixed z-[70] rounded-2xl border border-primary/40 bg-card shadow-xl p-4 space-y-2 os-card"
      style={pos ? { top: pos.top, left: pos.left, width: CARD_W } : { top: 120, left: "50%", transform: "translateX(-50%)", width: CARD_W }}>
      {pos && (
        <span aria-hidden="true" className="absolute -top-2 w-4 h-4 rotate-45 bg-card border-l border-t border-primary/40"
          style={{ left: pos.arrow - 8 }} />
      )}
      <h2 id="new-alter-guide-title" className="text-sm font-semibold flex items-center gap-2">
        <IdCard className="w-4 h-4 text-primary" aria-hidden="true" /> {name} is here
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Add the rest in Info: pronouns, bio, custom fields, pictures and groups. Edit page changes how this profile looks.
      </p>
      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={busy} onClick={() => finish(true)} className="flex-1 min-h-[40px]">Open Info</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => finish(false)} className="flex-1 min-h-[40px]">Got it</Button>
      </div>
    </div>
  );
}
