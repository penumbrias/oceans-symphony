import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, MapPin, Loader2 } from "lucide-react";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";

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
  const color = symptom.color || "#8B5CF6";
  return (
    <div className="px-4 py-3 bg-card border border-border/50 rounded-2xl shadow-sm space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium flex-1 text-foreground">{symptom.label}</span>
        <button onClick={() => onAction(action, {})}
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all"
          style={{ borderColor: color, color }} title="Log without severity">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onAction(action, { severity: n })}
            className="flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors active:opacity-70"
            style={{ borderColor: `${color}60`, color, backgroundColor: "transparent" }}
            onPointerEnter={e => { e.currentTarget.style.backgroundColor = color; e.currentTarget.style.color = "#fff"; }}
            onPointerLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = color; }}>
            {n}
          </button>
        ))}
      </div>
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
      className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-muted/50 border border-border/50 hover:border-primary/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm w-full">
      <span>👤</span>
      <span>{alter.name}</span>
    </button>
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
      className="absolute left-0 top-full mt-2 z-50 flex flex-col gap-1.5 min-w-[240px] max-w-xs">
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
