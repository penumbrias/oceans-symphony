import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const SECTION_EMOJIS = {
  feeling: "😊",
  fronting: "👥",
  activity: "⚡",
  symptoms: "🩺",
  diary: "📖",
  note: "📝",
  location: "📍",
};

const TYPE_DEFAULT_EMOJIS = {
  open_checkin: "💜",
  open_checkin_section: "📍",
  set_front_alter: "👤",
  log_activity: "⚡",
  log_symptom: "🩺",
  open_set_front: "🔄",
};

export default function QuickActionsMenu({ actions = [], onAction, onClose }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    // Delay by 200ms so the pointerup from the long-press doesn't immediately close the menu
    let handler = null;
    const tid = setTimeout(() => {
      handler = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
      };
      document.addEventListener("pointerdown", handler);
    }, 200);
    return () => {
      clearTimeout(tid);
      if (handler) document.removeEventListener("pointerdown", handler);
    };
  }, [onClose]);

  const handleAdd = () => {
    onClose();
    navigate("/Settings");
    setTimeout(() => {
      const el = document.getElementById("checkin");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        const btn = el.querySelector("button");
        // Only open if currently closed
        if (btn && el.querySelector(".space-y-6") === null) btn.click();
      }
    }, 400);
  };

  return (
    <motion.div
      ref={menuRef}
      data-tour="quick-actions-menu"
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute left-0 top-full mt-2 z-50 flex flex-col gap-1.5 min-w-[220px] max-w-xs"
    >
      {actions.length === 0 && (
        <div className="px-4 py-3 bg-card border border-border/50 rounded-2xl text-sm text-muted-foreground shadow-lg">
          No quick actions yet. Add one below!
        </div>
      )}

      {actions.map((action) => {
        const emoji =
          action.emoji ||
          (action.type === "open_checkin_section" ? SECTION_EMOJIS[action.config?.section] : null) ||
          TYPE_DEFAULT_EMOJIS[action.type] ||
          "⚡";
        return (
          <button
            key={action.id}
            onClick={() => onAction(action)}
            className="flex items-center gap-2.5 px-4 py-3 bg-card hover:bg-muted/50 border border-border/50 hover:border-primary/40 rounded-2xl text-sm font-medium text-foreground transition-all text-left shadow-sm"
          >
            <span className="text-base leading-none">{emoji}</span>
            <span>{action.label}</span>
          </button>
        );
      })}

      <button
        onClick={handleAdd}
        className="flex items-center gap-2.5 px-4 py-3 bg-muted/20 hover:bg-muted/40 border border-dashed border-border/60 hover:border-primary/40 rounded-2xl text-sm font-medium text-muted-foreground transition-all text-left"
      >
        <span className="text-base leading-none">＋</span>
        <span>Add quick action…</span>
      </button>
    </motion.div>
  );
}
