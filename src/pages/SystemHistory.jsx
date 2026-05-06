import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { format, differenceInYears, differenceInMonths, differenceInDays } from "date-fns";
import { GitMerge, Split, MoonStar, Sunrise, Sparkles, Plus, ArrowRight, Trash2, CalendarDays, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import RecordSystemChangeModal from "@/components/alters/RecordSystemChangeModal";

const TYPE_META = {
  fusion:    { label: "Fusion",     icon: GitMerge,  color: "text-violet-500",  bg: "bg-violet-500/10 border-violet-500/20",  dot: "bg-violet-500" },
  split:     { label: "Split",      icon: Split,     color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20",      dot: "bg-blue-500" },
  dormancy:  { label: "Dormancy",   icon: MoonStar,  color: "text-indigo-500",  bg: "bg-indigo-500/10 border-indigo-500/20",  dot: "bg-indigo-500" },
  return:    { label: "Return",     icon: Sunrise,   color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20",    dot: "bg-amber-500" },
  emergence: { label: "Emergence",  icon: Sparkles,  color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
};

function AlterPill({ alter }) {
  if (!alter) return null;
  return (
    <Link
      to={`/alter/${alter.id}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-80 transition-opacity"
      style={{ borderColor: alter.color || "#9333ea", color: alter.color || "#9333ea", backgroundColor: `${alter.color || "#9333ea"}15` }}
    >
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: alter.color || "#9333ea" }} />
      {alter.name}
    </Link>
  );
}

function TimelineEvent({ event, altersById, onDelete, isLast }) {
  const meta = TYPE_META[event.type] || TYPE_META.fusion;
  const Icon = meta.icon;

  const sourceAlters = (event.source_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const resultAlters = (event.result_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const showResult = event.type !== "dormancy" && event.type !== "return" && event.type !== "emergence";

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
              onClick={() => onDelete(event.id)}
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

        {event.cause && (
          <p className="text-xs text-muted-foreground"><span className="font-medium">Cause:</span> {event.cause}</p>
        )}
        {event.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{event.notes}</p>
        )}
      </div>
    </div>
  );
}

function SystemBirthMarker({ date, onEdit }) {
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
          <span className="text-sm font-semibold text-primary">System birth</span>
          <button type="button" onClick={onEdit} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{format(date, "MMMM d, yyyy")} · {ageStr}</p>
      </div>
    </div>
  );
}

function NoBirthMarker({ onEdit }) {
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
          <span>Set system birth date</span>
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function BirthDateEditor({ currentDate, settings, queryClient, onClose }) {
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
          <span className="text-sm font-semibold text-primary">System birth</span>
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

export default function SystemHistory() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingBirth, setEditingBirth] = useState(false);

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

  // Determine system birth date from settings or oldest alter
  const systemBirthDate = useMemo(() => {
    const settings = settingsArr[0];
    if (settings?.system_birth_date) return new Date(settings.system_birth_date);
    if (alters.length === 0) return null;
    const oldest = alters.reduce((a, b) => new Date(a.created_date) < new Date(b.created_date) ? a : b);
    return oldest?.created_date ? new Date(oldest.created_date) : null;
  }, [settingsArr, alters]);

  const filteredEvents = useMemo(() => {
    const base = typeFilter === "all" ? events : events.filter(e => e.type === typeFilter);
    return [...base].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [events, typeFilter]);

  async function handleDelete(eventId) {
    await localEntities.SystemChangeEvent.delete(eventId);
    queryClient.invalidateQueries({ queryKey: ["systemChangeEvents"] });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">System History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Fusions, splits, emergences, dormancy, and returns</p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
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
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 && (
        <div className="text-center py-16">
          <GitMerge className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-base font-medium text-muted-foreground">No events yet</p>
          <p className="text-sm text-muted-foreground mt-1">Record a fusion, split, emergence, dormancy, or return to build your system's history.</p>
          <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add first event
          </Button>
        </div>
      )}

      {filteredEvents.length > 0 && (
        <div>
          {filteredEvents.map((event, i) => (
            <TimelineEvent
              key={event.id}
              event={event}
              altersById={altersById}
              onDelete={handleDelete}
              isLast={i === filteredEvents.length - 1 && !systemBirthDate && !editingBirth}
            />
          ))}

          {/* System birth at the bottom */}
          {typeFilter === "all" && (
            editingBirth
              ? <BirthDateEditor currentDate={systemBirthDate} settings={settingsArr[0]} queryClient={queryClient} onClose={() => setEditingBirth(false)} />
              : systemBirthDate
                ? <SystemBirthMarker date={systemBirthDate} onEdit={() => setEditingBirth(true)} />
                : <NoBirthMarker onEdit={() => setEditingBirth(true)} />
          )}
        </div>
      )}

      {/* Show birth even if no events */}
      {filteredEvents.length === 0 && typeFilter === "all" && (
        <div className="mt-4">
          {editingBirth
            ? <BirthDateEditor currentDate={systemBirthDate} settings={settingsArr[0]} queryClient={queryClient} onClose={() => setEditingBirth(false)} />
            : systemBirthDate
              ? <SystemBirthMarker date={systemBirthDate} onEdit={() => setEditingBirth(true)} />
              : <NoBirthMarker onEdit={() => setEditingBirth(true)} />
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
