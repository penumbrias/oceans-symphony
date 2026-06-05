import React, { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, X, Check, ChevronDown, User, Users } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useAlterLabel } from "@/lib/useAlterLabel";

// "Who's here" picker for the system meeting. Previously a bare free-text
// input where the user typed each alter's name vowel-by-vowel to surface a
// match — unusable for systems with dozens of members. Now it's a
// searchable, SCROLLABLE picker (the SetFrontModal pattern): a trigger
// button opens a panel listing everyone with avatars + multi-select
// checkboxes, with a search box to narrow. Selected entries render as
// removable chips. Output shape (an array of alter / group ids) is
// unchanged, so the fronting-sync and EmotionCheckIn-sync in
// SystemCheckIn.jsx keep working.

function ItemAvatar({ item }) {
  const url = useResolvedAvatarUrl(item.type === "alter" ? item.avatar_url : null);
  const [err, setErr] = useState(false);
  if (item.type === "group") {
    return (
      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center border border-border/30"
        style={{ backgroundColor: item.color ? `${item.color}30` : "hsl(var(--muted))" }}>
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
      style={{ backgroundColor: item.color || "hsl(var(--muted))" }}>
      {url && !err
        ? <img src={url} alt={item.name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : <User className="w-3.5 h-3.5 text-muted-foreground" />}
    </div>
  );
}

export default function AlterGroupPicker({ alters = [], groups = [], selected = [], onChange }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef(null);

  // Combine alters and groups (exclude archived alters).
  const items = useMemo(() => {
    const alterItems = alters
      .filter((a) => !a.is_archived)
      .map((a) => ({
        id: a.id,
        type: "alter",
        name: a.name,
        alias: a.alias,
        color: a.color,
        avatar_url: a.avatar_url,
        displayText: formatAlter(a),
      }));
    const groupItems = groups.map((g) => ({
      id: g.id,
      type: "group",
      name: g.name,
      color: g.color,
      displayText: g.name,
    }));
    return [...alterItems, ...groupItems];
  }, [alters, groups, formatAlter]);

  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) =>
        !q ||
        item.displayText.toLowerCase().includes(q) ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.alias && item.alias.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "alter" ? -1 : 1;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [items, search]);

  const selectedItems = useMemo(
    () => selected.map((id) => itemsById[id]).filter(Boolean),
    [selected, itemsById]
  );

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((sid) => sid !== id));
    else onChange([...selected, id]);
  };
  const remove = (id) => onChange(selected.filter((sid) => sid !== id));

  return (
    <div className="space-y-2">
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 truncate text-muted-foreground">
            {selected.length > 0
              ? `${selected.length} selected — tap to add or remove`
              : `Choose who's here…`}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl z-20 overflow-hidden">
            <div className="relative px-2.5 py-2 border-b border-border/40">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={`Search ${terms.alters} & groups…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">No matches.</p>
              ) : (
                filtered.map((item) => {
                  const isSelected = selected.includes(item.id);
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}`}
                    >
                      <ItemAvatar item={item} />
                      <span className="flex-1 truncate">{item.displayText}</span>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedItems.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full flex items-center gap-2"
            >
              <span className="text-xs">{item.type === "alter" ? "🧑" : "👥"}</span>
              <span>{item.displayText}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="hover:text-destructive transition-colors ml-1"
                aria-label={`Remove ${item.displayText}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
