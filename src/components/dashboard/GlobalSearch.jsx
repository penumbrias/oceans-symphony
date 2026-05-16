import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/lib/useTerms";
import { buildSearchIndex, searchIndex, groupResults } from "@/lib/globalSearch";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

// Defensive list — some entities only exist in cloud mode, others
// might be missing on older deployments. Wrap each in a try so a
// single missing entity doesn't poison the whole search index.
async function safeList(entity, ...args) {
  try {
    if (!entity || typeof entity.list !== "function") return [];
    const result = await entity.list(...args);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

const TYPE_ICONS = {
  alter:     "👤",
  journal:   "📓",
  bulletin:  "📌",
  activity:  "⚡",
  task:      "☑️",
  emotion:   "💜",
  status:    "💬",
  symptom:   "💊",
  group:     "👥",
  diarycard: "📖",
  checkin:   "✨",
  location:  "📍",
  syschange: "🔀",
  note:      "📝",
  reminder:  "⏰",
  grocery:   "🛒",
};

function getTypeLabels(t) {
  return {
    alter:     t.Alters,
    journal:   "Journals",
    bulletin:  "Bulletins",
    activity:  "Activities",
    task:      "Tasks",
    emotion:   "Emotions",
    status:    "Custom Statuses",
    symptom:   "Symptoms",
    group:     "Groups",
    diarycard: "Diary Cards",
    checkin:   `${t.System} Check-Ins`,
    location:  "Locations",
    syschange: `${t.System} History`,
    note:      `${t.Alter} Notes`,
    reminder:  "Reminders",
    grocery:   "Grocery List",
  };
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
  const terms = useTerms();
  const TYPE_LABELS = useMemo(() => getTypeLabels(terms), [terms]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const containerRef = useRef(null);

  const enabled = searchFocused;
  const stale = 5 * 60 * 1000;

  // Alters always loaded (cheap, already cached by the rest of the app).
  // No filter on is_archived / dormant — every alter should be findable.
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => safeList(db.Alter),
  });

  // CustomField defs — used to surface the field label alongside its
  // value in the search blob (so a user typing the field name can find
  // alters that have it set).
  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => safeList(db.CustomField, "order"),
    staleTime: stale,
  });

  // Everything else is gated on focus so the dropdown only spins up its
  // background queries when the user actually engages the input.
  const { data: journals = [] } = useQuery({
    queryKey: ["searchJournals"],
    queryFn: () => safeList(base44.entities.JournalEntry, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: supportJournals = [] } = useQuery({
    queryKey: ["searchSupportJournals"],
    queryFn: () => safeList(base44.entities.SupportJournalEntry, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: bulletins = [] } = useQuery({
    queryKey: ["searchBulletins"],
    queryFn: () => safeList(base44.entities.Bulletin, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: bulletinComments = [] } = useQuery({
    queryKey: ["searchBulletinComments"],
    queryFn: () => safeList(base44.entities.BulletinComment, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: polls = [] } = useQuery({
    queryKey: ["searchPolls"],
    queryFn: () => safeList(base44.entities.Poll, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["searchActivities"],
    queryFn: () => safeList(base44.entities.Activity, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: sleep = [] } = useQuery({
    queryKey: ["searchSleep"],
    queryFn: () => safeList(base44.entities.Sleep, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["searchTasks"],
    queryFn: () => safeList(base44.entities.Task, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: dailyTaskTemplates = [] } = useQuery({
    queryKey: ["searchDailyTaskTemplates"],
    queryFn: () => safeList(base44.entities.DailyTaskTemplate),
    staleTime: stale, enabled,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["searchEmotions"],
    queryFn: () => safeList(base44.entities.EmotionCheckIn, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["searchSymptoms"],
    queryFn: () => safeList(base44.entities.Symptom),
    staleTime: stale, enabled,
  });
  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["searchSymptomCheckIns"],
    queryFn: () => safeList(base44.entities.SymptomCheckIn, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["searchGroups"],
    queryFn: () => safeList(base44.entities.Group),
    staleTime: stale, enabled,
  });
  const { data: diaryCards = [] } = useQuery({
    queryKey: ["searchDiaryCards"],
    queryFn: () => safeList(base44.entities.DiaryCard, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["searchSystemCheckIns"],
    queryFn: () => safeList(base44.entities.SystemCheckIn, "-created_date", 200),
    staleTime: stale, enabled,
  });
  const { data: alterNotes = [] } = useQuery({
    queryKey: ["searchAlterNotes"],
    queryFn: () => safeList(base44.entities.AlterNote, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: alterMessages = [] } = useQuery({
    queryKey: ["searchAlterMessages"],
    queryFn: () => safeList(base44.entities.AlterMessage, "-created_date", 300),
    staleTime: stale, enabled,
  });
  const { data: reminders = [] } = useQuery({
    queryKey: ["searchReminders"],
    queryFn: () => safeList(base44.entities.Reminder),
    staleTime: stale, enabled,
  });

  // Local entities
  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => safeList(localEntities.StatusNote),
    staleTime: stale, enabled,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => safeList(localEntities.Location),
    staleTime: stale, enabled,
  });
  const { data: systemChangeEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => safeList(localEntities.SystemChangeEvent),
    staleTime: stale, enabled,
  });
  const { data: groceries = [] } = useQuery({
    queryKey: ["searchGroceries"],
    queryFn: () => safeList(localEntities.GroceryItem),
    staleTime: stale, enabled,
  });

  const index = useMemo(() => buildSearchIndex({
    alters, customFieldDefs,
    journals, supportJournals,
    bulletins, bulletinComments, polls,
    activities, sleep,
    tasks, dailyTaskTemplates,
    statusNotes, emotionCheckIns,
    symptoms, symptomCheckIns,
    groups,
    diaryCards,
    systemCheckIns,
    locations,
    systemChangeEvents,
    alterNotes, alterMessages,
    reminders,
    groceries,
  }), [
    alters, customFieldDefs,
    journals, supportJournals,
    bulletins, bulletinComments, polls,
    activities, sleep,
    tasks, dailyTaskTemplates,
    statusNotes, emotionCheckIns,
    symptoms, symptomCheckIns,
    groups,
    diaryCards,
    systemCheckIns,
    locations,
    systemChangeEvents,
    alterNotes, alterMessages,
    reminders,
    groceries,
  ]);

  const searchResults = useMemo(() => searchIndex(index, query, 80), [index, query]);
  const groupedResults = useMemo(() => groupResults(searchResults), [searchResults]);

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

  const TYPE_ORDER = [
    "alter", "journal", "status", "emotion", "bulletin", "note",
    "activity", "task", "reminder", "checkin", "diarycard",
    "location", "syschange", "symptom", "group", "grocery",
  ];

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
                  <button key={`${result.type}-${result.id}`} onClick={() => handleResultClick(result.path)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left">
                    {result.type === "alter" ? (
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-xs ${result.isArchived ? "opacity-40 grayscale" : "text-white"}`}
                        style={{ backgroundColor: result.isArchived ? "#6b7280" : (result.color || "#8b5cf6") }}>
                        {result.title?.charAt(0)?.toUpperCase()}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-sm">
                        {TYPE_ICONS[result.type]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className={`text-sm font-medium truncate ${result.isArchived ? "text-muted-foreground" : "text-foreground"}`}>
                          {result.title}
                        </p>
                        {result.isArchived && (
                          <span className="flex-shrink-0 text-[0.625rem] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                            archived
                          </span>
                        )}
                      </div>
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
