import React, { useMemo, useState } from "react";
import { UserPlus, User, Smile, Activity, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { AlterPanel } from "@/components/dashboard/CurrentFronters";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// ── "Notice who's near" — the single participants section ─────────────────────
//
// This is the system-meeting equivalent of the dashboard's "Currently fronting"
// widget, and the ONLY "notice who's near" surface in the meeting form.
//
// REUSE, not rebuild — it replicates the Currently-Fronting widget faithfully:
//   • Picking who's near opens the real Set Fronters modal (SetFrontModal) in
//     its `selectionMode` — instead of starting a front it hands back the
//     chosen alter ids, which we add as participants. (Mirrors how the dash's
//     "Switch" button opens the same modal.)
//   • The present members render as a 2-column grid of compact chips — the
//     same avatar + name card shape as the dashboard's FronterChip — and
//     TAPPING a chip expands the per-alter panel below the grid, exactly like
//     the currently-fronting widget. The expanded editor is CurrentFronters'
//     exported <AlterPanel> in its controlled mode (note + EmotionWheelPicker +
//     1–5 / boolean symptom rows). No bespoke participant editor.
//
// Data shape (stored on the SystemCheckIn record under `participants`):
//   [{ alter_id, emotions: string[], symptoms: [{id,label,value,type}],
//      note: "" }]
// `normalizeParticipants` defends old/short records gracefully.

export function normalizeParticipants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && p.alter_id)
    .map((p) => ({
      alter_id: p.alter_id,
      emotions: Array.isArray(p.emotions) ? p.emotions : [],
      symptoms: Array.isArray(p.symptoms) ? p.symptoms : [],
      note: typeof p.note === "string" ? p.note : "",
    }));
}

// Tiny text-on-fill contrast pick — mirrors CurrentFronters' getContrastColor
// so the placeholder glyph stays legible on a coloured avatar square.
function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

// ParticipantChip — the compact avatar + name card. Same shape/classes as the
// dashboard's FronterChip (which isn't reusable directly: it's session-coupled,
// wired to swipe-to-front mutations, and not exported). Tapping it expands the
// AlterPanel below — replicating the currently-fronting tap-to-expand UX.
function ParticipantChip({ alter, participant, isExpanded, onToggle, onRemove }) {
  const resolvedAvatar = useResolvedAvatarUrl(alter?.avatar_url);
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const hasNote = !!participant?.note?.trim();
  const emoCount = (participant?.emotions || []).length;
  const symCount = (participant?.symptoms || []).length;
  const empty = !hasNote && emoCount === 0 && symCount === 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${alter.name} — tap to ${isExpanded ? "collapse" : "expand"} their notes, emotions and symptoms`}
      onClick={() => onToggle(alter.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle(alter.id))}
      className={`flex items-center gap-2.5 bg-card border rounded-2xl px-1.5 py-2 cursor-pointer select-none transition-all hover:bg-muted/20 relative ${
        isExpanded ? "border-primary" : "border-border/50 hover:border-border"
      }`}
    >
      {/* Avatar with note badge */}
      <div className="relative flex-shrink-0">
        <div
          className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border border-border/30"
          style={{ backgroundColor: bg || "hsl(var(--muted))" }}
        >
          {resolvedAvatar ? (
            <img src={resolvedAvatar} alt={alter.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5" style={{ color: text || "hsl(var(--muted-foreground))" }} />
          )}
        </div>
        {hasNote && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background border border-border/60 flex items-center justify-center text-[0.5625rem] leading-none">
            💬
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{alter.name}</p>
        <p className="text-[0.6875rem] text-muted-foreground truncate flex items-center gap-2">
          {empty ? (
            <span className="italic">tap to add notes</span>
          ) : (
            <>
              {emoCount > 0 && (
                <span className="inline-flex items-center gap-0.5"><Smile className="w-3 h-3" />{emoCount}</span>
              )}
              {symCount > 0 && (
                <span className="inline-flex items-center gap-0.5"><Activity className="w-3 h-3" />{symCount}</span>
              )}
              {hasNote && (
                <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />note</span>
              )}
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(alter.id); }}
        aria-label={`Remove ${alter.name}`}
        className="p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function MeetingParticipantsSection({ participants = [], onChange, alters = [] }) {
  const terms = useTerms();
  const list = useMemo(() => normalizeParticipants(participants), [participants]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Single expanded participant at a time — mirrors the currently-fronting
  // widget, which only ever opens one AlterPanel at once.
  const [expandedId, setExpandedId] = useState(null);

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const selectedIds = useMemo(() => list.map((p) => p.alter_id), [list]);

  // Merge the modal's chosen ids into the participants list: add new ones with
  // empty per-alter data, drop any de-selected ones, keep the data of the ones
  // that stay. (Removing here mirrors un-checking them in the modal.)
  const applySelection = (ids) => {
    const idSet = new Set(ids);
    const kept = list.filter((p) => idSet.has(p.alter_id));
    const keptIds = new Set(kept.map((p) => p.alter_id));
    const added = ids
      .filter((id) => !keptIds.has(id))
      .map((id) => ({ alter_id: id, emotions: [], symptoms: [], note: "" }));
    onChange([...kept, ...added]);
  };

  const updateParticipant = (alterId, next) => {
    onChange(list.map((p) => (p.alter_id === alterId ? { ...next, alter_id: alterId } : p)));
  };
  const removeParticipant = (alterId) => {
    if (expandedId === alterId) setExpandedId(null);
    onChange(list.filter((p) => p.alter_id !== alterId));
  };

  const expandedParticipant = expandedId ? list.find((p) => p.alter_id === expandedId) : null;
  const expandedAlter = expandedId ? altersById[expandedId] : null;

  // No heading and no boxed container here — this renders directly under Step
  // 2's single "Notice Who's Near" header (CheckInStep2 passes it as children),
  // so it's just the "Choose who's near…" button + the chip grid + the one
  // expanded per-participant panel.
  return (
    <div data-tour="meetings-participants" className="space-y-3">
      {/* Open the real Set Fronters modal to choose who's near — sits directly
          under Step 2's header. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setPickerOpen(true)}
        className="w-full gap-2"
      >
        <UserPlus className="w-4 h-4" />
        {list.length > 0 ? `Add or remove ${terms.alters}` : `Choose who's near…`}
      </Button>

      {list.length > 0 && (
        <>
          {/* Chip grid — same 2-column avatar+name layout as the dashboard's
              "Currently fronting" widget. */}
          <div className="grid grid-cols-2 gap-2">
            {list.map((p) => {
              const alter = altersById[p.alter_id];
              if (!alter) return null;
              return (
                <ParticipantChip
                  key={p.alter_id}
                  alter={alter}
                  participant={p}
                  isExpanded={expandedId === p.alter_id}
                  onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                  onRemove={removeParticipant}
                />
              );
            })}
          </div>

          {/* Expanded per-participant panel — opens under the chip grid when a
              chip is tapped, exactly like the currently-fronting widget. The
              chip already shows the avatar + name + remove, so hideHeader. */}
          {expandedAlter && expandedParticipant && (
            <AlterPanel
              key={expandedAlter.id}
              alter={expandedAlter}
              participant={expandedParticipant}
              onChange={(next) => updateParticipant(expandedAlter.id, next)}
              onClose={() => setExpandedId(null)}
              hideHeader
            />
          )}
        </>
      )}

      <SetFrontModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        alters={alters}
        selectionMode
        allowPresenceTab
        preselectedIds={selectedIds}
        onConfirm={applySelection}
        confirmLabel="Add to meeting"
      />
    </div>
  );
}
