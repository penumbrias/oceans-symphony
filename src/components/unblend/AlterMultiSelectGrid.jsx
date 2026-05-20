import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, X, User } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Single alter card — matches the SetFrontModal AlterAvatar styling
// so the picker on Get to know me reads as the same affordance.
// Selection state shows a coloured ring + bumped size. No swipe
// gestures here; this is a pure multi-select grid.
function AlterTile({ alter, selected, onToggle }) {
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgError, setImgError] = useState(false);
  const alterColor = alter?.color || "#8b5cf6";

  const boxShadow = selected
    ? `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 18px ${alterColor}aa`
    : `inset 0 0 0 2px ${alterColor}40`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex flex-col items-center gap-2 select-none"
      aria-pressed={selected}
    >
      <div className="relative">
        {resolvedUrl && !imgError ? (
          <img
            src={resolvedUrl}
            alt={alter.name}
            style={{ boxShadow }}
            className={`rounded-full object-cover transition-all ${selected ? "w-20 h-20" : "w-16 h-16"}`}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              backgroundColor: selected ? `${alterColor}30` : "hsl(var(--muted))",
              boxShadow,
            }}
            className={`rounded-full flex items-center justify-center transition-all ${selected ? "w-20 h-20" : "w-16 h-16"}`}
          >
            {alter.name ? (
              <span className="text-xs font-semibold text-muted-foreground">
                {alter.name.slice(0, 2)}
              </span>
            ) : (
              <User className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>
      <span className="text-xs text-center font-medium truncate w-full px-1">
        {alter.alias?.slice(0, 7) || alter.name?.slice(0, 7) || ""}
      </span>
    </button>
  );
}

// Reusable multi-select alter grid that mimics SetFrontModal's
// look (rounded avatars, coloured selection rings) without its
// fronting-specific behaviour (primary star, swipe-to-demote,
// switch journal flow). Used by GetToKnowMe so the picker matches
// the rest of the app rather than the previous ugly chip list.
//
// Props:
//   alters         : full alter list (active filtering done inside)
//   selectedIds    : array of selected alter ids
//   onToggle(id)   : tap handler
//   pinnedIds      : ids that should sort to the top (e.g. current
//                    fronters when sync mode is on)
//   pinnedLabel    : short caption for the pinned-section header
//   showArchived   : default false
//   searchPlaceholder
export default function AlterMultiSelectGrid({
  alters = [],
  selectedIds = [],
  onToggle,
  pinnedIds = [],
  pinnedLabel = "Pinned",
  showArchived = false,
  searchPlaceholder = "Search…",
}) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alters.filter((a) => {
      if (!a) return false;
      if (!showArchived && a.is_archived) return false;
      if (!q) return true;
      return (
        a.name?.toLowerCase().includes(q) ||
        (a.alias && a.alias.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
      );
    });
  }, [alters, query, showArchived]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const pinned = visible.filter((a) => pinnedSet.has(a.id));
  const rest = visible
    .filter((a) => !pinnedSet.has(a.id))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          {query ? "No matches." : "No alters yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                {pinnedLabel}
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {pinned.map((a) => (
                  <AlterTile
                    key={a.id}
                    alter={a}
                    selected={selectedIds.includes(a.id)}
                    onToggle={() => onToggle(a.id)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {rest.map((a) => (
              <AlterTile
                key={a.id}
                alter={a}
                selected={selectedIds.includes(a.id)}
                onToggle={() => onToggle(a.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
