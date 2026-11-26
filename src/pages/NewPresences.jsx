import React, { useMemo, useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, Plus, Trash2, Link2, RefreshCw, X, Pencil, GitMerge, Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import PresenceFormModal from "@/components/presences/PresenceFormModal";
import CreateAlterFromPresence from "@/components/presences/CreateAlterFromPresence";
import QuickPeopleSheet from "@/components/shared/QuickPeopleSheet";
import { sightingsOf } from "@/components/presences/PresencePicker";
import { computeRecurrence, suggestAlters } from "@/lib/presenceSimilarity";
import { TRASH_HINT } from "@/lib/trashSettings";
import RichText from "@/components/shared/RichText";
import { sharedList } from "@/lib/sharedLists";
import RowMenu from "@/components/shared/RowMenu";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { useUiLook, usePixelDesk } from "@/lib/uiLook";
import "@/styles/pixel/meeting.css";

function AlterChip({ alter, onRemove }) {
  const formatAlter = useAlterLabel();
  if (!alter) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
      style={{ backgroundColor: alter.color ? `${alter.color}20` : undefined, borderColor: alter.color || undefined }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: alter.color || "var(--muted-foreground)" }} />
      {formatAlter(alter)}
      {onRemove && (
        <button onClick={onRemove} aria-label={`Unlink ${alter.name}`} className="ml-0.5 text-muted-foreground hover:text-destructive">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export default function NewPresences() {
  const terms = useTerms();
  const qc = useQueryClient();
  const [formFor, setFormFor] = useState(undefined); // undefined=closed, null=new, object=edit
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [createAlterFor, setCreateAlterFor] = useState(null);
  const [showSeveral, setShowSeveral] = useState(false);
  const pixel = useUiLook() === "pixel";
  const desk = usePixelDesk();
  const formatAlter = useAlterLabel();

  const { data: presences = [] } = useQuery({
    ...sharedList("presences"),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });

  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  // Once a presence has become an alter (resolved_alter_id set) it's no longer
  // a "new" presence — drop it from the list. The record itself is kept (and
  // backed up); it just stops cluttering the unidentified list.
  const visible = useMemo(() => presences.filter((p) => !p.resolved_alter_id), [presences]);
  const recurrence = useMemo(() => computeRecurrence(visible), [visible]);

  useHighlightScroll([visible.length]);

  const linkAlter = async (presence, alterId) => {
    try {
      const ids = [...new Set([...(presence.associated_alter_ids || []), alterId])];
      await base44.entities.Presence.update(presence.id, { associated_alter_ids: ids });
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success("Linked");
    } catch (e) {
      toast.error(e.message || "Couldn't link");
    }
  };

  const unlinkAlter = async (presence, alterId) => {
    try {
      const ids = (presence.associated_alter_ids || []).filter((x) => x !== alterId);
      await base44.entities.Presence.update(presence.id, { associated_alter_ids: ids });
      qc.invalidateQueries({ queryKey: ["presences"] });
    } catch (e) {
      toast.error(e.message || "Couldn't unlink");
    }
  };

  const remove = async (presence) => {
    if (!(await confirm(`Delete this presence record? ${TRASH_HINT}`))) return;
    try {
      await base44.entities.Presence.delete(presence.id);
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e.message || "Couldn't delete");
    }
  };

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  // Merge the selected presences into one: union their sightings + linked
  // alters + notes, fill any blank attributes from the others, then delete the
  // now-absorbed records. No data is lost — everything is folded into the one
  // that persists (the one with the most sightings).
  const mergeSelected = async () => {
    const items = presences.filter((p) => selected.has(p.id));
    if (items.length < 2) return;
    if (!(await confirm(`Merge ${items.length} presences into one? Their sightings, links and notes are combined.`))) return;
    const primary = [...items].sort((a, b) => sightingsOf(b).length - sightingsOf(a).length)[0];
    const others = items.filter((p) => p.id !== primary.id);
    const allSightings = [...new Set(items.flatMap(sightingsOf))].sort();
    const linked = [...new Set(items.flatMap((p) => p.associated_alter_ids || []))];
    const notes = items.map((p) => p.notes).filter(Boolean).join("\n");
    const firstNonEmpty = (key) => primary[key] || others.find((o) => o[key])?.[key] || "";
    try {
      await base44.entities.Presence.update(primary.id, {
        sightings: allSightings,
        timestamp: allSightings[allSightings.length - 1] || primary.timestamp,
        associated_alter_ids: linked,
        notes,
        label: firstNonEmpty("label"),
        color: firstNonEmpty("color"),
        emoji: firstNonEmpty("emoji"),
        vibe: firstNonEmpty("vibe"),
        relationship_type: firstNonEmpty("relationship_type"),
      });
      for (const o of others) await base44.entities.Presence.delete(o.id);
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success(`Merged ${items.length} into one`);
      setSelected(new Set());
      setSelectMode(false);
    } catch (e) {
      toast.error(e.message || "Couldn't merge");
    }
  };

  const modals = (
    <>
      <PresenceFormModal open={formFor !== undefined} presence={formFor || null} onClose={() => setFormFor(undefined)} />
      <CreateAlterFromPresence open={!!createAlterFor} presence={createAlterFor} onClose={() => setCreateAlterFor(null)} />
      <QuickPeopleSheet open={showSeveral} onClose={() => setShowSeveral(false)} unsure />
    </>
  );

  if (pixel) {
    // Pixel look (PresencesPhone board): + Record / Select to merge, then
    // one panel per presence — colour square and name in the title bar,
    // how often it was seen on the right, the note, the alters it might be
    // or is linked with as chips, and Link · Make alter · ⋯ underneath.
    const chipFor = (a, { onClick, onRemove, title } = {}) => (
      <span key={a.id} className="pxm-chip" style={onClick ? { outlineStyle: "dashed" } : undefined}>
        {onClick ? (
          <button type="button" onClick={onClick} title={title} className="inline-flex items-center gap-1.5">
            <span className="pxm-sq" style={{ background: a.color || undefined }} />{formatAlter(a)}
          </button>
        ) : (
          <><span className="pxm-sq" style={{ background: a.color || undefined }} />{formatAlter(a)}</>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Unlink ${a.name}`} className="pxm-x" style={{ minWidth: 18, minHeight: 18 }}>
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
    const cards = visible.map((p) => {
      const linked = (p.associated_alter_ids || []).map((id) => alterById[id]).filter(Boolean);
      const linkedIds = new Set(linked.map((a) => a.id));
      const suggestions = suggestAlters(p, alters, 3).filter((a) => !linkedIds.has(a.id));
      const recurCount = recurrence.get(p.id) || 0;
      const seen = sightingsOf(p).length;
      const isSel = selected.has(p.id);
      const name = p.label || p.vibe || "Unnamed presence";
      return (
        <div key={p.id} data-highlight-id={p.id} className={`pxm-pn pxm-pres${isSel ? " sel" : ""}`}
          onClick={selectMode ? () => toggleSelect(p.id) : undefined}
          role={selectMode ? "button" : undefined} aria-pressed={selectMode ? isSel : undefined}
          style={selectMode ? { cursor: "pointer" } : undefined}>
          <div className="pxm-ttl">
            <span className="pxm-ttl-name">
              {selectMode && <span className={`pxm-tick${isSel ? " y" : ""}`} aria-hidden="true">{isSel ? "x" : ""}</span>}
              <span className="pxm-sq" style={{ background: p.color || undefined }} />
              {p.emoji && <span aria-hidden="true">{p.emoji}</span>}
              <span className="truncate">{name}</span>
            </span>
            <span className="pxm-mut" style={{ paddingRight: 6 }}>{seen > 1 ? `seen ${seen} times` : "seen once"}</span>
          </div>
          <div className="pxm-body">
            {p.label && p.vibe && <div className="pxm-mut" style={{ fontSize: 13 }}>{p.vibe}</div>}
            {p.notes && <div className="whitespace-pre-wrap"><RichText content={p.notes} /></div>}
            {(p.timestamp || recurCount > 0) && (
              <div className="pxm-mut" style={{ fontSize: 12 }}>
                {p.timestamp && `last ${formatDistanceToNow(new Date(p.timestamp), { addSuffix: true })}`}
                {recurCount > 0 && ` · resembles ${recurCount} other${recurCount > 1 ? "s" : ""}`}
              </div>
            )}
            {linked.length > 0 && (
              <div className="pxm-row pxm-wrap">
                <span className="pxm-mut" style={{ fontSize: 12 }}>{p.relationship_type || "Associated with"}:</span>
                {linked.map((a) => chipFor(a, { onRemove: selectMode ? undefined : (e) => { e.stopPropagation(); unlinkAlter(p, a.id); } }))}
              </div>
            )}
            {!selectMode && suggestions.length > 0 && (
              <div className="pxm-row pxm-wrap">
                <span className="pxm-mut" style={{ fontSize: 12 }}>Might be:</span>
                {suggestions.map((a) => chipFor(a, { onClick: () => linkAlter(p, a.id), title: `Link this presence to ${formatAlter(a)}` }))}
              </div>
            )}
            {!selectMode && (
              <div className="pxm-pres-acts">
                <span className="pxm-grow" />
                <span className="pxm-pres-link" style={{ width: 96 }}>
                  <AlterSearchSelect alters={alters} value={null} showNone={false} terms={terms} placeholder="Link"
                    disabledIds={linkedIds} disabledLabel="linked"
                    onChange={(id) => { if (id) linkAlter(p, id); }} />
                </span>
                <button type="button" className="pxm-btn sm" onClick={() => setCreateAlterFor(p)}
                  title={`Create ${an(terms.alter)} from this presence`}>Make {terms.alter}</button>
                <RowMenu label="Presence actions" className="pxm-btn sm !m-0 !w-auto !h-auto" items={[
                  { label: "Edit", icon: Pencil, onSelect: () => setFormFor(p) },
                  { label: "Delete", icon: Trash2, onSelect: () => remove(p), destructive: true },
                ]} />
              </div>
            )}
          </div>
        </div>
      );
    });
    const toolbar = (
      <>
        <div className="pxm-row" style={{ gap: 10 }}>
          <button type="button" className="pxm-btn on pxm-grow" style={{ flex: 1 }} onClick={() => setFormFor(null)}>+ Record</button>
          <button type="button" className={`pxm-btn pxm-grow${selectMode ? " on" : ""}`} style={{ flex: 1 }}
            disabled={visible.length < 2 && !selectMode}
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}>
            {selectMode ? "Cancel merge" : "Select to merge"}
          </button>
        </div>
        {selectMode && (
          <div className="pxm-row">
            <span className="pxm-mut pxm-grow" style={{ fontSize: 14 }}>{selected.size} selected</span>
            <button type="button" className="pxm-btn on sm" onClick={mergeSelected} disabled={selected.size < 2}>Merge</button>
          </div>
        )}
      </>
    );
    const empty = (
      <div className="pxm-pn"><div className="pxm-empty">
        Nothing recorded yet. When you sense a presence you can't quite place, tap Record (or the “New presence” tab when you set {terms.fronters}) and jot down whatever you noticed.
      </div></div>
    );
    const intro = (
      <div className="pxm-intro">
        Sensed someone you can't pin down yet? Record the fragment, a name, a colour, a vibe, and spot when it comes back or might be a known {terms.alter}.
      </div>
    );
    if (desk) {
      return (
        <div className="pxm pxm-desk os-page-shell" data-tour="new-presences">
          <h1 className="sr-only">New presences</h1>
          <div className="pxm-pn pxm-side">
            <div className="pxm-ttl">
              <span>Presences</span>
              <button type="button" className="pxm-btn xs" onClick={() => setShowSeveral(true)}>Add several</button>
            </div>
            <div className="pxm-side-scroll">
              {visible.map((p) => (
                <button key={p.id} type="button" className="pxm-side-row"
                  onClick={() => document.querySelector(`[data-highlight-id="${p.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  <span className="pxm-sq" style={{ background: p.color || undefined }} />
                  <span className="pxm-side-name">{p.label || p.vibe || "Unnamed presence"}</span>
                  <span className="pxm-side-count">{sightingsOf(p).length}</span>
                </button>
              ))}
              {visible.length === 0 && <div className="pxm-empty">None yet.</div>}
            </div>
            <div className="pxm-side-foot">{intro}</div>
          </div>
          <div className="pxm" style={{ minWidth: 0 }}>
            {toolbar}
            {visible.length === 0 ? empty : <div className="pxm-cards">{cards}</div>}
          </div>
          {modals}
        </div>
      );
    }
    return (
      <div className="pxm os-page-shell" data-tour="new-presences">
        <h1 className="sr-only">New presences</h1>
        {intro}
        {toolbar}
        <button type="button" className="pxm-btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowSeveral(true)}>Add several</button>
        {visible.length === 0 ? empty : <div className="pxm-cards">{cards}</div>}
        {modals}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 os-page-shell" data-tour="new-presences">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> New presences
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Sensed someone you can't pin down yet? Record the fragment — a name, a colour, a vibe — and spot when it reoccurs or might be a known {terms.alter}.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Button onClick={() => setFormFor(null)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Record
          </Button>
          <button
            onClick={() => setShowSeveral(true)}
            className="text-xs px-2 py-1 rounded-lg text-primary hover:bg-primary/10 min-h-[32px]"
          >
            Add several
          </button>
          {visible.length > 1 && (
            <button
              onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
              className={`text-xs px-2 py-1 rounded-lg transition-colors ${selectMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
            >
              {selectMode ? "Cancel" : "Select to merge"}
            </button>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <Button size="sm" onClick={mergeSelected} disabled={selected.size < 2} className="gap-1.5">
            <GitMerge className="w-4 h-4" /> Merge
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60">
          <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Nothing recorded yet. When you sense a presence you can't quite place — in the moment or later — tap <strong>Record</strong> (or the “New presence” tab when you set {terms.fronters}) and jot down whatever you noticed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const linked = (p.associated_alter_ids || []).map((id) => alterById[id]).filter(Boolean);
            const suggestions = suggestAlters(p, alters, 3);
            const recurCount = recurrence.get(p.id) || 0;
            const seen = sightingsOf(p).length;
            const resolved = p.resolved_alter_id ? alterById[p.resolved_alter_id] : null;
            const isSel = selected.has(p.id);
            return (
              <div
                key={p.id}
                data-highlight-id={p.id}
                onClick={selectMode ? () => toggleSelect(p.id) : undefined}
                className={`rounded-2xl border bg-card p-4 space-y-2.5 ${selectMode ? "cursor-pointer" : ""} ${isSel ? "border-primary ring-1 ring-primary" : "border-border/60"}`}
              >
                <div className="flex items-start gap-3">
                  {selectMode && (
                    <span className={`w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center flex-shrink-0 ${isSel ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                      {isSel && <Check className="w-3.5 h-3.5" />}
                    </span>
                  )}
                  <div
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg"
                    style={{ backgroundColor: p.color ? `${p.color}30` : "hsl(var(--muted))", boxShadow: p.color ? `inset 0 0 0 2px ${p.color}` : undefined }}
                  >
                    {p.emoji || "🌫️"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-tight">{p.label || p.vibe || "Unnamed presence"}</p>
                    {p.label && p.vibe && <p className="text-xs text-muted-foreground">{p.vibe}</p>}
                    <p className="text-xs text-muted-foreground">
                      {seen > 1 ? `seen ${seen}×` : "seen once"}
                      {p.timestamp && <span> · last {formatDistanceToNow(new Date(p.timestamp), { addSuffix: true })}</span>}
                      {recurCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="w-3 h-3" /> resembles {recurCount} other{recurCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  {!selectMode && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!resolved && (
                        <button onClick={() => setCreateAlterFor(p)} aria-label={`Create ${terms.alter} from this presence`} title={`Create ${terms.alter} from this`} className="text-muted-foreground hover:text-primary p-1">
                          <UserPlus className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setFormFor(p)} aria-label="Edit presence" className="text-muted-foreground hover:text-foreground p-1">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(p)} aria-label="Delete presence" className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {p.notes && <p className="text-sm text-foreground/90 whitespace-pre-wrap"><RichText content={p.notes} /></p>}

                {resolved && <p className="text-xs text-emerald-500">Identified as <strong>{resolved.name}</strong></p>}

                {linked.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{p.relationship_type || "Associated with"}:</span>
                    {linked.map((a) => (
                      <AlterChip key={a.id} alter={a} onRemove={selectMode ? undefined : () => unlinkAlter(p, a.id)} />
                    ))}
                  </div>
                )}

                {!selectMode && suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                    <span className="text-xs text-muted-foreground">Might be:</span>
                    {suggestions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => linkAlter(p, a.id)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-border hover:border-primary hover:text-primary transition-colors"
                        title="Link this presence to this alter"
                      >
                        <Link2 className="w-3 h-3" />
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color || "var(--muted-foreground)" }} />
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PresenceFormModal open={formFor !== undefined} presence={formFor || null} onClose={() => setFormFor(undefined)} />
      <CreateAlterFromPresence open={!!createAlterFor} presence={createAlterFor} onClose={() => setCreateAlterFor(null)} />
      <QuickPeopleSheet open={showSeveral} onClose={() => setShowSeveral(false)} unsure />
    </motion.div>
  );
}
