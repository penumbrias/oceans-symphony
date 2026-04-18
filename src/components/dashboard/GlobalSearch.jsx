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
  symptom: "Symptoms",
  group: "Groups",
  diarycard: "Diary Cards",
  checkin: "Check-Ins",
};

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
      if (
        [a.name, a.alias, a.pronouns, a.role, a.bio]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      ) {
        results.push({
          type: "alter",
          id: a.id,
          title: a.name,
          subtitle: a.role || a.pronouns,
          color: a.color,
          path: `/alter/${a.id}`,
        });
      }
    });

    // Journals
    journals.forEach((j) => {
      if (
        [j.title, j.content]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      ) {
        results.push({
          type: "journal",
          id: j.id,
          title: j.title || "Journal Entry",
          subtitle: j.content?.slice(0, 60),
          path: `/journals?id=${j.id}`,
        });
      }
    });

    // Bulletins
    bulletins.forEach((b) => {
      if (b.content?.toLowerCase().includes(q)) {
        results.push({
          type: "bulletin",
          id: b.id,
          title: "Bulletin",
          subtitle: b.content?.slice(0, 60),
          path: `/?bulletinId=${b.id}`,
        });
      }
    });

    // Activities
    activities.forEach((a) => {
      if (
        [a.activity_name, a.notes]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      ) {
        results.push({
          type: "activity",
          id: a.id,
          title: a.activity_name,
          subtitle: a.notes?.slice(0, 60),
          path: `/activities?date=${a.timestamp ? new Date(a.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}&highlight=${a.id}`,
        });
      }
    });

    // Tasks
    tasks.forEach((t) => {
      if (
        [t.title, t.notes]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      ) {
        results.push({
          type: "task",
          id: t.id,
          title: t.title,
          subtitle: t.notes?.slice(0, 60),
          path: `/tasks?id=${t.id}`,
        });
      }
    });

    // Emotion check-ins
    emotionCheckIns.forEach((e) => {
      if (
        e.note?.toLowerCase().includes(q) ||
        e.emotions?.some((em) => em.toLowerCase().includes(q))
      ) {
        results.push({
          type: "emotion",
          id: e.id,
          title: "Emotion Check-In",
          subtitle: e.note || e.emotions?.join(", "),
          path: `/timeline?date=${new Date(e.timestamp).toISOString().split('T')[0]}`,
        });
      }
    });

    // Symptoms
    symptoms.forEach((s) => {
      if (s.label?.toLowerCase().includes(q)) {
        results.push({
          type: "symptom",
          id: s.id,
          title: s.label,
          subtitle: "Symptom",
          path: `/diary`,
        });
      }
    });

    // Groups
    groups.forEach((g) => {
      if (
        [g.name, g.description]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      ) {
        results.push({
          type: "group",
          id: g.id,
          title: g.name,
          subtitle: g.description?.slice(0, 60),
          path: `/groups`,
        });
      }
    });

    // Diary cards
    diaryCalls.forEach((d) => {
      const allText = [
        d.name,
        d.notes?.what,
        d.notes?.judgments,
        d.notes?.optional,
      ]
        .filter(Boolean)
        .join(" ");
      if (allText.toLowerCase().includes(q)) {
        results.push({
          type: "diarycard",
          id: d.id,
          title: d.name || `Diary Card - ${d.date}`,
          subtitle: d.notes?.what?.slice(0, 60),
          path: `/diary?id=${d.id}`,
        });
      }
    });

    // System check-ins
    systemCheckIns.forEach((c) => {
      if ([c.notes, c.content].filter(Boolean).some((f) => f.toLowerCase().includes(q))) {
        results.push({
          type: "checkin",
          id: c.id,
          title: "System Check-In",
          subtitle: c.notes?.slice(0, 60) || c.content?.slice(0, 60),
          path: `/system-checkin?id=${c.id}`,
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
          {["alter", "journal", "bulletin", "activity", "task", "emotion", "symptom", "group", "diarycard", "checkin"].map(
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