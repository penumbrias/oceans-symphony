import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { format, differenceInYears, differenceInMonths, differenceInDays } from "date-fns";
import { GitMerge, Split, MoonStar, Sunrise, Sparkles, RefreshCw, Plus, ArrowRight, Trash2, CalendarDays, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import RecordSystemChangeModal from "@/components/alters/RecordSystemChangeModal";
import { isLogCommandError } from "@/lib/authoredText";
import { editLineageEvent, deleteLineageEvent, LINEAGE_KEY } from "@/lib/lineageEvents";
import LineageEventEditForm from "@/components/alters/LineageEventEditForm";
import { confirm } from "@/components/shared/ConfirmDialog";
import { TRASH_HINT } from "@/lib/trashSettings";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import RichText from "@/components/shared/RichText";
import RowMenu from "@/components/shared/RowMenu";
import { useUiLook, usePixelDesk } from "@/lib/uiLook";
import { useAlterLabel } from "@/lib/useAlterLabel";
import "@/styles/pixel/meeting.css";

const TYPE_META = {
  fusion:    { label: "Fusion",     icon: GitMerge,  color: "text-violet-500",  bg: "bg-violet-500/10 border-violet-500/20",  dot: "bg-violet-500" },
  split:     { label: "Split",      icon: Split,     color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20",      dot: "bg-blue-500" },
  dormancy:  { label: "Dormancy",   icon: MoonStar,  color: "text-indigo-500",  bg: "bg-indigo-500/10 border-indigo-500/20",  dot: "bg-indigo-500" },
  return:    { label: "Return",     icon: Sunrise,   color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20",    dot: "bg-amber-500" },
  emergence: { label: "Emergence",  icon: Sparkles,  color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
  reformation: { label: "Reformation", icon: RefreshCw, color: "text-teal-500",   bg: "bg-teal-500/10 border-teal-500/20",      dot: "bg-teal-500" },
};

function AlterPill({ alter }) {
  if (!alter) return null;
  const color = alter.color || "#9333ea";
  return (
    <Link
      to={`/alter/${alter.id}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-80 transition-opacity text-foreground"
      style={{ borderColor: color, backgroundColor: `${color}22` }}
    >
      <div className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-background" style={{ backgroundColor: color }} />
      {alter.name}
    </Link>
  );
}

const TimelineEvent = React.memo(function TimelineEvent({ event, altersById, alters = [], onDelete, onEdit, onToggleHidden, isLast }) {
  const meta = TYPE_META[event.type] || TYPE_META.fusion;
  const Icon = meta.icon;

  // Edit covers the SAFE metadata only (LineageEventEditForm).
  const [editing, setEditing] = useState(false);

  const sourceAlters = (event.source_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const resultAlters = (event.result_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const showResult = event.type !== "dormancy" && event.type !== "return" && event.type !== "emergence" && event.type !== "reformation";

  const fusionLabel = event.fusion_type === "absorption" ? "Absorption"
    : event.fusion_type === "new_formation" ? "New Formation"
    : null;

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={cn("w-3 h-3 rounded-full mt-1 ring-2 ring-background", meta.dot)} />
        {!isLast && <div className="w-px flex-1 mt-1 bg-border/60 min-h-[2rem]" />}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <Icon className={cn("w-3.5 h-3.5", meta.color)} />
            <span className={cn("text-sm font-semibold", meta.color)}>{meta.label}</span>
            {fusionLabel && <span className="text-xs text-muted-foreground">· {fusionLabel}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              {event.year_only ? format(new Date(event.date), "yyyy") : format(new Date(event.date), "MMM d, yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              title="Edit date / notes"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onToggleHidden?.(event)}
              title={event.hidden ? "Unhide event" : "Hide from history"}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {event.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => onDelete(event.id)}
              title="Delete event"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <div className="flex flex-wrap gap-1">
            {sourceAlters.map(a => <AlterPill key={a.id} alter={a} />)}
          </div>
          {showResult && resultAlters.length > 0 && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex flex-wrap gap-1">
                {resultAlters.map(a => <AlterPill key={a.id} alter={a} />)}
              </div>
            </>
          )}
        </div>

        {editing ? (
          <LineageEventEditForm event={event} alters={alters} onSave={(patch) => onEdit(event.id, patch)} onCancel={() => setEditing(false)} />
        ) : (
          <>
            {event.what_changed && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap"><span className="font-medium">What changed:</span> <RichText content={event.what_changed} /></p>
            )}
            {event.new_name && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">New name:</span> {event.previous_name ? `${event.previous_name} → ` : ""}{event.new_name}</p>
            )}
            {event.cause && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">{event.type === "reformation" ? "Trigger:" : "Cause:"}</span> <RichText content={event.cause} /></p>
            )}
            {event.notes && (
              <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap"><RichText content={event.notes} /></p>
            )}
          </>
        )}
      </div>
    </div>
  );
});

function SystemBirthMarker({ date, onEdit, t }) {
  const age = differenceInYears(new Date(), date);
  const months = differenceInMonths(new Date(), date) % 12;
  const days = differenceInDays(new Date(), date);

  const ageStr = age > 0
    ? `${age} year${age > 1 ? "s" : ""}${months > 0 ? `, ${months} month${months > 1 ? "s" : ""}` : ""} ago`
    : days > 0 ? `${days} day${days > 1 ? "s" : ""} ago`
    : "today";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-3 h-3 rounded-full mt-1 ring-2 ring-background bg-primary" />
      </div>
      <div className="pb-4 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold text-primary">{t.System} birth</span>
          <button type="button" onClick={onEdit} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{format(date, "MMMM d, yyyy")} · {ageStr}</p>
      </div>
    </div>
  );
}

function NoBirthMarker({ onEdit, t }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-3 h-3 rounded-full mt-1 ring-2 ring-background bg-muted-foreground/40" />
      </div>
      <div className="pb-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>Set {t.system} birth date</span>
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function BirthDateEditor({ currentDate, settings, queryClient, onClose, t }) {
  const [value, setValue] = useState(currentDate ? format(currentDate, "yyyy-MM-dd") : "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const iso = value ? new Date(value + "T00:00:00").toISOString() : null;
      if (settings?.id) {
        await localEntities.SystemSettings.update(settings.id, { system_birth_date: iso });
      } else {
        await localEntities.SystemSettings.create({ system_birth_date: iso });
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-3 h-3 rounded-full mt-1 ring-2 ring-background bg-primary" />
      </div>
      <div className="pb-4 flex-1">
        <div className="flex items-center gap-1.5 mb-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold text-primary">{t.System} birth</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          />
          <button type="button" disabled={saving} onClick={handleSave}
            className="text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pixel look (SystemHistoryPhone board) ─────────────────────────────
// A "Lineage" panel with a rail of square marks: year · kind · the alters
// it touched · its note. Every action of the classic card (edit date /
// notes, hide, delete) is in the row's ⋯ menu; the edit form opens in
// place, as before. Kind colours are the board's.
const PX_KIND_COLOR = {
  return: "#86b88f", dormancy: "#9aa0b4", split: "#d98f5b",
  fusion: "#c98bb9", emergence: "#e3c16f", reformation: "#8fb8e0",
};

function PxAlterChip({ alter }) {
  const formatAlter = useAlterLabel();
  if (!alter) return null;
  return (
    <Link to={`/alter/${alter.id}`} className="pxm-chip">
      <span className="pxm-sq" style={{ background: alter.color || undefined }} />{formatAlter(alter)}
    </Link>
  );
}

function PxLineageEvent({ event, altersById, alters, onDelete, onEdit, onToggleHidden }) {
  const meta = TYPE_META[event.type] || TYPE_META.fusion;
  const color = PX_KIND_COLOR[event.type] || PX_KIND_COLOR.fusion;
  const [editing, setEditing] = useState(false);
  const d = new Date(event.date);
  const valid = !Number.isNaN(d.getTime());
  const sourceAlters = (event.source_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const resultAlters = (event.result_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const showResult = !["dormancy", "return", "emergence", "reformation"].includes(event.type) && resultAlters.length > 0;
  const fusionLabel = event.fusion_type === "absorption" ? "Absorption" : event.fusion_type === "new_formation" ? "New formation" : null;
  return (
    <div className={`pxm-ev${event.hidden ? " hid" : ""}`}>
      <span className="pxm-ev-mark" style={{ background: color }} aria-hidden="true" />
      <div className="pxm-row" style={{ gap: 8 }}>
        <span className="pxm-ev-year">{valid ? format(d, "yyyy") : "—"}</span>
        <span className="pxm-pf" style={{ color }}>{meta.label}</span>
        {fusionLabel && <span className="pxm-mut" style={{ fontSize: 12 }}>{fusionLabel}</span>}
        <span className="pxm-grow" />
        <span className="pxm-mut" style={{ fontSize: 12 }}>{event.year_only ? "year only" : (valid ? format(d, "MMM d") : "")}</span>
        <RowMenu label="Event actions" items={[
          { label: editing ? "Close editing" : "Edit date / notes", icon: Pencil, onSelect: () => setEditing(v => !v) },
          { label: event.hidden ? "Unhide" : "Hide from history", icon: event.hidden ? Eye : EyeOff, onSelect: () => onToggleHidden(event) },
          { label: "Delete", icon: Trash2, onSelect: () => onDelete(event.id), destructive: true },
        ]} />
      </div>
      {(sourceAlters.length > 0 || showResult) && (
        <div className="pxm-row pxm-wrap" style={{ marginTop: 4 }}>
          {sourceAlters.map(a => <PxAlterChip key={a.id} alter={a} />)}
          {showResult && <span className="pxm-mut" aria-label="became">-&gt;</span>}
          {showResult && resultAlters.map(a => <PxAlterChip key={a.id} alter={a} />)}
        </div>
      )}
      {editing ? (
        <div style={{ marginTop: 6 }}>
          <LineageEventEditForm event={event} alters={alters} onSave={(patch) => onEdit(event.id, patch)} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <>
          {event.what_changed && <div className="pxm-ev-note whitespace-pre-wrap"><b>What changed:</b> <RichText content={event.what_changed} /></div>}
          {event.new_name && <div className="pxm-ev-note"><b>New name:</b> {event.previous_name ? `${event.previous_name} → ` : ""}{event.new_name}</div>}
          {event.cause && <div className="pxm-ev-note"><b>{event.type === "reformation" ? "Trigger:" : "Cause:"}</b> <RichText content={event.cause} /></div>}
          {event.notes && <div className="pxm-ev-note whitespace-pre-wrap"><RichText content={event.notes} /></div>}
        </>
      )}
    </div>
  );
}

function PxBirth({ date, editing, onEdit, onClose, settings, queryClient, t }) {
  if (editing) {
    return (
      <div className="pxm-ev">
        <span className="pxm-ev-mark" style={{ background: "var(--color-primary)" }} aria-hidden="true" />
        <BirthDateEditor currentDate={date} settings={settings} queryClient={queryClient} onClose={onClose} t={t} />
      </div>
    );
  }
  return (
    <div className="pxm-ev">
      <span className="pxm-ev-mark" style={{ background: date ? "var(--color-primary)" : "var(--px-tab)" }} aria-hidden="true" />
      <div className="pxm-row" style={{ gap: 8 }}>
        <span className="pxm-ev-year">{date ? format(date, "yyyy") : "—"}</span>
        <span className="pxm-pf" style={{ color: "var(--color-primary)" }}>{t.System} birth</span>
        <span className="pxm-grow" />
        <button type="button" className="pxm-btn xs" onClick={onEdit}>{date ? "Edit" : `Set date`}</button>
      </div>
      {date && <div className="pxm-ev-note">{format(date, "MMMM d, yyyy")}</div>}
    </div>
  );
}

function PixelSystemHistory({
  t, events, filteredEvents, typeFilter, setTypeFilter, hiddenCount, showHidden, setShowHidden,
  altersById, alters, onDelete, onEdit, onToggleHidden, onRecord,
  systemBirthDate, editingBirth, setEditingBirth, settings, queryClient,
}) {
  const desk = usePixelDesk();
  const kinds = [{ id: "all", label: "All" }, ...["fusion", "split", "emergence", "reformation", "dormancy", "return"]
    .filter((id) => TYPE_META[id]).map((id) => ({ id, label: TYPE_META[id].label }))];
  const countOf = (id) => events.filter(e => (showHidden || !e.hidden) && (id === "all" || e.type === id)).length;
  const hiddenToggle = hiddenCount > 0 && (
    <button type="button" className={`pxm-chip${showHidden ? " sel" : ""}`} onClick={() => setShowHidden(s => !s)}
      title={showHidden ? "Hide hidden events again" : "Show events you've hidden"}>
      {showHidden ? `Hide ${hiddenCount} hidden` : `Show ${hiddenCount} hidden`}
    </button>
  );
  const lineage = (
    <div className="pxm-pn pxm-hist-panel">
      <div className="pxm-ttl">
        <span>Lineage</span>
        <button type="button" className="pxm-btn xs" onClick={onRecord} data-tour="system-history-add-btn">+ record a change</button>
      </div>
      {filteredEvents.length === 0 && (
        <div className="pxm-empty">
          No events yet. Record a fusion, split, emergence, reformation, dormancy or return to build your {t.system}'s history.
        </div>
      )}
      <div className="pxm-lin">
        <span className="pxm-lin-rail" aria-hidden="true" />
        {filteredEvents.map((event) => (
          <PxLineageEvent key={event.id} event={event} altersById={altersById} alters={alters}
            onDelete={onDelete} onEdit={onEdit} onToggleHidden={onToggleHidden} />
        ))}
        {typeFilter === "all" && (
          <PxBirth date={systemBirthDate} editing={editingBirth} onEdit={() => setEditingBirth(true)}
            onClose={() => setEditingBirth(false)} settings={settings} queryClient={queryClient} t={t} />
        )}
      </div>
    </div>
  );
  if (desk) {
    return (
      <div className="pxm pxm-desk" data-tour="system-history-page">
        <h1 className="sr-only">{t.System} history</h1>
        <div className="pxm-pn pxm-side">
          <div className="pxm-ttl"><span>Kinds of change</span></div>
          <div className="pxm-side-scroll">
            {kinds.map(k => (
              <button key={k.id} type="button" className={`pxm-side-row${typeFilter === k.id ? " sel" : ""}`}
                aria-pressed={typeFilter === k.id} onClick={() => setTypeFilter(k.id)}>
                <span className="pxm-sq" style={{ background: k.id === "all" ? "var(--color-primary)" : PX_KIND_COLOR[k.id] }} />
                <span className="pxm-side-name">{k.label}</span>
                <span className="pxm-side-count">{countOf(k.id)}</span>
              </button>
            ))}
            {hiddenToggle && <div style={{ padding: "8px 4px" }}>{hiddenToggle}</div>}
          </div>
          <div className="pxm-side-foot">Fusions, splits, emergences, reformations, dormancy and returns.</div>
        </div>
        <div className="pxm" style={{ minWidth: 0 }}>{lineage}</div>
      </div>
    );
  }
  return (
    <div className="pxm" data-tour="system-history-page">
      <h1 className="sr-only">{t.System} history</h1>
      <div className="pxm-intro">Fusions, splits, emergences, reformations, dormancy and returns.</div>
      <div className="pxm-row pxm-wrap" style={{ gap: 4 }}>
        {kinds.map(k => (
          <button key={k.id} type="button" className={`pxm-chip${typeFilter === k.id ? " sel" : ""}`}
            aria-pressed={typeFilter === k.id} onClick={() => setTypeFilter(k.id)}>{k.label}</button>
        ))}
        {hiddenToggle}
      </div>
      {lineage}
    </div>
  );
}

export default function SystemHistory() {
  const queryClient = useQueryClient();
  const t = useTerms();
  const [modalOpen, setModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingBirth, setEditingBirth] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const pixel = useUiLook() === "pixel";

  const { data: events = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => localEntities.Alter.list(),
  });

  const { data: settingsArr = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => localEntities.SystemSettings.list(),
  });

  const altersById = useMemo(() => Object.fromEntries(alters.map(a => [a.id, a])), [alters]);

  // Determine system birth date from settings or oldest alter.
  // Use Date.parse (numeric, no Date allocation per compare) and a
  // single linear pass instead of `reduce` with two `new Date()`
  // allocations per comparison — the old code thrashed GC on systems
  // with many alters and re-ran every render that touched alters.
  const systemBirthDate = useMemo(() => {
    const settings = settingsArr[0];
    if (settings?.system_birth_date) return new Date(settings.system_birth_date);
    if (alters.length === 0) return null;
    let oldest = alters[0];
    let oldestTs = Date.parse(oldest?.created_date) || Infinity;
    for (let i = 1; i < alters.length; i++) {
      const ts = Date.parse(alters[i]?.created_date);
      if (Number.isFinite(ts) && ts < oldestTs) {
        oldest = alters[i];
        oldestTs = ts;
      }
    }
    return oldest?.created_date ? new Date(oldest.created_date) : null;
  }, [settingsArr, alters]);

  const hiddenCount = useMemo(() => events.filter(e => e.hidden).length, [events]);

  const filteredEvents = useMemo(() => {
    let base = events;
    if (!showHidden) base = base.filter(e => !e.hidden);
    if (typeFilter !== "all") base = base.filter(e => e.type === typeFilter);
    // Date.parse returns a number directly; avoids allocating two
    // Date objects per compare during sort. With many events the old
    // `new Date(b.date) - new Date(a.date)` form caused noticeable
    // jank when opening this page.
    return [...base].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  }, [events, typeFilter, showHidden]);

  const handleDelete = useCallback(async (eventId) => {
    if (!(await confirm(`Delete this event? ${TRASH_HINT}`))) return;
    await deleteLineageEvent(eventId);
    queryClient.invalidateQueries({ queryKey: LINEAGE_KEY });
  }, [queryClient]);

  const handleToggleHidden = useCallback(async (event) => {
    await localEntities.SystemChangeEvent.update(event.id, { hidden: !event.hidden });
    queryClient.invalidateQueries({ queryKey: ["systemChangeEvents"] });
  }, [queryClient]);

  // Event notes render as plain text, so ~commands become "icon label" tokens.
  // Returns false when the save was blocked (broken command / whisper cancelled)
  // so the card stays in edit mode.
  const handleEditEvent = useCallback(async (eventId, patch) => {
    try {
      const ok = await editLineageEvent(eventId, patch, { alters, terms: t });
      if (!ok) return false;
    } catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return false; } throw e; }
    queryClient.invalidateQueries({ queryKey: LINEAGE_KEY });
    return true;
  }, [queryClient, alters, t]);

  if (pixel) {
    return (
      <div className="max-w-5xl mx-auto px-3 py-3 pb-24">
        <PixelSystemHistory
          t={t} events={events} filteredEvents={filteredEvents} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          hiddenCount={hiddenCount} showHidden={showHidden} setShowHidden={setShowHidden}
          altersById={altersById} alters={alters} onDelete={handleDelete} onEdit={handleEditEvent}
          onToggleHidden={handleToggleHidden} onRecord={() => setModalOpen(true)}
          systemBirthDate={systemBirthDate} editingBirth={editingBirth} setEditingBirth={setEditingBirth}
          settings={settingsArr[0]} queryClient={queryClient}
        />
        {modalOpen && <RecordSystemChangeModal open={modalOpen} onClose={() => setModalOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24" data-tour="system-history-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">{t.System} History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Fusions, splits, emergences, reformations, dormancy, and returns</p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)} data-tour="system-history-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Add Event
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap mb-4">
        {[{ id: "all", label: "All" }, ...Object.entries(TYPE_META).map(([id, m]) => ({ id, label: m.label }))].map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTypeFilter(f.id)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-all",
              typeFilter === f.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            )}
          >
            {f.label}
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowHidden(s => !s)}
            className={cn(
              "ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all",
              showHidden
                ? "bg-muted text-foreground border-border"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            )}
            title={showHidden ? "Hide hidden events again" : "Show events you've hidden"}
          >
            {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showHidden ? `Hide ${hiddenCount} hidden` : `Show ${hiddenCount} hidden`}
          </button>
        )}
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 && (
        <div className="text-center py-16">
          <GitMerge className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-base font-medium text-muted-foreground">No events yet</p>
          <p className="text-sm text-muted-foreground mt-1">Record a fusion, split, emergence, reformation, dormancy, or return to build your {t.system}'s history.</p>
          <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add first event
          </Button>
        </div>
      )}

      {filteredEvents.length > 0 && (
        <div>
          {filteredEvents.map((event, i) => (
            <div key={event.id} className={event.hidden ? "opacity-50" : ""}>
              <TimelineEvent
                event={event}
                altersById={altersById}
                alters={alters}
                onDelete={handleDelete}
                onEdit={handleEditEvent}
                onToggleHidden={handleToggleHidden}
                isLast={i === filteredEvents.length - 1 && !systemBirthDate && !editingBirth}
              />
            </div>
          ))}

          {/* System birth at the bottom */}
          {typeFilter === "all" && (
            editingBirth
              ? <BirthDateEditor currentDate={systemBirthDate} settings={settingsArr[0]} queryClient={queryClient} onClose={() => setEditingBirth(false)} t={t} />
              : systemBirthDate
                ? <SystemBirthMarker date={systemBirthDate} onEdit={() => setEditingBirth(true)} t={t} />
                : <NoBirthMarker onEdit={() => setEditingBirth(true)} t={t} />
          )}
        </div>
      )}

      {/* Show birth even if no events */}
      {filteredEvents.length === 0 && typeFilter === "all" && (
        <div className="mt-4">
          {editingBirth
            ? <BirthDateEditor currentDate={systemBirthDate} settings={settingsArr[0]} queryClient={queryClient} onClose={() => setEditingBirth(false)} t={t} />
            : systemBirthDate
              ? <SystemBirthMarker date={systemBirthDate} onEdit={() => setEditingBirth(true)} t={t} />
              : <NoBirthMarker onEdit={() => setEditingBirth(true)} t={t} />
          }
        </div>
      )}

      {modalOpen && (
        <RecordSystemChangeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
