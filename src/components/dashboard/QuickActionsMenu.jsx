import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, MapPin, Loader2, UserPlus, RefreshCw, Check } from "lucide-react";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import RatingRow from "@/components/diary/RatingRow";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { getTodayString, applyTerms } from "@/lib/dailyTaskSystem";

const SECTION_LABELS = {
  feeling: "Feeling / Emotions",
  fronting: "Fronting",
  activity: "Activity",
  symptoms: "Symptoms / Habits",
  diary: "Diary",
  note: "Note",
  location: "Location",
};

function SymptomRow({ action, symptom, onAction }) {
  const [checked, setChecked] = useState(false);
  const [severity, setSeverity] = useState(null);
  const color = symptom.color || "#8B5CF6";
  const isRating = symptom.type === "rating";
  const LABELS = ["—", "0", "1", "2", "3", "4", "5"];

  const handleSeverity = (idx) => {
    if (idx === 0) { setSeverity(null); setChecked(false); return; }
    const val = idx - 1;
    setSeverity(val);
    setChecked(true);
  };

  const handleLog = () => {
    setChecked(true);
    onAction(action, { severity });
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-card rounded-xl border transition-all shadow-sm"
      style={{ borderColor: checked ? color : "hsl(var(--border))", backgroundColor: checked ? `${color}15` : "hsl(var(--card))" }}>
      <button onClick={() => setChecked(c => !c)}
        className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
        style={{ borderColor: checked ? color : "hsl(var(--border))", backgroundColor: checked ? color : "transparent" }}>
        {checked && <div className="w-2 h-2 rounded-sm bg-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{symptom.label}</p>
        {isRating && (
          <div className="flex gap-1 mt-1">
            {LABELS.map((lbl, idx) => {
              const sel = idx === 0 ? severity === null : severity === idx - 1;
              return (
                <button key={idx} onClick={() => handleSeverity(idx)}
                  className="w-6 h-6 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: sel ? (idx === 0 ? `${color}30` : color) : "hsl(var(--muted))",
                    color: sel ? (idx === 0 ? color : "#fff") : "hsl(var(--muted-foreground))"
                  }}>
                  {lbl}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button onClick={handleLog}
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all border"
        style={{ borderColor: color, backgroundColor: "transparent", color }}
        title="Log">
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

function ActivityRow({ action, category, onAction }) {
  return (
    <button onClick={() => onAction(action)}
      className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-muted/50 border border-border/50 hover:border-primary/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm w-full">
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color || "#888" }} />
      <span>{category.name}</span>
    </button>
  );
}

function EmotionRow({ action, onAction }) {
  return (
    <button onClick={() => onAction(action)}
      className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-muted/50 border border-border/50 hover:border-primary/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm w-full">
      <span>😊</span>
      <span>{action.config?.emotion_label}</span>
    </button>
  );
}

function AlterRow({ action, alter, onAction }) {
  return (
    <button onClick={() => onAction(action)}
      className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-primary/5 border border-border/50 hover:border-primary/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm w-full">
      <RefreshCw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
      <span className="flex-1">{alter.name}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md">Set</span>
    </button>
  );
}

function AddToFrontRow({ action, alter, onAction }) {
  return (
    <button onClick={() => onAction(action)}
      className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-green-500/5 border border-border/50 hover:border-green-500/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm w-full">
      <UserPlus className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
      <span className="flex-1">{alter.name}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600/80 bg-green-500/10 px-1.5 py-0.5 rounded-md">Add</span>
    </button>
  );
}

function DiaryFieldRow({ action, onAction }) {
  const { field_label, field_type, field_max, field_data_key } = action.config || {};
  const [value, setValue] = useState(field_type === "rating" ? null : field_type === "boolean" ? false : 0);

  if (!field_data_key) return null;

  return (
    <div className="px-4 py-3 bg-card border border-border/50 rounded-2xl shadow-sm">
      {field_type === "rating" && (
        <RatingRow
          label={field_label}
          max={field_max ?? 5}
          value={value}
          onChange={v => { setValue(v); onAction(action, { value: v }); }}
        />
      )}
      {field_type === "boolean" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{field_label}</span>
          <div className="flex items-center gap-2">
            <Switch checked={!!value} onCheckedChange={v => setValue(v)} />
            <button onClick={() => onAction(action, { value })}
              className="px-3 h-7 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              Log
            </button>
          </div>
        </div>
      )}
      {field_type === "number" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{field_label}</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={value}
              onChange={e => setValue(e.target.value === "" ? 0 : Number(e.target.value))}
              className="w-20 h-8 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={() => onAction(action, { value })}
              className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavRow({ action, onAction }) {
  const label = action.type === "open_set_front" ? "Set Fronters" : (SECTION_LABELS[action.config?.section] || action.label || "Open");
  const emoji = action.type === "open_set_front" ? "🔄" : "📍";
  return (
    <button onClick={() => onAction(action)}
      className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-muted/50 border border-border/50 hover:border-primary/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm w-full">
      <span>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

function LocationRow({ action, onAction }) {
  const defaultCat = action.config?.default_category || "";
  const [category, setCategory] = useState(defaultCat);
  const [name, setName] = useState("");
  const [coords, setCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const handleGPS = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsLoading(false); },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  };

  const catMeta = LOCATION_CATEGORIES.find(c => c.id === category);

  return (
    <div className="px-4 py-3 bg-card border border-border/50 rounded-2xl shadow-sm space-y-2.5">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium flex-1 text-foreground">Log Location</span>
        <button onClick={handleGPS} disabled={gpsLoading}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors flex items-center gap-1 ${coords ? "border-green-500/50 text-green-600 bg-green-500/10" : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>
          {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "📍"}
          {coords ? "GPS ✓" : "GPS"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {LOCATION_CATEGORIES.map(cat => (
          <button key={cat.id} type="button" onClick={() => setCategory(cat.id === category ? "" : cat.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${category === cat.id ? "text-white border-transparent" : "border-border/50 text-muted-foreground hover:border-primary/40"}`}
            style={category === cat.id ? { backgroundColor: cat.color } : {}}>
            <span>{cat.emoji}</span> {cat.label}
          </button>
        ))}
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={catMeta ? `${catMeta.label} name (optional)` : "Location name (optional)"}
        className="w-full h-8 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      <button onClick={() => onAction(action, { category: category || "other", name, coords })}
        className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
        Log Location
      </button>
    </div>
  );
}

function DailyTaskRow({ action }) {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const { task_id } = action.config || {};
  const TODAY = getTodayString();

  const { data: templates = [] } = useQuery({
    queryKey: ["dailyTaskTemplates"],
    queryFn: () => base44.entities.DailyTaskTemplate.list("sort_order", 200),
  });
  const { data: allProgress = [] } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => base44.entities.DailyProgress.list("-date", 1000),
  });

  const template = templates.find(t => t.id === task_id);
  const currentRecord = allProgress.find(p =>
    (p.frequency === "daily" || !p.frequency) &&
    (p.period_key === TODAY || p.date === TODAY)
  );
  const completedIds = new Set(currentRecord?.completed_task_ids || []);
  const isCompleted = completedIds.has(task_id);

  const handleToggle = async () => {
    if (!template || template.mode !== "MANUAL") return;
    const nowCompleted = !isCompleted;
    const newCompleted = new Set(completedIds);
    nowCompleted ? newCompleted.add(task_id) : newCompleted.delete(task_id);
    const currentXP = currentRecord?.xp_earned || 0;
    const newXP = nowCompleted
      ? currentXP + (template.points || 0)
      : Math.max(0, currentXP - (template.points || 0));

    // Optimistic update
    queryClient.setQueryData(["dailyProgress"], old =>
      Array.isArray(old)
        ? currentRecord
          ? old.map(p => p.id === currentRecord.id ? { ...p, completed_task_ids: [...newCompleted], xp_earned: newXP } : p)
          : [...old, { id: "__optimistic__", date: TODAY, period_key: TODAY, frequency: "daily", completed_task_ids: [...newCompleted], xp_earned: newXP }]
        : old
    );

    if (currentRecord) {
      await base44.entities.DailyProgress.update(currentRecord.id, { completed_task_ids: [...newCompleted], xp_earned: newXP });
    } else {
      await base44.entities.DailyProgress.create({ date: TODAY, period_key: TODAY, frequency: "daily", completed_task_ids: [...newCompleted], xp_earned: newXP });
    }
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
    if (nowCompleted && template.points > 0) toast.success(`+${template.points} XP — ${applyTerms(template.title, terms)} done! 🎉`);
  };

  if (!template) return null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 bg-card border rounded-2xl shadow-sm transition-all ${isCompleted ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {applyTerms(template.title, terms)}
        </p>
        {template.points > 0 && (
          <p className="text-xs text-muted-foreground">+{template.points} XP</p>
        )}
      </div>
      <button
        onClick={handleToggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-all ${
          isCompleted
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border/60 text-muted-foreground hover:border-primary/60 hover:text-primary"
        }`}>
        {isCompleted && <Check className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function QuickActionsMenu({ actions = [], onAction, onClose }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);

  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list() });
  const { data: activityCategories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });

  useEffect(() => {
    let handler = null;
    const tid = setTimeout(() => {
      handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
      document.addEventListener("pointerdown", handler);
    }, 200);
    return () => { clearTimeout(tid); if (handler) document.removeEventListener("pointerdown", handler); };
  }, [onClose]);

  const handleAdd = () => {
    onClose();
    navigate("/Settings");
    setTimeout(() => {
      const el = document.getElementById("checkin");
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); if (el.querySelector(".space-y-6") === null) el.querySelector("button")?.click(); }
    }, 400);
  };

  const renderAction = action => {
    switch (action.type) {
      case "log_symptom": {
        const symptom = symptoms.find(s => s.id === action.config?.symptom_id);
        if (!symptom) return null;
        return <SymptomRow key={action.id} action={action} symptom={symptom} onAction={onAction} />;
      }
      case "log_activity": {
        const cat = activityCategories.find(c => c.id === action.config?.category_id);
        if (!cat) return null;
        return <ActivityRow key={action.id} action={action} category={cat} onAction={onAction} />;
      }
      case "log_emotion": {
        if (!action.config?.emotion_label) return null;
        return <EmotionRow key={action.id} action={action} onAction={onAction} />;
      }
      case "set_front_alter": {
        const alter = alters.find(a => a.id === action.config?.alter_id);
        if (!alter) return null;
        return <AlterRow key={action.id} action={action} alter={alter} onAction={onAction} />;
      }
      case "add_to_front_alter": {
        const alter = alters.find(a => a.id === action.config?.alter_id);
        if (!alter) return null;
        return <AddToFrontRow key={action.id} action={action} alter={alter} onAction={onAction} />;
      }
      case "toggle_daily_task":
        return <DailyTaskRow key={action.id} action={action} />;
      case "log_diary":
        return <DiaryFieldRow key={action.id} action={action} onAction={onAction} />;
      case "log_location":
        return <LocationRow key={action.id} action={action} onAction={onAction} />;
      case "open_checkin_section":
      case "open_set_front":
        return <NavRow key={action.id} action={action} onAction={onAction} />;
      default:
        return null;
    }
  };

  return (
    <motion.div ref={menuRef} data-tour="quick-actions-menu"
      initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }} transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute left-0 top-full mt-2 z-50 flex flex-col gap-1.5 min-w-[240px] max-w-xs bg-background/95 backdrop-blur-sm rounded-2xl p-2 border border-border/50 shadow-xl">
      {actions.length === 0 && (
        <div className="px-4 py-3 bg-card border border-border/50 rounded-2xl text-sm text-muted-foreground shadow-lg">
          No quick actions yet. Add one below!
        </div>
      )}
      {actions.map(renderAction)}
      <button onClick={handleAdd}
        className="flex items-center gap-2.5 px-4 py-3 bg-muted/20 hover:bg-muted/40 border border-dashed border-border/60 hover:border-primary/40 rounded-2xl text-sm font-medium text-muted-foreground transition-all text-left">
        <span className="text-base leading-none">＋</span>
        <span>Add quick action…</span>
      </button>
    </motion.div>
  );
}
