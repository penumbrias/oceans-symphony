import { useState } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_ICONS, triggerSummary } from "./reminderHelpers";
import { useTerms } from "@/lib/useTerms";
import ReminderEditorModal from "./ReminderEditorModal";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useUiLook, UI_LOOKS, usePixelDesk } from "@/lib/uiLook";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { formatTime } from "@/lib/timeFormat";
import "@/styles/pixel/reminders.css";

// "22:00" → the person's clock style ("10:00 PM" / "22:00").
function clockLabel(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm || "";
  const d = new Date(); d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return formatTime(d, { hour: "numeric", minute: "2-digit" });
}

function AlterDot({ alter }) {
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgErrorFor, setImgError] = useState(null);
  const imgError = !!imgErrorFor && imgErrorFor === resolvedUrl;
  if (!alter) return null;
  const color = alter.color || "#3B82F6";
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 border-2 overflow-hidden"
      style={{ borderColor: color, backgroundColor: color }}
    >
      {resolvedUrl && !imgError ? (
        <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(resolvedUrl)} />
      ) : (
        alter.name?.[0]?.toUpperCase() || "?"
      )}
    </div>
  );
}

// The pixel list's one-line "when": the shared summary, with the
// contextual kinds spelled out in the person's words.
function pixelSummary(r, terms, alterMap, formatAlter) {
  if (r.trigger_type !== "contextual") return triggerSummary(r);
  const cfg = r.trigger_config || {};
  const after = cfg.delay_minutes ? `, then ${cfg.delay_minutes} min later` : "";
  switch (cfg.on) {
    case "no_front_update": return `No ${terms.front} update for ${cfg.threshold_minutes || 120} min`;
    case "emotion_logged": return `When a feeling is logged${after}`;
    case "symptom_logged": return `When a symptom is logged${after}`;
    case "alter_fronts": {
      const a = cfg.alter_id ? alterMap[cfg.alter_id] : null;
      return `When ${a ? formatAlter(a) : `any ${terms.alter}`} ${terms.fronts}${after}`;
    }
    case "sleep_ended": return `After sleep ends${after}`;
    default: return triggerSummary(r);
  }
}

// `before` (pixel look only): what sits above "Your reminders" in the same
// column — the Inbox tab puts its "Due now" panel there.
export default function RemindersManage({ before = null } = {}) {
  const terms = useTerms();
  const pixel = useUiLook() === UI_LOOKS.PIXEL;
  const desk = usePixelDesk();
  const formatAlter = useAlterLabel();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const quiet = pickPrimarySystemSettings(settingsList)?.quiet_hours;
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterValue, setFilterValue] = useState("all"); // "all" | "system" | "per_alter" | alter.id

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => base44.entities.Reminder.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));

  // Alters that actually have reminders scoped to them
  const scopedAlterIds = [...new Set(reminders.filter(r => r.alter_id).map(r => r.alter_id))];
  const scopedAlters = scopedAlterIds.map(id => alterMap[id]).filter(Boolean);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["reminders", "all"] });
    queryClient.invalidateQueries({ queryKey: ["reminderInstances"] });
  };

  const handleToggle = async (r) => {
    const next = !r.is_active;
    await base44.entities.Reminder.update(r.id, { is_active: next });
    invalidate();
    toast(next ? "Reminder enabled" : "Reminder paused");
  };

  const handleDelete = async (r) => {
    if (!(await confirm(`Delete "${r.title}"?`))) return false;
    // Cascade: end every ReminderInstance tied to this reminder so a
    // lingering "fired" instance doesn't keep the notification bell
    // badge lit after the parent reminder is gone.
    try {
      const linked = await base44.entities.ReminderInstance.filter({ reminder_id: r.id });
      for (const inst of linked || []) {
        await base44.entities.ReminderInstance.delete(inst.id);
      }
    } catch { /* non-fatal */ }
    await base44.entities.Reminder.delete(r.id);
    queryClient.invalidateQueries({ queryKey: ["reminderInstances", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["reminderInstances"] });
    invalidate();
    toast.success(`"${r.title}" deleted`);
    return true;
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (r) => { setEditing(r); setEditorOpen(true); };

  // Filter logic
  const filtered = reminders.filter(r => {
    if (filterValue === "all") return true;
    if (filterValue === "system") return !r.alter_id;
    if (filterValue === "per_alter") return !!r.alter_id;
    return r.alter_id === filterValue; // specific alter id
  });

  const filterLabel = () => {
    if (filterValue === "all") return "All reminders";
    if (filterValue === "system") return `${terms.System}-wide`;
    if (filterValue === "per_alter") return `Per-${terms.alter}`;
    const a = alterMap[filterValue];
    return a ? `For ${a.name}` : `Specific ${terms.alter}`;
  };

  if (pixel) {
    const filterMenu = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={desk ? "prm-btn prm-btn-ttl" : "prm-btn"}>{filterLabel()} <ChevronDown className="w-3 h-3" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setFilterValue("all")}>All reminders</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFilterValue("system")}>{terms.System}-wide</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFilterValue("per_alter")}>Per-{terms.alter}</DropdownMenuItem>
          {scopedAlters.map(a => (
            <DropdownMenuItem key={a.id} onClick={() => setFilterValue(a.id)}>
              <span className="flex items-center gap-2"><AlterDot alter={a} />{formatAlter(a)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const quietText = quiet?.enabled ? `quiet ${clockLabel(quiet.start || "22:00")} to ${clockLabel(quiet.end || "08:00")}` : "";
    const list = (
      <section className="prm-pn" aria-label="Your reminders">
        <div className="prm-ttl">
          <span>Your reminders</span>
          <span className="prm-ttl-acts">
            {quietText && <span className="prm-mut prm-quiet">{quietText}</span>}
            {/* On a computer the list's own buttons sit in its title bar, like the To-do board. */}
            {desk && <button type="button" className="prm-btn prm-btn-ttl on" onClick={openNew}><Plus className="w-3.5 h-3.5" /> New reminder</button>}
            {desk && filterMenu}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="prm-empty">{reminders.length ? "No reminders match this filter." : "No reminders yet. Make one with + New reminder."}</div>
        ) : filtered.map(r => {
          const alter = r.alter_id ? alterMap[r.alter_id] : null;
          const archived = alter?.is_archived;
          const on = !!r.is_active && !archived;
          const sel = editorOpen && editing?.id === r.id;
          return (
            <div key={r.id} className={sel ? "prm-rrow sel" : "prm-rrow"}>
              <button type="button" className="prm-rrow-main" onClick={() => openEdit(r)} aria-label={`Change ${r.title}`}>
                <span className="prm-rrow-text">
                  <span className={r.is_active ? "prm-rrow-title" : "prm-rrow-title off"}>{r.title}</span>
                  <span className="prm-rrow-how">{pixelSummary(r, terms, alterMap, formatAlter)}</span>
                  {archived && <span className="prm-rrow-warn">Tied to archived {terms.alter} — currently paused</span>}
                </span>
                <span className="prm-rrow-who" style={alter && !archived ? { color: alter.color || undefined } : undefined}>
                  {alter ? (archived ? `archived ${terms.alter}` : formatAlter(alter)) : "everyone"}
                  {alter && !archived && r.alter_scope === "when_fronting" ? ` · when ${terms.fronting}` : ""}
                </span>
              </button>
              <button type="button" className={on ? "prm-tick y" : "prm-tick"} aria-pressed={on} disabled={archived}
                aria-label={on ? `Pause ${r.title}` : `Turn on ${r.title}`} onClick={() => handleToggle(r)}>
                {on ? "on" : ""}
              </button>
            </div>
          );
        })}
        <div className="prm-note">Tap one to change it. Tap the box to pause or turn it on. Delivery: in the app, and as phone notifications where allowed.</div>
      </section>
    );
    const tools = (
      <div className="prm-tools">
        <button type="button" className="prm-btn on" onClick={openNew}><Plus className="w-4 h-4" /> New reminder</button>
        {filterMenu}
      </div>
    );
    const editor = (
      <ReminderEditorModal
        inline={desk}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        existing={editing}
        onSaved={invalidate}
        onDelete={async (r) => { if (await handleDelete(r)) setEditorOpen(false); }}
      />
    );
    if (desk) {
      return (
        <div className="prm-desk">
          <div className="prm-col">{before}{list}</div>
          <aside className="prm-side">
            {editorOpen ? editor : (
              <section className="prm-pn">
                <div className="prm-ttl"><span>Reminder</span></div>
                <div className="prm-empty">Pick a reminder to change it, or make a new one.</div>
                <div className="prm-side-act"><button type="button" className="prm-btn on" onClick={openNew}><Plus className="w-4 h-4" /> New reminder</button></div>
              </section>
            )}
          </aside>
        </div>
      );
    }
    return <div className="prm-col">{tools}{before}{list}{editor}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {/* Filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              {filterLabel()} <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
             <DropdownMenuItem onClick={() => setFilterValue("all")}>All reminders</DropdownMenuItem>
             <DropdownMenuItem onClick={() => setFilterValue("system")}>{terms.System}-wide</DropdownMenuItem>
             <DropdownMenuItem onClick={() => setFilterValue("per_alter")}>Per-{terms.alter}</DropdownMenuItem>
            {scopedAlters.map(a => (
              <DropdownMenuItem key={a.id} onClick={() => setFilterValue(a.id)}>
                <span className="flex items-center gap-2">
                  <AlterDot alter={a} />
                  {a.name}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" className="gap-2" onClick={openNew}>
          <Plus className="w-4 h-4" /> New Reminder
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-10 text-sm">No reminders found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const Icon = CATEGORY_ICONS[r.category] || CATEGORY_ICONS.custom;
            const alter = r.alter_id ? alterMap[r.alter_id] : null;
            const isArchivedAlter = alter?.is_archived;

            return (
              <div key={r.id} className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-3 ${isArchivedAlter ? "border-amber-200/60 dark:border-amber-800/40" : "border-border/50"}`}>
                {/* Icon or alter avatar */}
                {alter ? (
                  <AlterDot alter={alter} />
                ) : (
                  <span className="text-lg flex-shrink-0">{Icon}</span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium text-sm truncate ${!r.is_active ? "text-muted-foreground line-through" : ""}`}>{r.title}</p>
                    {alter && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{
                          backgroundColor: (alter.color || "#3B82F6") + "22",
                          color: alter.is_archived ? "#94A3B8" : (alter.color || "#3B82F6"),
                          border: `1px solid ${(alter.color || "#3B82F6")}44`,
                        }}
                      >
                        {isArchivedAlter ? `[archived ${terms.alter}]` : `For ${alter.name}`}
                        {r.alter_scope === "when_fronting" && !isArchivedAlter && ` · when ${terms.fronting}`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{triggerSummary(r)}</p>
                  {isArchivedAlter && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">Tied to archived {terms.alter} — currently paused</p>
                    </div>
                  )}
                </div>

                <Switch checked={!!r.is_active && !isArchivedAlter} disabled={isArchivedAlter} onCheckedChange={() => handleToggle(r)} />
                <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(r)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ReminderEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        existing={editing}
        onSaved={invalidate}
      />
    </div>
  );
}