// The Emergency info page in the pixel look (EmergencyPhone mockup): the
// big "Show my emergency info" button, every part of the card as a row
// (with "locked" on the parts the unlock screen shows), and the lock-screen
// switch. The record's one door is still EmergencyInfoSheet (Edit opens
// it) and every write goes through saveEmergencyInfo.

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";
import { CARD_SECTIONS, flagOf, saveEmergencyInfo, EMERGENCY_INFO_KEY } from "@/lib/emergencyInfo";
import "@/styles/pixel/care.css";

function sectionText(s) {
  if (!s) return "";
  const lines = [...(s.lines || [])];
  for (const c of s.contacts || []) lines.push([c.name, c.phone].filter(Boolean).join(" · "));
  return lines.join("\n");
}

export default function EmergencyPixel({ info, sections, isFetched, onShow, onEdit }) {
  const qc = useQueryClient();
  const byId = new Map(sections.map((s) => [s.id, s]));
  const lockOn = flagOf(info, "lock_copy");
  const picked = new Set(Array.isArray(info?.lock_fields) ? info.lock_fields : []);
  const filled = sections.length > 0;
  const toggleLock = async () => {
    try {
      await saveEmergencyInfo({ lock_copy: !lockOn });
      qc.invalidateQueries({ queryKey: EMERGENCY_INFO_KEY });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    }
  };
  return (
    <div className="px-cr" data-tour="emergency-page">
      <div className="px-cr-head">
        <h1 className="px-cr-title">Emergency info</h1>
        <button type="button" className="px-cr-btn" onClick={() => onEdit("about")} data-tour="emergency-info-btn"
          title="Everything on your emergency card">Info</button>
      </div>
      {filled ? (
        <>
          <button type="button" className="px-cr-btn on px-em-show" onClick={onShow} data-tour="emergency-show-btn">
            Show my emergency info
          </button>
          <p className="px-em-cap">For someone helping you when you can't speak.</p>
        </>
      ) : isFetched && (
        <section className="px-cr-pn">
          <h2 className="px-cr-ttl"><span>Your emergency card</span></h2>
          <p className="px-cr-empty">
            Fill in what a helper should know if you can't speak or need help: how to talk with you, allergies, medications and who to call. You choose everything that goes on it.
          </p>
          <div style={{ padding: "0 12px 12px" }}>
            <button type="button" className="px-cr-btn on" onClick={() => onEdit("about")}>Fill it in</button>
          </div>
        </section>
      )}
      <div className="px-cr-grid">
        <section className="px-cr-pn" aria-label="Everything on your card">
          <h2 className="px-cr-ttl">
            <span>Everything on your card</span>
            <button type="button" className="px-cr-link" onClick={() => onEdit("card")}>Edit</button>
          </h2>
          <ul className="px-em-rows">
            {CARD_SECTIONS.map((c) => {
              const text = sectionText(byId.get(c.id));
              return (
                <li key={c.id}>
                  <div className="px-em-row">
                    <span className="px-em-k">{c.label}</span>
                    <span className={`px-em-v${text ? "" : " empty"}`}>{text || "Not filled in yet"}</span>
                    {lockOn && picked.has(c.id) && text && <span className="px-em-lock">locked</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="px-cr-col">
          <section className="px-cr-pn">
            <h2 className="px-cr-ttl"><span>Lock screen</span></h2>
            <div className="px-em-lockp">
              <button type="button" role="switch" aria-checked={lockOn} className="px-cr-check" onClick={toggleLock}>
                <span className="px-cr-tick" aria-hidden="true">{lockOn ? "x" : ""}</span>
                <span>Show chosen parts without my password</span>
              </button>
              <p className="px-cr-mut" style={{ fontSize: 12, margin: 0 }}>
                {lockOn
                  ? (picked.size ? "Parts marked “locked” show on the unlock screen." : "Nothing is picked yet, so nothing shows.")
                  : "Off: the card only shows inside the app. Anyone holding your device can read the parts you pick."}
              </p>
              {lockOn && (
                <button type="button" className="px-cr-btn sm" style={{ alignSelf: "flex-start" }} onClick={() => onEdit("lock")}>
                  Choose what shows
                </button>
              )}
            </div>
          </section>
          <MedicalDisclaimerFooter />
        </div>
      </div>
    </div>
  );
}
