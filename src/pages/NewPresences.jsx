import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, Plus, Trash2, Link2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import PresenceFormModal from "@/components/presences/PresenceFormModal";
import { computeRecurrence, suggestAlters } from "@/lib/presenceSimilarity";

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
  const [showForm, setShowForm] = useState(false);

  const { data: presences = [] } = useQuery({
    queryKey: ["presences"],
    queryFn: () => base44.entities.Presence.list("-timestamp", 500),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });

  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const recurrence = useMemo(() => computeRecurrence(presences), [presences]);

  useHighlightScroll([presences.length]);

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
    if (!window.confirm("Delete this presence record? This can't be undone.")) return;
    try {
      await base44.entities.Presence.delete(presence.id);
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success("Deleted");
    } catch (e) {
      toast.error(e.message || "Couldn't delete");
    }
  };

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
        <Button onClick={() => setShowForm(true)} className="flex-shrink-0 gap-1.5">
          <Plus className="w-4 h-4" /> Record
        </Button>
      </div>

      {presences.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60">
          <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Nothing recorded yet. When you sense a presence you can't quite place — in the moment or later — tap <strong>Record</strong> (or the “New presence” tab when you set {terms.fronters}) and jot down whatever you noticed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {presences.map((p) => {
            const linked = (p.associated_alter_ids || []).map((id) => alterById[id]).filter(Boolean);
            const suggestions = suggestAlters(p, alters, 3);
            const recurCount = recurrence.get(p.id) || 0;
            const resolved = p.resolved_alter_id ? alterById[p.resolved_alter_id] : null;
            return (
              <div
                key={p.id}
                data-highlight-id={p.id}
                className="rounded-2xl border border-border/60 bg-card p-4 space-y-2.5"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg"
                    style={{ backgroundColor: p.color ? `${p.color}30` : "hsl(var(--muted))", boxShadow: p.color ? `inset 0 0 0 2px ${p.color}` : undefined }}
                  >
                    {p.emoji || "🌫️"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-tight">
                      {p.label || p.vibe || "Unnamed presence"}
                    </p>
                    {p.label && p.vibe && <p className="text-xs text-muted-foreground">{p.vibe}</p>}
                    <p className="text-xs text-muted-foreground">
                      {p.timestamp ? formatDistanceToNow(new Date(p.timestamp), { addSuffix: true }) : ""}
                      {recurCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="w-3 h-3" /> resembles {recurCount} other{recurCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {p.recurs && <span className="ml-2 text-muted-foreground/80">· felt familiar</span>}
                    </p>
                  </div>
                  <button onClick={() => remove(p)} aria-label="Delete presence" className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {p.notes && <p className="text-sm text-foreground/90 whitespace-pre-wrap">{p.notes}</p>}

                {resolved && (
                  <p className="text-xs text-emerald-500">Identified as <strong>{resolved.name}</strong></p>
                )}

                {linked.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{p.relationship_type || "Associated with"}:</span>
                    {linked.map((a) => (
                      <AlterChip key={a.id} alter={a} onRemove={() => unlinkAlter(p, a.id)} />
                    ))}
                  </div>
                )}

                {suggestions.length > 0 && (
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

      <PresenceFormModal open={showForm} onClose={() => setShowForm(false)} />
    </motion.div>
  );
}
