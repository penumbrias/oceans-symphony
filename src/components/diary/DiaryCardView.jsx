import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function Section({ emoji, title, summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <span className="flex-1 font-medium text-sm text-left">{title}</span>
        {summary && <span className="text-xs text-muted-foreground mr-2">{summary}</span>}
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

function RatingRow({ label, value, max = 5 }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} className={`w-5 h-5 rounded-md text-xs flex items-center justify-center font-medium ${
            i < value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>{i + 1}</div>
        ))}
      </div>
    </div>
  );
}

export default function DiaryCardView({ card, altersById, sections }) {
  const emotions = card.emotions || [];
  const urges = card.urges || {};
  const bm = card.body_mind || {};
  const med = card.medication_safety || {};
  const notes = card.notes || {};
  const cl = card.checklist || {};
  const symptoms = cl.symptoms || {};
  const habits = cl.habits || {};

  const hasUrges = urges.suicidal !== undefined || urges.self_harm !== undefined || urges.alcohol_drugs !== undefined;
  const hasBodyMind = bm.emotional_misery !== undefined || bm.physical_misery !== undefined || bm.joy !== undefined;
  const hasSkills = card.skills_practiced !== undefined;
  const hasMed = med.rx_meds_taken !== undefined || med.self_harm_occurred !== undefined || med.substances_count !== undefined;
  const hasNotes = !!(notes.what || notes.judgments || notes.optional);
  const hasSymptoms = Object.keys(symptoms).length > 0 || Object.keys(habits).length > 0;

  return (
    <div className="space-y-2">
      {emotions.length > 0 && (
        <Section emoji="💜" title="Emotions" summary={`${emotions.length} selected`}>
          <div className="flex flex-wrap gap-1.5">
            {emotions.map((em) => (
              <span key={em} className="px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20 font-medium">{em}</span>
            ))}
          </div>
        </Section>
      )}

      {hasUrges && (
        <Section emoji="⚠️" title="Urges" summary={[urges.suicidal, urges.self_harm, urges.alcohol_drugs].filter(v => v !== undefined).length + " rated"}>
          <div className="space-y-3">
            <RatingRow label="🆘 Suicidal urges" value={urges.suicidal} />
            <RatingRow label="✏️ Self-harm" value={urges.self_harm} />
            <RatingRow label="🍺 Alcohol/drugs" value={urges.alcohol_drugs} />
          </div>
        </Section>
      )}

      {hasBodyMind && (
        <Section emoji="🧠" title="Body + Mind" summary={[bm.emotional_misery, bm.physical_misery, bm.joy].filter(v => v !== undefined).length + " rated"}>
          <div className="space-y-3">
            <RatingRow label="😩 Emotional misery" value={bm.emotional_misery} />
            <RatingRow label="🖐️ Physical misery" value={bm.physical_misery} />
            <RatingRow label="✨ Joy" value={bm.joy} />
          </div>
        </Section>
      )}

      {hasSkills && (
        <Section emoji="🛠️" title="Skills" summary={`${card.skills_practiced} / 7`}>
          <RatingRow label="Skills practiced" value={card.skills_practiced} max={7} />
        </Section>
      )}

      {hasMed && (
        <Section emoji="💊" title="Medication & Safety" summary="Logged">
          <div className="space-y-2 text-sm">
            {med.rx_meds_taken !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">💊 Rx meds taken</span>
                <span className={med.rx_meds_taken ? "text-green-500 font-medium" : "text-muted-foreground"}>
                  {med.rx_meds_taken ? "Yes" : "No"}
                </span>
              </div>
            )}
            {med.self_harm_occurred !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">✏️ Self-harm occurred</span>
                <span className={med.self_harm_occurred ? "text-destructive font-medium" : "text-muted-foreground"}>
                  {med.self_harm_occurred ? "Yes" : "No"}
                </span>
              </div>
            )}
            {med.substances_count !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">🍺 Substances</span>
                <span className="text-foreground">{med.substances_count}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {hasNotes && (
        <Section emoji="📝" title="Notes" summary="Written">
          <div className="space-y-3 text-sm">
            {notes.what && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">What happened?</p>
                <p className="text-foreground">{notes.what}</p>
              </div>
            )}
            {notes.judgments && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Judgments</p>
                <p className="text-foreground">{notes.judgments}</p>
              </div>
            )}
            {notes.optional && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Optional context</p>
                <p className="text-foreground">{notes.optional}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {hasSymptoms && (
        <Section emoji="🩺" title="Symptoms & Habits" summary={`${Object.keys(symptoms).length + Object.keys(habits).length} logged`}>
          <div className="space-y-3">
            {Object.keys(symptoms).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Symptoms</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(symptoms).map(([key, val]) => (
                    <span key={key} className="px-2.5 py-1 rounded-full text-xs bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                      {key.replace(/_/g, " ")}{val !== true && val !== undefined ? ` · ${val}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(habits).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Habits</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(habits).map(([key, val]) => (
                    <span key={key} className="px-2.5 py-1 rounded-full text-xs bg-green-500/10 text-green-600 border border-green-500/20 font-medium">
                      {key.replace(/_/g, " ")}{val !== true && val !== undefined ? ` · ${val}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}