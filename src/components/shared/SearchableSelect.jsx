import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Option row ───────────────────────────────────────────────────────────────
function OptionRow({ option, isSelected, onSelect, renderOption }) {
  if (renderOption) {
    return (
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onMouseDown={e => { e.preventDefault(); onSelect(option); }}
        className={cn(
          "w-full text-left flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] transition-colors",
          isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"
        )}
      >
        {renderOption(option, isSelected)}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onMouseDown={e => { e.preventDefault(); onSelect(option); }}
      className={cn(
        "w-full text-left flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] transition-colors",
        isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"
      )}
    >
      {/* Avatar / color dot / icon */}
      {option.avatar_url ? (
        <img src={option.avatar_url} alt={option.label} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
      ) : option.color ? (
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: option.color }} />
      ) : option.icon ? (
        <span className="flex-shrink-0 text-muted-foreground">{option.icon}</span>
      ) : null}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{option.label}</p>
        {option.sublabel && (
          <p className="text-xs text-muted-foreground truncate">{option.sublabel}</p>
        )}
      </div>

      {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-primary" />}
    </button>
  );
}

// ─── SearchableSelect (single) ────────────────────────────────────────────────
export function SearchableSelect({
  value = null,
  onChange,
  options = [],
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  allowClear = false,
  renderOption,
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openAbove, setOpenAbove] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  const selected = options.find(o => o.id === value) || null;

  const filtered = query.trim()
    ? options.filter(o => {
        const q = query.toLowerCase();
        return (
          o.label?.toLowerCase().includes(q) ||
          o.sublabel?.toLowerCase().includes(q)
        );
      })
    : options;

  // Position check
  const panelMaxHeight = 300;
  const handleOpen = useCallback(() => {
    if (disabled) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Only flip up if: insufficient room below AND sufficient room above
      const insufficientBelow = rect.bottom + panelMaxHeight > window.innerHeight;
      const sufficientAbove = rect.top > panelMaxHeight;
      setOpenAbove(insufficientBelow && sufficientAbove);
    }
    setOpen(true);
    setQuery("");
    setActiveIdx(-1);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(-1);
  }, []);

  const handleSelect = useCallback((option) => {
    onChange(option.id);
    handleClose();
  }, [onChange, handleClose]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, handleClose]);

  // Keyboard nav
  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        handleOpen();
      }
      return;
    }
    if (e.key === "Escape") { handleClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0 && filtered[activeIdx]) {
      e.preventDefault();
      handleSelect(filtered[activeIdx]);
    }
  };

  // Scroll active into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.querySelectorAll("[role='option']")[activeIdx];
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div ref={containerRef} className={cn("relative", className)} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={open ? handleClose : handleOpen}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
          "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-1 ring-ring"
        )}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {selected ? (
            <>
              {selected.avatar_url ? (
                <img src={selected.avatar_url} alt={selected.label} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
              ) : selected.color ? (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
              ) : null}
              <span className="truncate text-foreground">{selected.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {allowClear && selected && (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onChange(null); }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
              aria-label="Clear"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {/* Dropdown */}
       {open && (
         <div
           className={cn(
             "absolute left-0 right-0 z-[99999] rounded-lg border border-border bg-card shadow-lg",
             openAbove ? "bottom-full mb-1" : "top-full mt-1"
           )}
           style={!openAbove && triggerRef.current ? {
             maxHeight: Math.min(panelMaxHeight, Math.max(100, window.innerHeight - triggerRef.current.getBoundingClientRect().bottom - 8)) + 'px',
             display: 'flex',
             flexDirection: 'column'
           } : undefined}
         >
           {/* Search */}
           <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 flex-shrink-0">
             <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
             <input
               ref={searchRef}
               type="text"
               value={query}
               onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
               placeholder={searchPlaceholder}
               className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
             />
             {query && (
               <button type="button" onMouseDown={e => { e.preventDefault(); setQuery(""); }}
                 className="text-muted-foreground hover:text-foreground">
                 <X className="w-3 h-3" />
               </button>
             )}
           </div>

           {/* List */}
           <div
             ref={listRef}
             role="listbox"
             className="overflow-y-auto py-1 flex-1 min-h-0"
           >
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>
            ) : (
              filtered.map((option, idx) => (
                <div
                  key={option.id}
                  className={cn(activeIdx === idx && "bg-muted/30")}
                >
                  <OptionRow
                    option={option}
                    isSelected={option.id === value}
                    onSelect={handleSelect}
                    renderOption={renderOption}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SearchableMultiSelect ────────────────────────────────────────────────────
export function SearchableMultiSelect({
  value = [],
  onChange,
  options = [],
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  renderOption,
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openAbove, setOpenAbove] = useState(false);

  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const containerRef = useRef(null);

  const panelMaxHeight = 300;
  const selectedOptions = (value || []).map(id => options.find(o => o.id === id)).filter(Boolean);

  const filtered = query.trim()
    ? options.filter(o => {
        const q = query.toLowerCase();
        return o.label?.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q);
      })
    : options;

  const handleOpen = useCallback(() => {
    if (disabled) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Only flip up if: insufficient room below AND sufficient room above
      const insufficientBelow = rect.bottom + panelMaxHeight > window.innerHeight;
      const sufficientAbove = rect.top > panelMaxHeight;
      setOpenAbove(insufficientBelow && sufficientAbove);
    }
    setOpen(true);
    setQuery("");
  }, [disabled]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const handleToggle = useCallback((option) => {
    const current = value || [];
    if (current.includes(option.id)) {
      onChange(current.filter(id => id !== option.id));
    } else {
      onChange([...current, option.id]);
    }
  }, [value, onChange]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) handleClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, handleClose]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={open ? handleClose : handleOpen}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-h-[36px] w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm transition-colors",
          "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-1 ring-ring"
        )}
      >
        <span className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selectedOptions.map(opt => (
              <span key={opt.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs">
                {opt.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />}
                {opt.label}
                <span
                  role="button"
                  onMouseDown={e => { e.stopPropagation(); e.preventDefault(); handleToggle(opt); }}
                  className="text-muted-foreground hover:text-foreground ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          "absolute left-0 right-0 z-[99999] rounded-lg border border-border bg-card shadow-lg",
          openAbove ? "bottom-full mb-1" : "top-full mt-1"
        )}
        style={!openAbove && triggerRef.current ? {
          maxHeight: Math.min(panelMaxHeight, Math.max(100, window.innerHeight - triggerRef.current.getBoundingClientRect().bottom - 8)) + 'px',
          display: 'flex',
          flexDirection: 'column'
        } : undefined}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 flex-shrink-0">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
            />
            {query && (
              <button type="button" onMouseDown={e => { e.preventDefault(); setQuery(""); }}
                className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div role="listbox" aria-multiselectable="true" className="overflow-y-auto py-1 flex-1 min-h-0">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>
            ) : (
              filtered.map(option => (
                <OptionRow
                  key={option.id}
                  option={option}
                  isSelected={(value || []).includes(option.id)}
                  onSelect={handleToggle}
                  renderOption={renderOption}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Default export is the single-select variant
export default SearchableSelect;