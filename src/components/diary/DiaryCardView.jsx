import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function Section({ emoji, title, children, summary }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <span className="flex-1 font-medium text-sm text-left">{title}</span>
        <span className="text-xs text-muted-foreground mr-2">{summary}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

function RatingDisplay({ label, value, max = 5 }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value !== undefined && value !== null ? (
        <div className="flex gap-1">
          {Array.from({ length: max }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-md text-xs flex items-center justify-center font-medium ${
                i < value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic">Not rated</span>
      )}
    </div>
  );
}

export default function DiaryCardView({ card, altersById, sections }) {
  return (
    <div className="space-y-2">
      {sections.map((s) => {
        if (s.id === "emotions") {
          const e = card.emotions || [];
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={e.length ? `${e.length} selected` : "None"}>
              {e.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {e.map((em) => (
                    <span key={em} className="px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 font-medium">{em}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No emotions logged</p>
              )}
            </Section>
          );
        }

        if (s.id === "urges") {
          const u = card.urges || {};
          const count = [u.suicidal, u.self_harm, u.alcohol_drugs].filter((v) => v !== undefined).length;
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={count ? `${count} rated` : "None rated"}>
              <div className="space-y-3">
                <RatingDisplay label="🆘 Suicidal urges" value={u.suicidal} />
                <RatingDisplay label="✏️ Self-harm" value={u.self_harm} />
                <RatingDisplay label="🍺 Alcohol/drugs" value={u.alcohol_drugs} />
              </div>
            </Section>
          );
        }

        if (s.id === "body_mind") {
          const bm = card.body_mind || {};
          const count = [bm.emotional_misery, bm.physical_misery, bm.joy].filter((v) => v !== undefined).length;
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={count ? `${count} rated` : "None rated"}>
              <div className="space-y-3">
                <RatingDisplay label="😩 Emotional misery" value={bm.emotional_misery} />
                <RatingDisplay label="🖐️ Physical misery" value={bm.physical_misery} />
                <RatingDisplay label="✨ Joy" value={bm.joy} />
              </div>
            </Section>
          );
        }

        if (s.id === "skills") {
          const val = card.skills_practiced;
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={val !== undefined ? `${val} / 7` : "Not rated"}>
              <RatingDisplay label="🧠 Skills practiced" value={val} max={7} />
            </Section>
          );
        }

        if (s.id === "medication") {
          const m = card.medication_safety || {};
          const hasData = m.rx_meds_taken !== undefined || m.self_harm_occurred !== undefined || m.substances_count !== undefined;
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={hasData ? "Logged" : "Not set"}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">💊 Rx meds taken</span>
                  <span className={m.rx_meds_taken ? "text-green-500 font-medium" : "text-muted-foreground"}>
                    {m.rx_meds_taken === undefined ? "—" : m.rx_meds_taken ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">✏️ Self-harm occurred</span>
                  <span className={m.self_harm_occurred ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {m.self_harm_occurred === undefined ? "—" : m.self_harm_occurred ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🍺 Substances</span>
                  <span className="text-foreground">{m.substances_count ?? "—"}</span>
                </div>
              </div>
            </Section>
          );
        }

        if (s.id === "notes") {
          const n = card.notes || {};
          const hasNotes = n.what || n.judgments || n.optional;
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={hasNotes ? "Written" : "No notes"}>
              {hasNotes ? (
                <div className="space-y-3 text-sm">
                  {n.what && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">What happened?</p>
                      <p className="text-foreground">{n.what}</p>
                    </div>
                  )}
                  {n.judgments && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Judgments</p>
                      <p className="text-foreground">{n.judgments}</p>
                    </div>
                  )}
                  {n.optional && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Optional context</p>
                      <p className="text-foreground">{n.optional}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes written</p>
              )}
            </Section>
          );
        }

        if (s.id === "checklist") {
          const cl = card.checklist || {};
          const symptoms = cl.symptoms || {};
          const habits = cl.habits || {};
          const total = Object.values(symptoms).filter((v) => v !== undefined).length + Object.values(habits).filter((v) => v !== undefined).length;
          return (
            <Section key={s.id} emoji={s.emoji} title={s.label || s.title} summary={total > 0 ? `${total} logged` : "Not logged"}>
              {total > 0 ? (
                <div className="space-y-3">
                  {Object.keys(symptoms).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Symptoms</p>
                      <div className="space-y-1.5">
                        {Object.entries(symptoms).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span className="text-foreground font-medium">{typeof val === "boolean" ? (val ? "Yes" : "No") : val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.keys(habits).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Habits</p>
                      <div className="space-y-1.5">
                        {Object.entries(habits).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span className="text-foreground font-medium">{typeof val === "boolean" ? (val ? "Yes" : "No") : val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No symptoms/habits logged</p>
              )}
            </Section>
          );
        }

        return null;
      })}
    </div>
  );
}