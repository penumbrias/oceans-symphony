import SearchableSelect from "@/components/shared/SearchableSelect";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

/**
 * Alter scope collapsible section for ReminderEditorModal.
 * Handles the "who is this reminder for?" UI and soft conflict warnings.
 */
export default function AlterScopeSection({ form, set, alters }) {
  const nonArchivedAlters = alters.filter(a => !a.is_archived);
  const isSpecific = !!form.alter_id;
  const selectedAlter = alters.find(a => a.id === form.alter_id);
  const isArchivedAlter = form.alter_id && selectedAlter?.is_archived;

  // Conflict detection
  const warnings = [];
  const triggerAlterId = form.trigger_config?.alter_id;

  if (
    form.alter_id &&
    form.alter_scope === "when_fronting" &&
    form.trigger_type === "contextual" &&
    form.trigger_config?.on === "alter_fronts" &&
    triggerAlterId === form.alter_id
  ) {
    warnings.push(
      `Heads-up: this reminder is already tied to ${selectedAlter?.name || "this alter"}'s fronting via the trigger — the "when fronting" scope is redundant here. You can leave it or switch to "Always active".`
    );
  }

  if (
    form.alter_id &&
    form.trigger_type === "contextual" &&
    form.trigger_config?.on === "alter_fronts" &&
    triggerAlterId &&
    triggerAlterId !== form.alter_id
  ) {
    const triggerAlter = alters.find(a => a.id === triggerAlterId);
    warnings.push(
      `This reminder is tied to ${selectedAlter?.name || "one alter"} but triggers when ${triggerAlter?.name || "another alter"} fronts — is that intentional?`
    );
  }

  if (
    form.alter_id &&
    form.alter_scope === "when_fronting" &&
    form.trigger_type === "event"
  ) {
    warnings.push(
      `This event reminder will skip if ${selectedAlter?.name || "this alter"} isn't fronting at the event time. Consider "Always active" instead if you don't want to miss it.`
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        By default, reminders fire for the whole system. You can tie a reminder to a specific alter — either as a label (so you know who it's for) or conditional on them being in the front.
      </p>

      {/* Archived alter warning */}
      {isArchivedAlter && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The alter this was tied to is archived. Pick a new alter or switch to whole system.
          </p>
        </div>
      )}

      {/* Who is this for? */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground">Who is this reminder for?</Label>
        <div className="flex flex-col gap-2 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="alter_scope_who"
              checked={!isSpecific}
              onChange={() => { set("alter_id", null); set("alter_scope", null); set("alter_scope_catchup", false); }}
              className="accent-primary"
            />
            <span className="text-sm">Whole system</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="alter_scope_who"
              checked={isSpecific}
              onChange={() => { set("alter_id", ""); set("alter_scope", "always"); }}
              className="accent-primary"
            />
            <span className="text-sm">A specific alter</span>
          </label>
        </div>
      </div>

      {/* Alter picker + scope */}
      {isSpecific && (
        <div className="space-y-3 pl-5 border-l-2 border-border/40">
          <div>
            <Label className="text-xs text-muted-foreground">Alter</Label>
            <SearchableSelect
              className="mt-1"
              value={form.alter_id || null}
              onChange={id => set("alter_id", id || "")}
              options={[
                ...nonArchivedAlters.map(a => ({
                  id: a.id,
                  label: a.name,
                  sublabel: a.alias || a.pronouns,
                  avatar_url: a.avatar_url,
                  color: a.color,
                })),
                // show archived alters if one is currently selected
                ...(isArchivedAlter ? [{
                  id: selectedAlter.id,
                  label: `${selectedAlter.name} (archived)`,
                  sublabel: selectedAlter.alias || selectedAlter.pronouns,
                  avatar_url: selectedAlter.avatar_url,
                  color: selectedAlter.color,
                }] : []),
              ]}
              placeholder="— select alter —"
              allowClear
            />
          </div>

          {/* Scope pills */}
          <div>
            <Label className="text-xs text-muted-foreground">When should this fire?</Label>
            <div className="flex gap-2 mt-1.5">
              {[
                { value: "always", label: "Always active" },
                { value: "when_fronting", label: "Only when they're fronting" },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("alter_scope", opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.alter_scope === opt.value
                      ? "bg-primary text-white border-primary"
                      : "bg-muted/30 text-muted-foreground border-border/40 hover:border-primary/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.alter_scope === "always" && (
              <p className="text-xs text-muted-foreground mt-1.5">
                This reminder will fire normally — the alter label is just for organization.
              </p>
            )}
            {form.alter_scope === "when_fronting" && (
              <p className="text-xs text-muted-foreground mt-1.5">
                This reminder pauses itself automatically when {selectedAlter?.name || "this alter"} isn't in the front. Good for alter-specific rituals or prompts.
              </p>
            )}
          </div>

          {/* Catchup toggle — only for when_fronting + scheduled/interval */}
          {form.alter_scope === "when_fronting" && ["scheduled", "interval"].includes(form.trigger_type) && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.alter_scope_catchup}
                onChange={e => set("alter_scope_catchup", e.target.checked)}
                className="accent-primary mt-0.5"
              />
              <span className="text-xs text-muted-foreground">
                If {selectedAlter?.name || "this alter"} wasn't fronting when this was due, fire the next time they take front (expires after 24h)
              </span>
            </label>
          )}
        </div>
      )}

      {/* Conflict warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
        </div>
      ))}
    </div>
  );
}