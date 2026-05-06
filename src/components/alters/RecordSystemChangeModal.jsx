import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities, base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, GitMerge, Split, MoonStar, Sunrise, ChevronRight, ChevronLeft, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// ─── AlterChip ────────────────────────────────────────────────────────────────

function AlterAvatar({ alter, size = 7 }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  const [err, setErr] = useState(false);
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0`;
  if (resolved && !err) {
    return <img src={resolved} alt={alter?.name} className={`${cls} object-cover`} onError={() => setErr(true)} />;
  }
  return (
    <div className={`${cls} flex items-center justify-center text-xs font-bold text-white`}
      style={{ backgroundColor: alter?.color || "#9333ea" }}>
      {alter?.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

function AlterChip({ alter, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <AlterAvatar alter={alter} size={6} />
      <span className="font-medium truncate max-w-[110px]">{alter.name}</span>
      {selected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
    </button>
  );
}

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPES = [
  {
    id: "fusion",
    label: "Fusion",
    icon: GitMerge,
    color: "text-violet-500",
    bg: "bg-violet-500/10 border-violet-500/30",
    description: "Two or more alters merge into one or form a new alter.",
  },
  {
    id: "split",
    label: "Split",
    icon: Split,
    color: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/30",
    description: "One alter splits into two or more distinct alters.",
  },
  {
    id: "dormancy",
    label: "Dormancy",
    icon: MoonStar,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10 border-indigo-500/30",
    description: "One or more alters go dormant / become less active.",
  },
  {
    id: "return",
    label: "Return",
    icon: Sunrise,
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/30",
    description: "One or more alters return from dormancy.",
  },
];

// ─── Step components ──────────────────────────────────────────────────────────

function StepType({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TYPES.map((t) => {
        const Icon = t.icon;
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex flex-col items-start gap-2 p-3 rounded-xl border-2 text-left transition-all",
              selected ? t.bg + " border-current" : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
            )}
          >
            <Icon className={cn("w-5 h-5", selected ? t.color : "text-muted-foreground")} />
            <div>
              <p className={cn("text-sm font-semibold", selected ? t.color : "text-foreground")}>{t.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{t.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StepSourceAlters({ type, alters, selected, onToggle, fusionType, onFusionTypeChange }) {
  const isSingle = type === "split";
  const label = type === "fusion" ? "Alters involved in the fusion (select 2+)"
    : type === "split" ? "Which alter is splitting?"
    : type === "dormancy" ? "Which alters are going dormant?"
    : "Which alters are returning?";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        <div className="flex flex-wrap gap-2">
          {alters.map((a) => (
            <AlterChip
              key={a.id}
              alter={a}
              selected={selected.includes(a.id)}
              onClick={() => onToggle(a.id, isSingle)}
              disabled={isSingle && selected.length > 0 && !selected.includes(a.id)}
            />
          ))}
        </div>
        {selected.length === 0 && (
          <p className="text-xs text-destructive mt-2">Select at least {isSingle ? "one" : "two"} alter{isSingle ? "" : "s"}.</p>
        )}
        {type === "fusion" && selected.length === 1 && (
          <p className="text-xs text-destructive mt-2">Select at least two alters for a fusion.</p>
        )}
      </div>

      {type === "fusion" && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Type of fusion</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onFusionTypeChange("absorption")}
              className={cn(
                "p-3 rounded-xl border-2 text-left transition-all",
                fusionType === "absorption"
                  ? "border-violet-500/60 bg-violet-500/10"
                  : "border-border bg-card hover:border-border/80"
              )}
            >
              <p className="text-sm font-semibold text-foreground">Absorption</p>
              <p className="text-xs text-muted-foreground mt-0.5">One alter absorbs the others and remains active.</p>
            </button>
            <button
              type="button"
              onClick={() => onFusionTypeChange("new_formation")}
              className={cn(
                "p-3 rounded-xl border-2 text-left transition-all",
                fusionType === "new_formation"
                  ? "border-violet-500/60 bg-violet-500/10"
                  : "border-border bg-card hover:border-border/80"
              )}
            >
              <p className="text-sm font-semibold text-foreground">New Formation</p>
              <p className="text-xs text-muted-foreground mt-0.5">All source alters become dormant; a new alter emerges.</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepResult({ type, fusionType, sourceAlterIds, alters, absorptionTarget, onAbsorptionTarget, newAlterName, onNewAlterName, newAlterColor, onNewAlterColor, splitResults, onSplitResults }) {
  const sourceAlters = alters.filter(a => sourceAlterIds.includes(a.id));
  const nonSourceAlters = alters.filter(a => !sourceAlterIds.includes(a.id));
  const [newSplitName, setNewSplitName] = useState("");

  if (type === "fusion" && fusionType === "absorption") {
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-2">Which alter persists and remains active after the fusion?</p>
        <div className="flex flex-wrap gap-2">
          {sourceAlters.map(a => (
            <AlterChip
              key={a.id}
              alter={a}
              selected={absorptionTarget === a.id}
              onClick={() => onAbsorptionTarget(a.id)}
            />
          ))}
        </div>
        {!absorptionTarget && (
          <p className="text-xs text-destructive mt-2">Select the alter that persists.</p>
        )}
      </div>
    );
  }

  if (type === "fusion" && fusionType === "new_formation") {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Name of the new alter that emerges</p>
          <Input
            value={newAlterName}
            onChange={e => onNewAlterName(e.target.value)}
            placeholder="New alter name"
            className="text-sm"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Color (optional)</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newAlterColor || "#9333ea"}
              onChange={e => onNewAlterColor(e.target.value)}
              className="w-9 h-9 rounded cursor-pointer border border-border"
            />
            <span className="text-xs text-muted-foreground">{newAlterColor || "#9333ea"}</span>
          </div>
        </div>
        {!newAlterName.trim() && (
          <p className="text-xs text-destructive">Enter a name for the new alter.</p>
        )}
      </div>
    );
  }

  if (type === "split") {
    const addNewSplit = () => {
      const trimmed = newSplitName.trim();
      if (!trimmed || splitResults.some(r => r.type === "new" && r.name === trimmed)) return;
      onSplitResults([...splitResults, { type: "new", name: trimmed, color: "#9333ea" }]);
      setNewSplitName("");
    };

    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Which existing alters emerge from this split?</p>
          <div className="flex flex-wrap gap-2">
            {nonSourceAlters.map(a => {
              const sel = splitResults.some(r => r.type === "existing" && r.id === a.id);
              return (
                <AlterChip
                  key={a.id}
                  alter={a}
                  selected={sel}
                  onClick={() => {
                    onSplitResults(sel
                      ? splitResults.filter(r => !(r.type === "existing" && r.id === a.id))
                      : [...splitResults, { type: "existing", id: a.id, name: a.name }]
                    );
                  }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Or create new alters from this split</p>
          <div className="flex gap-2">
            <Input
              value={newSplitName}
              onChange={e => setNewSplitName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addNewSplit()}
              placeholder="New alter name"
              className="text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addNewSplit}>Add</Button>
          </div>
          {splitResults.filter(r => r.type === "new").map((r, i) => (
            <div key={i} className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{r.name} (new)</span>
              <button type="button" onClick={() => onSplitResults(splitResults.filter((_, idx) => idx !== splitResults.indexOf(r)))}>
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        {splitResults.length === 0 && (
          <p className="text-xs text-destructive">Add at least one result alter.</p>
        )}
      </div>
    );
  }

  return null;
}

const MERGE_FIELDS = [
  { key: "description", label: "Description" },
  { key: "pronouns", label: "Pronouns" },
  { key: "role", label: "Role" },
];

function StepApply({
  type, fusionType, sourceAlterIds, absorptionTarget, alters,
  mergeSelections, onMergeSelections,
  archiveAbsorbed, onArchiveAbsorbed,
  archiveSource, onArchiveSource,
}) {
  const persistentAlter = alters.find(a => a.id === absorptionTarget);
  const absorbedAlters = alters.filter(a => sourceAlterIds.includes(a.id) && a.id !== absorptionTarget);
  const sourceAltersList = alters.filter(a => sourceAlterIds.includes(a.id));
  const sourceAlter = sourceAltersList[0];

  if (type === "fusion" && fusionType === "absorption") {
    const anyFieldToMerge = MERGE_FIELDS.some(f =>
      absorbedAlters.some(a => a[f.key]?.trim())
    );

    return (
      <div className="space-y-4">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={archiveAbsorbed}
            onChange={e => onArchiveAbsorbed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium">Archive absorbed alters</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {absorbedAlters.map(a => a.name).join(", ")} will be hidden from the active roster. Front history and data are preserved.
            </p>
          </div>
        </label>

        {anyFieldToMerge && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Merge into {persistentAlter?.name}
            </p>
            {MERGE_FIELDS.map(({ key, label }) => {
              const candidates = absorbedAlters
                .filter(a => a[key]?.trim())
                .map(a => ({ alterId: a.id, value: a[key], name: a.name }));
              if (candidates.length === 0) return null;
              const persistentValue = persistentAlter?.[key]?.trim();
              return (
                <div key={key} className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  {persistentValue && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 break-words">
                      Current: {persistentValue}
                    </p>
                  )}
                  {candidates.map(({ alterId, value, name }) => {
                    const isSelected = mergeSelections[key]?.alterId === alterId;
                    return (
                      <label key={alterId} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-3.5 h-3.5 accent-primary"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              onMergeSelections(prev => ({ ...prev, [key]: { alterId, value } }));
                            } else {
                              onMergeSelections(prev => { const n = { ...prev }; delete n[key]; return n; });
                            }
                          }}
                        />
                        <span className="text-xs break-words">
                          <span className="text-muted-foreground">From {name}:</span> {value}
                        </span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (type === "fusion" && fusionType === "new_formation") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <p className="text-sm font-medium">Alters to archive</p>
          <div className="space-y-1.5">
            {sourceAltersList.map(a => (
              <div key={a.id} className="flex items-center gap-2">
                <AlterAvatar alter={a} size={5} />
                <span className="text-sm text-foreground">{a.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            These alters will be hidden from the active roster. Their front history and data are fully preserved.
          </p>
        </div>
      </div>
    );
  }

  if (type === "split") {
    return (
      <div className="space-y-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={archiveSource}
            onChange={e => onArchiveSource(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium">Archive {sourceAlter?.name} after split</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Check this if {sourceAlter?.name} no longer exists as a distinct part. Their front history is preserved and will appear in the result alters' history.
            </p>
          </div>
        </label>
      </div>
    );
  }

  return null;
}

function StepDetails({ year, onYear, cause, onCause, notes, onNotes }) {
  const currentYear = new Date().getFullYear();
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Year this occurred</p>
        <Input
          type="number"
          min={1900}
          max={currentYear}
          value={year}
          onChange={e => onYear(e.target.value)}
          placeholder={String(currentYear)}
          className="text-sm"
        />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Cause / trigger (optional)</p>
        <Input
          value={cause}
          onChange={e => onCause(e.target.value)}
          placeholder="e.g. Prolonged stress, trauma processing..."
          className="text-sm"
        />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Notes (optional)</p>
        <Textarea
          value={notes}
          onChange={e => onNotes(e.target.value)}
          placeholder="Any additional context..."
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function RecordSystemChangeModal({ open, onClose, preselectedAlterIds = [] }) {
  const queryClient = useQueryClient();
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => localEntities.Alter.list(),
  });

  const sortedAlters = useMemo(() =>
    [...alters].filter(a => !a.is_archived).sort((a, b) => a.name.localeCompare(b.name)),
    [alters]
  );

  const [step, setStep] = useState(0);
  const [type, setType] = useState("fusion");
  const [sourceAlterIds, setSourceAlterIds] = useState(preselectedAlterIds);
  const [fusionType, setFusionType] = useState("absorption");
  const [absorptionTarget, setAbsorptionTarget] = useState(null);
  const [newAlterName, setNewAlterName] = useState("");
  const [newAlterColor, setNewAlterColor] = useState("#9333ea");
  const [splitResults, setSplitResults] = useState([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [cause, setCause] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [mergeSelections, setMergeSelections] = useState({});
  const [archiveAbsorbed, setArchiveAbsorbed] = useState(true);
  const [archiveSource, setArchiveSource] = useState(false);

  const noResultStep = type === "dormancy" || type === "return";
  const steps = noResultStep
    ? ["Type", "Alters", "Details"]
    : ["Type", "Alters", "Result", "Details", "Apply"];
  const totalSteps = steps.length;

  function toggleSource(id, single) {
    if (single) {
      setSourceAlterIds([id]);
    } else {
      setSourceAlterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  function canAdvance() {
    if (step === 0) return !!type;
    if (step === 1) {
      if (type === "fusion") return sourceAlterIds.length >= 2 && !!fusionType;
      return sourceAlterIds.length >= 1;
    }
    if (step === 2 && !noResultStep) {
      if (type === "fusion" && fusionType === "absorption") return !!absorptionTarget;
      if (type === "fusion" && fusionType === "new_formation") return !!newAlterName.trim();
      if (type === "split") return splitResults.length > 0;
    }
    return true;
  }

  async function handleSave() {
    setSaving(true);
    try {
      let resultAlterIds = [];

      if (type === "fusion" && fusionType === "absorption") {
        resultAlterIds = [absorptionTarget];
      } else if (type === "fusion" && fusionType === "new_formation") {
        const created = await localEntities.Alter.create({
          name: newAlterName.trim(),
          color: newAlterColor,
          pronouns: "",
          description: "",
          is_archived: false,
        });
        resultAlterIds = [created.id];
      } else if (type === "split") {
        const existing = splitResults.filter(r => r.type === "existing").map(r => r.id);
        const created = await Promise.all(
          splitResults.filter(r => r.type === "new").map(r =>
            localEntities.Alter.create({ name: r.name, color: r.color || "#9333ea", is_archived: false })
          )
        );
        resultAlterIds = [...existing, ...created.map(c => c.id)];
      } else {
        // dormancy / return — result = same as source
        resultAlterIds = [...sourceAlterIds];
      }

      const yearNum = parseInt(year, 10) || new Date().getFullYear();
      await localEntities.SystemChangeEvent.create({
        type,
        date: new Date(yearNum, 0, 1).toISOString(),
        year_only: true,
        source_alter_ids: sourceAlterIds,
        result_alter_ids: resultAlterIds,
        fusion_type: type === "fusion" ? fusionType : null,
        absorbed_into_alter_id: (type === "fusion" && fusionType === "absorption") ? absorptionTarget : null,
        cause: cause.trim(),
        notes: notes.trim(),
      });

      // Auto-create "Split from" relationships when a split event is recorded
      if (type === "split") {
        for (const resultId of resultAlterIds) {
          for (const sourceId of sourceAlterIds) {
            if (resultId !== sourceId) {
              await base44.entities.AlterRelationship.create({
                alter_id_a: resultId,
                alter_id_b: sourceId,
                relationship_type: "Split from",
                direction: "a_to_b",
                color: "#a855f7",
                notes: `Auto-created from split event (${yearNum})`,
                strength: 3,
              });
            }
          }
        }
        queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
      }

      // Apply profile changes from Apply step
      if (type === "fusion" && fusionType === "absorption") {
        if (archiveAbsorbed) {
          for (const id of sourceAlterIds.filter(id => id !== absorptionTarget)) {
            await localEntities.Alter.update(id, { is_archived: true });
          }
        }
        if (Object.keys(mergeSelections).length > 0) {
          const mergeData = Object.fromEntries(
            Object.entries(mergeSelections).map(([key, { value }]) => [key, value])
          );
          await localEntities.Alter.update(absorptionTarget, mergeData);
        }
      }
      if (type === "fusion" && fusionType === "new_formation") {
        for (const id of sourceAlterIds) {
          await localEntities.Alter.update(id, { is_archived: true });
        }
      }
      if (type === "split" && archiveSource) {
        for (const id of sourceAlterIds) {
          await localEntities.Alter.update(id, { is_archived: true });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["systemChangeEvents"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const isLastStep = step === totalSteps - 1;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record System Event</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-1">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn(
                "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-colors",
                i < step ? "bg-primary text-primary-foreground"
                  : i === step ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-muted text-muted-foreground"
              )}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("flex-1 h-px", i < step ? "bg-primary/40" : "bg-border")} />
              )}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-3">{steps[step]}</p>

        {/* Step content */}
        {step === 0 && <StepType value={type} onChange={v => { setType(v); setSourceAlterIds([]); setAbsorptionTarget(null); }} />}
        {step === 1 && (
          <StepSourceAlters
            type={type}
            alters={sortedAlters}
            selected={sourceAlterIds}
            onToggle={toggleSource}
            fusionType={fusionType}
            onFusionTypeChange={setFusionType}
          />
        )}
        {step === 2 && !noResultStep && (
          <StepResult
            type={type}
            fusionType={fusionType}
            sourceAlterIds={sourceAlterIds}
            alters={sortedAlters}
            absorptionTarget={absorptionTarget}
            onAbsorptionTarget={setAbsorptionTarget}
            newAlterName={newAlterName}
            onNewAlterName={setNewAlterName}
            newAlterColor={newAlterColor}
            onNewAlterColor={setNewAlterColor}
            splitResults={splitResults}
            onSplitResults={setSplitResults}
          />
        )}
        {((step === 2 && noResultStep) || (step === 3 && !noResultStep)) && (
          <StepDetails
            year={year} onYear={setYear}
            cause={cause} onCause={setCause}
            notes={notes} onNotes={setNotes}
          />
        )}
        {step === 4 && !noResultStep && (
          <StepApply
            type={type}
            fusionType={fusionType}
            sourceAlterIds={sourceAlterIds}
            absorptionTarget={absorptionTarget}
            alters={sortedAlters}
            mergeSelections={mergeSelections}
            onMergeSelections={setMergeSelections}
            archiveAbsorbed={archiveAbsorbed}
            onArchiveAbsorbed={setArchiveAbsorbed}
            archiveSource={archiveSource}
            onArchiveSource={setArchiveSource}
          />
        )}

        {/* Nav buttons */}
        <div className="flex gap-2 mt-4">
          {step > 0 && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {!isLastStep && (
            <Button size="sm" className="flex-1" disabled={!canAdvance()} onClick={() => setStep(s => s + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {isLastStep && (
            <Button size="sm" className="flex-1" disabled={saving || !canAdvance()} onClick={handleSave}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Event"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
