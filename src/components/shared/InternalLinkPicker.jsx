import React, { useState, useEffect, useMemo } from "react";
import { X, Link, User, BookOpen, FolderOpen, Heart, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { format } from "date-fns";

const db = isLocalMode() ? localEntities : base44.entities;

const TYPE_META = {
  alter:   { label: "Alter",         icon: <User className="w-3.5 h-3.5" />,       color: "text-violet-500" },
  journal: { label: "Journal Entry", icon: <BookOpen className="w-3.5 h-3.5" />,   color: "text-blue-500" },
  folder:  { label: "Journal Folder",icon: <FolderOpen className="w-3.5 h-3.5" />, color: "text-amber-500" },
  checkin: { label: "Check-in",      icon: <Heart className="w-3.5 h-3.5" />,      color: "text-rose-500" },
  location:{ label: "Location",      icon: <MapPin className="w-3.5 h-3.5" />,     color: "text-green-500" },
};

function buildRoute(item) {
  switch (item.type) {
    case "alter":    return `/alter/${item.id}`;
    case "journal":  return `/journals?id=${item.id}`;
    case "folder":   return `/journals?folder=${encodeURIComponent(item.id)}`; // id = folder path string
    case "checkin":  return `/checkin-log?id=${item.id}`;
    case "location": return `/system-map?location=${item.id}`;
    default:         return "/";
  }
}

const TYPE_EMOJI = {
  alter: "👤",
  journal: "📓",
  folder: "📁",
  checkin: "💙",
  location: "🗺️",
};

export function buildInternalLinkHTML(item) {
  const route = buildRoute(item);
  const emoji = TYPE_EMOJI[item.type] || "🔗";
  const display = `${emoji} ${item.name}`;
  return `<a data-internal-link="${route}" style="color:hsl(var(--primary));text-decoration:underline;cursor:pointer;">${display}</a>`;
}

export default function InternalLinkPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [alters, journals, checkIns, locations] = await Promise.all([
        db.Alter.list().catch(() => []),
        db.JournalEntry.list().catch(() => []),
        db.EmotionCheckIn.list().catch(() => []),
        db.InnerWorldLocation.list().catch(() => []),
      ]);

      // Journal folders from localStorage
      let folders = [];
      try {
        const raw = localStorage.getItem("os_journal_folders");
        if (raw) folders = JSON.parse(raw);
        if (!Array.isArray(folders)) folders = [];
      } catch {}

      if (cancelled) return;

      const items = [
        ...alters.filter(a => !a.is_archived).map(a => ({
          type: "alter", id: a.id,
          name: a.name + (a.alias ? ` (${a.alias})` : ""),
          search: `${a.name} ${a.alias || ""}`.toLowerCase(),
        })),
        ...journals.map(j => ({
          type: "journal", id: j.id,
          name: j.title || "Untitled",
          search: (j.title || "").toLowerCase(),
        })),
        ...folders.map(f => ({
          type: "folder", id: f,
          name: f,
          search: f.toLowerCase(),
        })),
        ...checkIns.map(c => {
          const dateStr = c.timestamp ? format(new Date(c.timestamp), "MMM d, yyyy") : "";
          const emotionsStr = (c.emotions || []).slice(0, 3).join(", ");
          const label = `Check-in: ${dateStr}${emotionsStr ? " · " + emotionsStr : ""}`;
          return {
            type: "checkin", id: c.id,
            name: label,
            search: `${dateStr} ${emotionsStr} ${c.note || ""}`.toLowerCase(),
          };
        }),
        ...locations.map(l => ({
          type: "location", id: l.id,
          name: l.name || "Unnamed location",
          search: (l.name || "").toLowerCase(),
        })),
      ];

      setAllItems(items);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(item => item.search.includes(q));
  }, [allItems, query]);

  // Group by type in a stable order
  const grouped = useMemo(() => {
    const order = ["alter", "journal", "folder", "checkin", "location"];
    const groups = {};
    filtered.forEach(item => {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    });
    return order.filter(t => groups[t]?.length).map(t => ({ type: t, items: groups[t] }));
  }, [filtered]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-background border-2 border-border rounded-2xl w-full max-w-md mx-0 sm:mx-4 shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link className="w-4 h-4 text-primary" /> Insert link
          </div>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border/30 flex-shrink-0">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search alters, journals, locations…"
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No results found</p>
          ) : (
            grouped.map(({ type, items }) => {
              const meta = TYPE_META[type];
              return (
                <div key={type}>
                  <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20 flex items-center gap-1.5">
                    <span className={meta.color}>{meta.icon}</span>
                    {meta.label}
                  </div>
                  {items.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { onSelect(buildInternalLinkHTML(item)); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left">
                      <span className={`flex-shrink-0 ${meta.color}`}>{meta.icon}</span>
                      <span className="flex-1 text-sm text-foreground truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0 bg-muted/60 px-1.5 py-0.5 rounded-full">{meta.label}</span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}