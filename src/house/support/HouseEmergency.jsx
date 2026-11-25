// Emergency info (boards 40-EmergencyPhone and 41-EmergencyCardPhone; plan
// step 3.1). House mode only, on /emergency.
//
//   the page   "Show my emergency info", every part of the card as a row
//              ("locked" on the parts the unlock screen shows), and the
//              lock-screen choice
//   ?show=1    the card itself, big and plain, for a helper: A- / A+ for
//              the text, Call buttons for the emergency contacts. It stays
//              a URL, so Back (or Escape) is the deliberate way out.
//   ?edit=1    opens the record's one door, EmergencyInfoSheet (as Edit does)
//
// Writes only through emergencyInfo.js: the lock-screen choice through
// saveEmergencyInfo, everything else in EmergencyInfoSheet. The card
// sections come from useEmergencyCard, the same list the unlock screen and
// the old page draw.

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Maximize2 } from "lucide-react";
import EmergencyInfoSheet from "@/components/emergency/EmergencyInfoSheet";
import { useEmergencyCard } from "@/lib/useEmergencyCard";
import { CARD_SECTIONS, flagOf, saveEmergencyInfo, EMERGENCY_INFO_KEY } from "@/lib/emergencyInfo";
import { Button, LinkButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Checkbox } from "@/house/kit/Choices";
import { EmptyBlock } from "@/house/kit/States";
import { emergencyRows, stepCardSize, telHref } from "@/house/support/supportModel";
import { NotMedicalPanel, useStepBack } from "@/house/support/supportParts";

function EmergencyCard({ sections, onClose }) {
  const [size, setSize] = useState("md");
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const calls = sections.flatMap((s) => s.contacts || []);
  return (
    <section className="hs-ecard" data-size={size} aria-labelledby="hs-ecard-t" data-tour="emergency-card">
      <div className="hs-ecard-head">
        <h2 id="hs-ecard-t" className="hs-ecard-title house-label">Emergency information</h2>
        <Button rank="secondary" aria-label="Smaller text" disabledReason={size === "md" ? "Already the smallest" : undefined}
          onClick={() => setSize((s) => stepCardSize(s, -1))}>A-</Button>
        <Button rank="secondary" aria-label="Bigger text" disabledReason={size === "xl" ? "Already the biggest" : undefined}
          onClick={() => setSize((s) => stepCardSize(s, 1))}>A+</Button>
      </div>
      <div className="hs-ecard-body">
        {sections.filter((s) => s.id !== "contacts").map((s) => (
          <div key={s.id} className="hs-ecard-part">
            <h3 className="hs-ecard-k house-label">{s.label}</h3>
            {s.lines.map((l, i) => <p key={i} className={s.id === "allergies" || s.id === "communication" ? "hs-ecard-v hs-strong" : "hs-ecard-v"}>{l}</p>)}
          </div>
        ))}
        {calls.length ? (
          <div className="hs-ecard-part">
            <h3 className="hs-ecard-k house-label">Contacts</h3>
            {calls.filter((c) => !c.phone).map((c, i) => <p key={`n${i}`} className="hs-ecard-v">{[c.name, c.relation].filter(Boolean).join(" · ")}</p>)}
            <div className="hs-opts">
              {calls.filter((c) => c.phone).map((c, i) => (
                <LinkButton key={i} rank={i === 0 ? "primary" : "secondary"} href={telHref(c.phone)}
                  aria-label={`Call ${c.name}${c.relation ? `, ${c.relation}` : ""}, ${c.phone}`}>{`Call ${c.name}`}</LinkButton>
              ))}
            </div>
          </div>
        ) : null}
        <Button rank="quiet" onClick={onClose}>Close the card</Button>
      </div>
    </section>
  );
}

export default function HouseEmergency({ size = "full" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const back = useStepBack("/emergency");
  const { info, sections, isFetched } = useEmergencyCard();
  const q = new URLSearchParams(location.search);
  const showing = q.get("show") === "1";
  const [editing, setEditing] = useState(null); // null | sheet tab
  const [busy, setBusy] = useState(false);
  // ?edit=1 opens Info once, then leaves the address.
  useEffect(() => {
    if (q.get("edit") !== "1") return;
    setEditing("about");
    navigate("/emergency", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const lockOn = flagOf(info, "lock_copy");
  const picked = Array.isArray(info?.lock_fields) ? info.lock_fields : [];
  const rows = emergencyRows(CARD_SECTIONS, sections, { lockOn, lockFields: picked });
  const filled = sections.length > 0;
  const toggleLock = async (on) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveEmergencyInfo({ lock_copy: !!on });
      qc.invalidateQueries({ queryKey: EMERGENCY_INFO_KEY });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that. Nothing was changed.");
    } finally { setBusy(false); }
  };
  const sheet = <EmergencyInfoSheet key={editing || "closed"} initialTab={editing || "about"} open={!!editing} onClose={() => setEditing(null)} />;

  if (showing && filled) {
    return (
      <div className="hs-room" data-room="emergency-card" data-size={size}>
        <EmergencyCard sections={sections} onClose={back} />
      </div>
    );
  }

  return (
    <div className="hs-room" data-room="emergency" data-size={size} data-tour="emergency-page">
      {filled ? (
        <>
          <Button rank="primary" block icon={Maximize2} className="hs-show" data-tour="emergency-show-btn"
            onClick={() => navigate("/emergency?show=1")}>Show my emergency info</Button>
          <p className="hs-cap">For someone helping you when you can't speak.</p>
        </>
      ) : isFetched ? (
        <Panel title="Your emergency card" className="hs-panel">
          <EmptyBlock compact title="Nothing on it yet"
            body="Fill in what a helper should know if you can't speak or need help: how to talk with you, allergies, medications and who to call. You choose everything on it."
            action={{ rank: "primary", label: "Fill it in", onClick: () => setEditing("about") }} />
        </Panel>
      ) : null}

      <div className="hs-grid hs-grid--emergency">
        <Panel title="Everything on your card" className="hs-panel hs-erows"
          tools={<Button rank="quiet" data-tour="emergency-info-btn" onClick={() => setEditing("card")}>Edit</Button>}>
          <ul className="hs-list">
            {rows.map((r) => (
              <li key={r.id} className="hs-erow">
                <span className="hs-erow-k house-label">{r.label}</span>
                <span className={`hs-erow-v${r.text ? "" : " hs-empty"}`}>{r.text || "Not filled in yet"}</span>
                {r.locked ? <span className="hs-locked house-label">locked</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="hs-col">
          <Panel title="Lock screen" className="hs-panel hs-lock">
            <div data-tour="emergency-lock">
              <Checkbox label="Show chosen parts without my password" checked={lockOn} onChange={toggleLock}
                description={lockOn
                  ? (picked.length ? "Parts marked \"locked\" show on the unlock screen." : "Nothing is chosen yet, so nothing shows.")
                  : "Off: the card only shows inside the app. Anyone holding your device can read the parts you choose."} />
            </div>
            {lockOn ? <Button rank="secondary" onClick={() => setEditing("lock")}>Choose what shows</Button> : null}
          </Panel>
          <NotMedicalPanel />
        </div>
      </div>
      {sheet}
    </div>
  );
}
