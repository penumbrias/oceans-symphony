import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { debounce } from "lodash";

const TYPE_ICONS = {
  alter: "👤",
  journal: "📓",
  bulletin: "📌",
  activity: "⚡",
  task: "☑️",
  emotion: "💜",
  status: "💬",
  symptom: "💊",
  group: "👥",
  diarycard: "📖",
  checkin: "✨",
};

const TYPE_LABELS = {
  alter: "Alters",
  journal: "Journals",
  bulletin: "Bulletins",
  activity: "Activities",
  task: "Tasks",
  emotion: "Emotions",
  status: "Custom Statuses",
  symptom: "Symptoms",
  group: "Groups",
  diarycard: "Diary Cards",
  checkin: "Check-Ins",
};

// Returns multiple string formats of a date for flexible matching
function getDateFormats(dateInput) {
  if (!dateInput) return [];
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return [];
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const day = d.getDate();
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monthShort = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const monthName = monthNames[month];
  const monthAbbr = monthShort[month];
  const dayName = dayNames[d.getDay()];
  return [
    `${year}-${pad(month + 1)}-${pad(day)}`,               // 2026-04-14
    `${pad(month + 1)}/${pad(day)}/${year}`,                // 04/14/2026
    `${monthName} ${day} ${year}`,                          // april 14 2026
    `${monthAbbr} ${day} ${year}`,                          // apr 14 2026
    `${monthAbbr} ${day}`,                                  // apr 14
    `${monthName} ${day}`,                                  // april 14
    `${day}th`, `${day}st`, `${day}nd`, `${day}rd`,        // 14th etc.
    `${dayName} ${monthName} ${day}`,                       // monday april 14
    `${dayName} ${monthAbbr} ${day}`,                       // monday apr 14
    monthName,                                              // april
    monthAbbr,                                              // apr
    `${year}-${pad(month + 1)}`,                            // 2026-04
    `${pad(month + 1)}/${year}`,                            // 04/2026
    String(year),                                           // 2026
  ];
}

function matchesDate(dateInput, q) {
  const formats = getDateFormats(dateInput);
  return formats.some((f) => f.includes(q));
}

function formatDateLabel(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
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

  // Load all searchable data - only fetch when search is focused to avoid unnecessary requests
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: journals = [] } = useQuery({
    queryKey: ["searchJournals"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: bulletins = [] } = useQuery({
    queryKey: ["searchBulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["searchActivities"],
    queryFn: () => base44.entities.Activity.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["searchTasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["searchEmotions"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["searchSymptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["searchGroups"],
    queryFn: () => base44.entities.Group.list(),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: diaryCalls = [] } = useQuery({
    queryKey: ["searchDiaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["searchSystemCheckIns"],
    queryFn: () => base44.entities.SystemCheckIn.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: searchFocused,
  });

  // Perform search
  const searchResults = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = [];

    // Alters
    alters.forEach((a) => {
      const textMatch = [a.name, a.alias, a.pronouns, a.role, a.bio].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(a.created_date, q);
      if (textMatch || dateMatch) {
        results.push({
          type: "alter", id: a.id, title: a.name,
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(a.created_date)}` : (a.role || a.pronouns),
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
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(j.created_date)}` : j.content?.slice(0, 60),
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
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(b.created_date)}` : b.content?.slice(0, 60),
          path: `/?bulletinId=${b.id}`, dateMatch,
        });
      }
    });

    // Activities
    activities.forEach((a) => {
      const textMatch = [a.activity_name, a.notes].filter(Boolean).some((f) => f.toLowerCase().includes(q));
      const dateMatch = !textMatch && matchesDate(a.timestamp, q);
      if (textMatch || dateMatch) {
        const dateStr = a.timestamp ? new Date(a.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        results.push({
          type: "activity", id: a.id, title: a.activity_name,
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(a.timestamp)}` : a.notes?.slice(0, 60),
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
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(t.created_date)}` : t.notes?.slice(0, 60),
          path: `/tasks?id=${t.id}`, dateMatch,
        });
      }
    });

    // Emotion check-ins — split into "status" (has note) and "emotion" (no note)
    emotionCheckIns.forEach((e) => {
      const dateStr = e.timestamp ? new Date(e.timestamp).toISOString().split('T')[0] : null;
      if (!dateStr) return;
      const hasNote = !!(e.note && e.note.trim());
      const noteMatch = hasNote && e.note.toLowerCase().includes(q);
      const emotionMatch = e.emotions?.some((em) => em.toLowerCase().includes(q));
      const dateMatch = !noteMatch && !emotionMatch && matchesDate(e.timestamp, q);

      if (hasNote && (noteMatch || dateMatch)) {
        // Status note result
        results.push({
          type: "status", id: e.id,
          title: e.note.length > 60 ? e.note.slice(0, 60) + "…" : e.note,
          subtitle: dateMatch
            ? `📅 Matched date: ${formatDateLabel(e.timestamp)}`
            : `${formatDateLabel(e.timestamp)}${e.emotions?.length ? " · " + e.emotions.join(", ") : ""}`,
          path: `/timeline?date=${dateStr}&highlightStatus=${e.id}`,
          dateMatch,
        });
      } else if (!hasNote && (emotionMatch || dateMatch)) {
        // Plain emotion check-in result
        results.push({
          type: "emotion", id: e.id, title: "Emotion Check-In",
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(e.timestamp)}` : e.emotions?.join(", "),
          path: `/timeline?date=${dateStr}`,
          dateMatch,
        });
      }
    });

    // Symptoms (no date fields that are meaningful to search)
    symptoms.forEach((s) => {
      if (s.label?.toLowerCase().includes(q)) {
        results.push({ type: "symptom", id: s.id, title: s.label, subtitle: "Symptom", path: `/diary` });
      }
    });

    // Groups (no date fields that are meaningful to search)
    groups.forEach((g) => {
      if ([g.name, g.description].filter(Boolean).some((f) => f.toLowerCase().includes(q))) {
        results.push({ type: "group", id: g.id, title: g.name, subtitle: g.description?.slice(0, 60), path: `/groups` });
      }
    });

    // Diary cards
    diaryCalls.forEach((d) => {
      const allText = [d.name, d.notes?.what, d.notes?.judgments, d.notes?.optional].filter(Boolean).join(" ");
      const textMatch = allText.toLowerCase().includes(q);
      const dateMatch = !textMatch && (matchesDate(d.date, q) || matchesDate(d.created_date, q));
      if (textMatch || dateMatch) {
        const matchedDate = d.date || d.created_date;
        results.push({
          type: "diarycard", id: d.id, title: d.name || `Diary Card - ${d.date}`,
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(matchedDate)}` : d.notes?.what?.slice(0, 60),
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
          type: "checkin", id: c.id, title: "System Check-In",
          subtitle: dateMatch ? `📅 Matched date: ${formatDateLabel(c.created_date)}` : (c.notes?.slice(0, 60) || c.content?.slice(0, 60)),
          path: `/system-checkin?id=${c.id}`, dateMatch,
        });
      }
    });

    return results.slice(0, 30);
  }, [
    query,
    alters,
    journals,
    bulletins,
    activities,
    tasks,
    emotionCheckIns,
    symptoms,
    groups,
    diaryCalls,
    systemCheckIns,
  ]);

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups = {};
    searchResults.forEach((result) => {
      if (!groups[result.type]) {
        groups[result.type] = [];
      }
      groups[result.type].push(result);
    });
    return groups;
  }, [searchResults]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setQuery("");
        setSearchFocused(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
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
        <button
          onClick={() => {
            setQuery("");
            setSearchFocused(false);
          }}
          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {searchFocused && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-[60vh] overflow-y-auto">
          {searchResults.length === 0 && query.length >= 2 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          )}

          {query.length < 2 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}

          {/* Results grouped by type */}
          {["alter", "journal", "bulletin", "activity", "task", "emotion", "status", "symptom", "group", "diarycard", "checkin"].map(
            (type) => {
              const typeResults = groupedResults[type];
              if (!typeResults || typeResults.length === 0) return null;

              return (
                <div key={type}>
                  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {TYPE_ICONS[type]} {TYPE_LABELS[type]}
                  </p>
                  {typeResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleResultClick(result.path)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      {result.type === "alter" ? (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                          style={{ backgroundColor: result.color || "#8b5cf6" }}
                        >
                          {result.title?.charAt(0)?.toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-sm">
                          {TYPE_ICONS[result.type]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {result.title}
                        </p>
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
            }
          )}
        </div>
      )}
    </div>
  );
}