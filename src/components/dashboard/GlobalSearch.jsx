import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

const TYPE_ICONS = {
  alter:       "👤",
  journal:     "📓",
  bulletin:    "📌",
  activity:    "⚡",
  task:        "☑️",
  emotion:     "💜",
  status:      "💬",
  symptom:     "💊",
  group:       "👥",
  diarycard:   "📖",
  checkin:     "✨",
  location:    "📍",
  syschange:   "🔀",
};

const TYPE_LABELS = {
  alter:       "Alters",
  journal:     "Journals",
  bulletin:    "Bulletins",
  activity:    "Activities",
  task:        "Tasks",
  emotion:     "Emotions",
  status:      "Custom Statuses",
  symptom:     "Symptoms",
  group:       "Groups",
  diarycard:   "Diary Cards",
  checkin:     "System Check-Ins",
  location:    "Locations",
  syschange:   "System History",
};

const SYS_CHANGE_TYPE_LABELS = {
  fusion:    "Fusion",
  split:     "Split",
  dormancy:  "Dormancy",
  return:    "Return",
  emergence: "Emergence",
};

function getDateFormats(dateInput) {
  if (!dateInput) return [];
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return [];
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monthShort = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return [
    `${year}-${pad(month + 1)}-${pad(day)}`,
    `${pad(month + 1)}/${pad(day)}/${year}`,
    `${monthNames[month]} ${day} ${year}`,
    `${monthShort[month]} ${day} ${year}`,
    `${monthShort[month]} ${day}`,
    `${monthNames[month]} ${day}`,
    `${day}th`, `${day}st`, `${day}nd`, `${day}rd`,
    `${dayNames[d.getDay()]} ${monthNames[month]} ${day}`,
    `${dayNames[d.getDay()]} ${monthShort[month]} ${day}`,
    monthNames[month],
    monthShort[month],
    `${year}-${pad(month + 1)}`,
    `${pad(month + 1)}/${year}`,
    String(year),
  ];
}

function matchesDate(dateInput, q) {
  return getDateFormats(dateInput).some((f) => f.includes(q));
}

function formatDateLabel(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function isoDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function highlightMatch(text, query) {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const containerRef = useRef(null);

  const enabled = searchFocused;
  const stale = 5 * 60 * 1000;

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => db.Alter.list(),
  });

  const { data: journals = [] } = useQuery({
    queryKey: ["searchJournals"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: bulletins = [] } = useQuery({
    queryKey: ["searchBulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["searchActivities"],
    queryFn: () => base44.entities.Activity.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["searchTasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["searchEmotions"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["searchSymptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    staleTime: stale, enabled,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["searchGroups"],
    queryFn: () => base44.entities.Group.list(),
    staleTime: stale, enabled,
  });

  const { data: diaryCards = [] } = useQuery({
    queryKey: ["searchDiaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["searchSystemCheckIns"],
    queryFn: () => base44.entities.SystemCheckIn.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  const { data: bulletinComments = [] } = useQuery({
    queryKey: ["searchBulletinComments"],
    queryFn: () => base44.entities.BulletinComment.list("-created_date", 200),
    staleTime: stale, enabled,
  });

  // Local entities
  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
    staleTime: stale, enabled,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
    staleTime: stale, enabled,
  });

  const { data: systemChangeEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
    staleTime: stale, enabled,
  });

  const searchResults = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = [];

    // Alters — use description not bio
    alters.forEach((a) => {
      const textMatch = [a.name, a.alias, a.pronouns, a.role, a.description].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(a.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "alter", id: a.id, title: a.name,
          subtitle: dateMatch ? `📅 ${formatDateLabel(a.created_date)}` : (a.role || a.pronouns),
          color: a.color, path: `/alter/${a.id}`, dateMatch,
        });
      }
    });

    // Journals
    journals.forEach((j) => {
      const textMatch = [j.title, j.content].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(j.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "journal", id: j.id, title: j.title || "Journal Entry",
          subtitle: dateMatch ? `📅 ${formatDateLabel(j.created_date)}` : j.content?.slice(0, 80),
          path: `/journals?id=${j.id}`, dateMatch,
        });
      }
    });

    // Bulletins
    bulletins.forEach((b) => {
      const textMatch = b.content?.toLowerCase().includes(q);
      const dateMatch = !textMatch && matchesDate(b.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "bulletin", id: b.id, title: "Bulletin",
          subtitle: dateMatch ? `📅 ${formatDateLabel(b.created_date)}` : b.content?.slice(0, 80),
          path: `/bulletin/${b.id}`, dateMatch,
        });
      }
    });

    // Bulletin comments
    bulletinComments.forEach((c) => {
      const textMatch = c.content?.toLowerCase().includes(q);
      const dateMatch = !textMatch && matchesDate(c.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "bulletin", id: c.id, title: "Bulletin Comment",
          subtitle: dateMatch ? `📅 ${formatDateLabel(c.created_date)}` : c.content?.slice(0, 80),
          path: `/bulletin/${c.bulletin_id}?commentId=${c.id}`, dateMatch,
        });
      }
    });

    // Activities
    activities.forEach((a) => {
      const textMatch = [a.activity_name, a.notes].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(a.timestamp, q);
      if (textMatch || dateMatch) {
        const dateStr = isoDate(a.timestamp) || isoDate(new Date());
        results.push({
          type: "activity", id: a.id, title: a.activity_name,
          subtitle: dateMatch ? `📅 ${formatDateLabel(a.timestamp)}` : a.notes?.slice(0, 80),
          path: `/activities?date=${dateStr}&highlight=${a.id}`, dateMatch,
        });
      }
    });

    // Tasks
    tasks.forEach((t) => {
      const textMatch = [t.title, t.notes].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(t.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "task", id: t.id, title: t.title,
          subtitle: dateMatch ? `📅 ${formatDateLabel(t.created_date)}` : t.notes?.slice(0, 80),
          path: `/tasks?id=${t.id}`, dateMatch,
        });
      }
    });

    // Custom Status Notes (localEntities.StatusNote)
    statusNotes.forEach((s) => {
      const textMatch = s.note?.toLowerCase().includes(q);
      const dateMatch = !textMatch && matchesDate(s.timestamp, q);
      if (textMatch || dateMatch) {
        const dateStr = isoDate(s.timestamp);
        results.push({
          type: "status", id: s.id,
          title: s.note?.length > 80 ? s.note.slice(0, 80) + "…" : s.note,
          subtitle: `📅 ${formatDateLabel(s.timestamp)}`,
          path: dateStr ? `/timeline?date=${dateStr}` : `/timeline`,
          dateMatch,
        });
      }
    });

    // Emotion check-ins (with notes = legacy status-style; without = plain emotion)
    emotionCheckIns.forEach((e) => {
      const dateStr = isoDate(e.timestamp);
      if (!dateStr) return;
      const hasNote = !!(e.note?.trim());
      const noteMatch = hasNote && e.note.toLowerCase().includes(q);
      const emotionMatch = e.emotions?.some((em) => em.toLowerCase().includes(q));
      const dateMatch = !noteMatch && !emotionMatch && matchesDate(e.timestamp, q);

      if (hasNote && (noteMatch || dateMatch)) {
        results.push({
          type: "status", id: `ec-${e.id}`,
          title: e.note.length > 80 ? e.note.slice(0, 80) + "…" : e.note,
          subtitle: dateMatch ? `📅 ${formatDateLabel(e.timestamp)}` : `${formatDateLabel(e.timestamp)}${e.emotions?.length ? " · " + e.emotions.join(", ") : ""}`,
          path: `/timeline?date=${dateStr}&highlightStatus=${e.id}`,
          dateMatch,
        });
      } else if (!hasNote && (emotionMatch || dateMatch)) {
        results.push({
          type: "emotion", id: e.id, title: "Emotion Check-In",
          subtitle: dateMatch ? `📅 ${formatDateLabel(e.timestamp)}` : e.emotions?.join(", "),
          path: `/timeline?date=${dateStr}`,
          dateMatch,
        });
      }
    });

    // Symptoms
    symptoms.forEach((s) => {
      if ([s.label, s.description].filter(Boolean).some((f) => f.toLowerCase().includes(q))) {
        results.push({ type: "symptom", id: s.id, title: s.label, subtitle: s.description?.slice(0, 80) || "Symptom", path: `/diary` });
      }
    });

    // Groups
    groups.forEach((g) => {
      if ([g.name, g.description].filter(Boolean).some((f) => f.toLowerCase().includes(q))) {
        results.push({ type: "group", id: g.id, title: g.name, subtitle: g.description?.slice(0, 80), path: `/groups` });
      }
    });

    // Diary cards
    diaryCards.forEach((d) => {
      const allText = [d.name, d.notes?.what, d.notes?.judgments, d.notes?.optional].filter(Boolean).join(" ");
      const textMatch = allText.toLowerCase().includes(q);
      const dateMatch = !textMatch && (matchesDate(d.date, q) || matchesDate(d.created_date, q));
      if (textMatch || dateMatch) {
        results.push({
          type: "diarycard", id: d.id, title: d.name || `Diary Card — ${d.date}`,
          subtitle: dateMatch ? `📅 ${formatDateLabel(d.date || d.created_date)}` : d.notes?.what?.slice(0, 80),
          path: `/diary?id=${d.id}`, dateMatch,
        });
      }
    });

    // System check-ins
    systemCheckIns.forEach((c) => {
      const textMatch = [c.notes, c.content].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(c.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "checkin", id: c.id, title: "System Meeting",
          subtitle: dateMatch ? `📅 ${formatDateLabel(c.created_date)}` : (c.notes?.slice(0, 80) || c.content?.slice(0, 80)),
          path: `/system-checkin?id=${c.id}`, dateMatch,
        });
      }
    });

    // Location records
    locations.forEach((l) => {
      const textMatch = [l.name, l.notes, l.category].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(l.timestamp, q);
      if (textMatch || dateMatch) {
        const dateStr = isoDate(l.timestamp);
        results.push({
          type: "location", id: l.id, title: l.name || "Location",
          subtitle: dateMatch ? `📅 ${formatDateLabel(l.timestamp)}` : [l.category, l.notes].filter(Boolean).join(" · ").slice(0, 80),
          path: dateStr ? `/location-history` : `/location-history`,
          dateMatch,
        });
      }
    });

    // System change events (fusions, splits, emergences, dormancy, returns)
    systemChangeEvents.forEach((e) => {
      const typeLabel = SYS_CHANGE_TYPE_LABELS[e.type] || e.type;
      const textMatch = [e.cause, e.notes, typeLabel].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(e.date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "syschange", id: e.id,
          title: typeLabel + (e.fusion_type === "absorption" ? " · Absorption" : e.fusion_type === "new_formation" ? " · New Formation" : ""),
          subtitle: dateMatch ? `📅 ${formatDateLabel(e.date)}` : (e.cause || e.notes)?.slice(0, 80),
          path: `/system-history`,
          dateMatch,
        });
      }
    });

    return results.slice(0, 40);
  }, [
    query, alters, journals, bulletins, bulletinComments, activities, tasks,
    emotionCheckIns, symptoms, groups, diaryCards, systemCheckIns,
    statusNotes, locations, systemChangeEvents,
  ]);

  const groupedResults = useMemo(() => {
    const grouped = {};
    searchResults.forEach((r) => {
      if (!grouped[r.type]) grouped[r.type] = [];
      grouped[r.type].push(r);
    });
    return grouped;
  }, [searchResults]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") { setQuery(""); setSearchFocused(false); }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setSearchFocused(false);
    };
    if (searchFocused) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [searchFocused]);

  const handleResultClick = (path) => {
    navigate(path);
    setQuery("");
    setSearchFocused(false);
  };

  const TYPE_ORDER = ["alter", "journal", "status", "emotion", "bulletin", "activity", "task", "checkin", "diarycard", "location", "syschange", "symptom", "group"];

  return (
    <div className="relative flex-1" ref={containerRef}>
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search everything..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setSearchFocused(true)}
        className="pl-9 pr-9"
      />
      {query && (
        <button onClick={() => { setQuery(""); setSearchFocused(false); }}
          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}

      {searchFocused && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-[60vh] overflow-y-auto">
          {query.length < 2 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Type at least 2 characters to search</p>
          )}
          {searchResults.length === 0 && query.length >= 2 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No results for "{query}"</p>
          )}

          {TYPE_ORDER.map((type) => {
            const typeResults = groupedResults[type];
            if (!typeResults?.length) return null;
            return (
              <div key={type}>
                <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {TYPE_ICONS[type]} {TYPE_LABELS[type]}
                </p>
                {typeResults.map((result) => (
                  <button key={result.id} onClick={() => handleResultClick(result.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left">
                    {result.type === "alter" ? (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                        style={{ backgroundColor: result.color || "#8b5cf6" }}>
                        {result.title?.charAt(0)?.toUpperCase()}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-sm">
                        {TYPE_ICONS[result.type]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">
                          {highlightMatch(result.subtitle, query)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
