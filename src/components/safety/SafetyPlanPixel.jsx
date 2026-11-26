// The Safety plan in the pixel look (SafetyPlanPhone mockup): quick
// access (call your first emergency contact, crisis lines, grounding,
// emergency info), the window of tolerance as rows you can tap to say
// where you are, the warning signs, and the coping cards. It reads the
// same Learn exercise answers as the classic page and writes nothing;
// Edit opens the Learn lesson that owns them.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";
import CrisisResourcesCard from "@/components/grounding/CrisisResourcesCard";
import { useEmergencyCard } from "@/lib/useEmergencyCard";
import { emergencySupportContacts, contactDisplayName } from "@/lib/contacts";
import { cardContacts } from "@/lib/emergencyInfo";
import "@/styles/pixel/care.css";

// Same labels (and level numbers) as the classic page's window plan.
const LEVELS = [
  { n: 1, label: "Calm & regulated", color: "#86b88f" },
  { n: 2, label: "Alert & focused", color: "#8fb8e0" },
  { n: 3, label: "Coping needed", color: "#e3c16f" },
  { n: 4, label: "Highly activated", color: "#d98f5b" },
  { n: 5, label: "Crisis", color: "#ef8a6a" },
];
const SIGNS = [
  { k: "Earliest warning signs", sign: "earliest_signs", act: "earliest_response", color: "#e3c16f", doLabel: "What I will do" },
  { k: "Increased risk signs", sign: "increased_signs", act: "increased_response", color: "#d98f5b", doLabel: "What I will do" },
  { k: "Emergency signs", sign: "emergency_signs", act: "emergency_response", color: "#ef8a6a", doLabel: "What I will do to stay safe" },
];
const LESSON = "/grounding?tab=learn&topic=m4_t3";

export default function SafetyPlanPixel({ safetyPlanEntry, copingCardsEntry, windowEntry }) {
  const navigate = useNavigate();
  const [here, setHere] = useState(null);
  const [lines, setLines] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const { sections, isFetched: cardReady } = useEmergencyCard();
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const firstCall = useMemo(
    () => cardContacts(emergencySupportContacts(contacts), { displayName: contactDisplayName }).find((c) => c.phone) || null,
    [contacts],
  );
  const signs = safetyPlanEntry?.responses || {};
  const coping = Object.entries(copingCardsEntry?.responses || {}).filter(([, v]) => v);
  const win = windowEntry?.responses || {};
  const winRows = LEVELS.filter((l) => win[`level${l.n}_notice`] || win[`level${l.n}_helps`]);
  const hasPlan = !!(safetyPlanEntry || copingCardsEntry || windowEntry);
  const cardFilled = sections.length > 0;

  return (
    <div className="px-cr">
      <div className="px-cr-head">
        <h1 className="px-cr-title">{hasPlan ? "My safety plan" : "Your safety plan"}</h1>
        <button type="button" className="px-cr-btn" onClick={() => navigate(LESSON)}>{hasPlan ? "Edit" : "Build it"}</button>
      </div>
      <div className="px-cr-grid">
        <div className="px-cr-col">
          <section className="px-cr-pn">
            <h2 className="px-cr-ttl"><span>Quick access</span></h2>
            <div className="px-sp-quick">
              {firstCall && (
                <a className="px-cr-btn on" href={`tel:${firstCall.phone.replace(/[^\d+]/g, "")}`}>Call {firstCall.name}</a>
              )}
              <button type="button" className={`px-cr-btn${firstCall ? "" : " on"}`} aria-expanded={lines} onClick={() => setLines((v) => !v)}>Crisis line</button>
              <button type="button" className="px-cr-btn" onClick={() => navigate("/grounding")}>Grounding</button>
              {cardReady && (
                <button type="button" className="px-cr-btn" onClick={() => navigate(cardFilled ? "/emergency?show=1" : "/emergency?edit=1")}>
                  {cardFilled ? "Emergency info" : "Set up emergency info"}
                </button>
              )}
            </div>
            {lines && <div style={{ padding: "0 10px 10px" }}><CrisisResourcesCard defaultOpen /></div>}
          </section>

          {!hasPlan && (
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl"><span>Not built yet</span></h2>
              <p className="px-cr-empty">You haven't built your safety plan yet. You can create one in the Learn section: warning signs, what you will do, coping cards and your window of tolerance.</p>
              <div style={{ padding: "0 12px 12px" }}>
                <button type="button" className="px-cr-btn on" onClick={() => navigate(LESSON)}>Go to the safety plan lesson</button>
              </div>
            </section>
          )}

          {winRows.length > 0 && (
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl"><span>Window of tolerance</span><span className="px-cr-mut">tap where you are</span></h2>
              <ul className="px-sp-win">
                {winRows.map((l) => {
                  const notice = win[`level${l.n}_notice`];
                  const helps = win[`level${l.n}_helps`];
                  const on = here === l.n;
                  return (
                    <li key={l.n}>
                      <button type="button" className="px-sp-lvl" aria-pressed={on} onClick={() => setHere(on ? null : l.n)}>
                        <span className="px-cr-sq" style={{ background: l.color }} aria-hidden="true" />
                        <span className="px-sp-lvl-name">{l.label}</span>
                        <span className="px-sp-lvl-help">{helps || notice}</span>
                      </button>
                      {on && notice && helps && <div className="px-sp-lvl-detail">I notice: {notice}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="px-cr-col">
          {safetyPlanEntry && (
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl"><span>Warning signs</span>
                <button type="button" className="px-cr-link" onClick={() => navigate(LESSON)}>Edit</button></h2>
              {SIGNS.map((s) => (
                <div key={s.sign} className="px-sp-sign">
                  <span className="px-sp-sign-k" style={{ color: s.color }}>{s.k}</span>
                  <span className={`px-sp-sign-v${signs[s.sign] ? "" : " px-cr-mut"}`}>{signs[s.sign] || "Not filled in yet"}</span>
                  <span className="px-sp-sign-do">{s.doLabel}: {signs[s.act] || "—"}</span>
                </div>
              ))}
            </section>
          )}

          {cardsOpen && coping.length > 0 && (
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl"><span>My coping cards</span>
                <button type="button" className="px-cr-link" onClick={() => setCardsOpen(false)}>Close</button></h2>
              <div className="px-sp-cards">
                {coping.map(([key, value]) => (
                  <div key={key} className="px-sp-card px-cr-ins">
                    <div className="px-sp-card-k">{key.replace(/_/g, " ")}</div>
                    <div>{value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="px-cr-two px-sp-foot">
            {coping.length > 0 ? (
              <button type="button" className="px-cr-btn" aria-expanded={cardsOpen} onClick={() => setCardsOpen((v) => !v)}>
                My coping cards {coping.length}
              </button>
            ) : (
              <button type="button" className="px-cr-btn" onClick={() => navigate("/grounding?tab=learn")}>Learn</button>
            )}
            <button type="button" className="px-cr-btn" onClick={() => navigate("/contacts")}>Contacts</button>
          </div>
          <MedicalDisclaimerFooter open={!hasPlan} />
        </div>
      </div>
    </div>
  );
}
