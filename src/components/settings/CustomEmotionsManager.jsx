// Custom emotions (v0.356.1) — Settings → Tracking → Custom emotions, also
// mounted in the check-in manager and the setup guide.
//
// Built to docs/inspector-design-guide.md: flat SettingRows, and drill-in
// pages kept in the URL (`?em=…`) so the phone's back gesture steps back
// one page — no inline edit forms, native <select>s or hover-only buttons.
//
//   (none)             home: your emotions, then the built-in ones
//   new                add an emotion
//   emotion:<id>       one emotion: name, group, colour, distressing; ⋯ delete
//   distress           which built-in emotions are distressing
//   names              rename the four groups
//
// Data paths are unchanged: CustomEmotion rows (label, category, color,
// is_distressing), the built-in distress set in emotionDistress.js, and
// SystemSettings.emotion_category_names.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, MoreHorizontal, Plus, AlertCircle, Type, Trash2 } from "lucide-react";
import { base44, localEntities } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Row, StackedRow, Group, SwitchRow, LinkRow, ColourRow, Chips, ResetRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { confirm } from "@/components/shared/ConfirmDialog";
import { WHEEL } from "@/components/emotions/EmotionWheelPicker";
import { normalizeHex } from "@/lib/hexColor";
import { loadSystemDistressSet, saveSystemDistressSet, DEFAULT_DISTRESS } from "@/lib/emotionDistress";
import { useEmotionCategoryLabels, EMOTION_CATEGORY_KEYS, DEFAULT_CATEGORY_LABELS } from "@/lib/emotionCategories";
import { TRASH_HINT } from "@/lib/trashSettings";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

const db = isLocalMode() ? localEntities : base44.entities;
const UNCATEGORIZED = "custom";

// Colour of a category id: a group (good/bad/…), one of its cores, or none.
function categoryColour(cat) {
  if (WHEEL[cat]) return WHEEL[cat].color;
  for (const v of Object.values(WHEEL)) {
    if (v.cores?.[cat]) return v.cores[cat].color;
  }
  return "#8b5cf6";
}

// Every category an emotion can sit in, nested: group → its cores.
function useCategoryOptions() {
  const catLabels = useEmotionCategoryLabels();
  return useMemo(() => {
    const out = [{ id: UNCATEGORIZED, label: "Uncategorized", color: categoryColour(UNCATEGORIZED), _depth: 0 }];
    for (const [key, data] of Object.entries(WHEEL)) {
      out.push({ id: key, label: catLabels[key] || data.label, color: data.color, _depth: 0 });
      if (data.cores) {
        for (const [core, { color }] of Object.entries(data.cores)) out.push({ id: core, label: core, color, _depth: 1 });
      }
    }
    return out;
  }, [catLabels]);
}

function categoryLabel(options, cat) {
  return options.find((o) => o.id === (cat || UNCATEGORIZED))?.label || cat || "Uncategorized";
}

const dotIcon = (color) => function EmotionDot({ className = "" }) {
  return (
    <span className={`${className} flex items-center justify-center`} aria-hidden>
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
};

function SubHeader({ title, onBack, menu = null }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button type="button" onClick={onBack} aria-label="Back"
        className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 flex-shrink-0">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <h2 className="text-lg font-semibold leading-tight min-w-0 truncate flex-1">{title}</h2>
      {menu}
    </div>
  );
}

function CategoryPicker({ value, onChange }) {
  const options = useCategoryOptions();
  return (
    <SearchableSelect
      value={value || UNCATEGORIZED}
      onChange={(id) => onChange(id || UNCATEGORIZED)}
      options={options}
      searchPlaceholder="Search groups…"
      className="w-44 max-w-full"
      renderOption={(o) => (
        <span className="flex items-center gap-2 min-w-0">
          {o._depth > 0 && <span className="w-3 flex-shrink-0 text-muted-foreground text-xs" aria-hidden>↳</span>}
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} aria-hidden />
          <span className="truncate text-sm">{o.label}</span>
        </span>
      )}
    />
  );
}

function useCustomEmotions() {
  return useQuery({ queryKey: ["customEmotions"], queryFn: () => db.CustomEmotion.list() });
}

export default function CustomEmotionsManager() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const view = params.get("em") || "";
  // Drill-ins push history, so Back (and the phone's back gesture) steps out.
  const go = (next, { replace = false } = {}) => {
    const p = new URLSearchParams(location.search);
    if (next) p.set("em", next); else p.delete("em");
    const search = p.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace });
  };
  const back = () => {
    const idx = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (idx > 0) navigate(-1); else go("", { replace: true });
  };

  let page;
  if (view === "new") page = <NewEmotionPage back={back} go={go} />;
  else if (view.startsWith("emotion:")) page = <EmotionPage id={view.slice(8)} back={back} go={go} />;
  else if (view === "distress") page = <DistressPage back={back} />;
  else if (view === "names") page = <NamesPage back={back} />;
  else page = <HomePage go={go} />;
  return <div>{page}</div>;
}

// ── Home ────────────────────────────────────────────────────────────────────

function HomePage({ go }) {
  const { data: emotions = [] } = useCustomEmotions();
  const options = useCategoryOptions();
  const catLabels = useEmotionCategoryLabels();
  const [query, setQuery] = useState("");
  const distressCount = useMemo(() => loadSystemDistressSet().size, []);
  const renamed = EMOTION_CATEGORY_KEYS.filter((k) => catLabels[k] !== DEFAULT_CATEGORY_LABELS[k]).length;

  const q = query.trim().toLowerCase();
  const shown = q
    ? emotions.filter((e) => (e.label || "").toLowerCase().includes(q) || categoryLabel(options, e.category).toLowerCase().includes(q))
    : emotions;
  // Grouped in the wheel's own order, Uncategorized last.
  const groups = useMemo(() => {
    const order = options.map((o) => o.id).filter((id) => id !== UNCATEGORIZED).concat(UNCATEGORIZED);
    const map = new Map();
    for (const e of shown) {
      const cat = options.some((o) => o.id === e.category) ? e.category : UNCATEGORIZED;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(e);
    }
    return order.filter((id) => map.has(id)).map((id) => ({
      id, label: categoryLabel(options, id),
      items: map.get(id).slice().sort((a, b) => (a.label || "").localeCompare(b.label || "")),
    }));
  }, [shown, options]);

  return (
    <div>
      <p className="text-xs text-muted-foreground pb-2">
        Your own emotions join the emotion wheel. A distressing one brings up the grounding prompt when it's picked.
      </p>
      <Group title={`Your emotions (${emotions.length})`} first>
        <LinkRow icon={Plus} label="Add an emotion" onClick={() => go("new")} />
        {emotions.length > 6 && (
          <div role="search" className="py-2">
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your emotions…" aria-label="Search your emotions" className="h-9 text-sm" />
          </div>
        )}
        {emotions.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No custom emotions yet.</p>
        )}
        {emotions.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No emotions match.</p>
        )}
      </Group>
      {groups.map((g) => (
        <Group key={g.id} title={g.label}>
          {g.items.map((e) => (
            <LinkRow key={e.id}
              icon={dotIcon(normalizeHex(e.color) || categoryColour(e.category || UNCATEGORIZED))}
              label={e.label}
              hint={e.is_distressing ? "Distressing" : undefined}
              onClick={() => go(`emotion:${e.id}`)} />
          ))}
        </Group>
      ))}
      <Group title="Built-in emotions">
        <LinkRow icon={AlertCircle} label="Distressing emotions" hint="Which ones bring up the grounding prompt"
          value={distressCount ? `${distressCount} marked` : "None"} onClick={() => go("distress")} />
        <LinkRow icon={Type} label="Group names" hint="Rename Good, Bad, Neutral and Body"
          value={renamed ? `${renamed} renamed` : "Default"} onClick={() => go("names")} />
      </Group>
    </div>
  );
}

// ── Add ─────────────────────────────────────────────────────────────────────

function NewEmotionPage({ back, go }) {
  const queryClient = useQueryClient();
  const { data: emotions = [] } = useCustomEmotions();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(UNCATEGORIZED);
  const [color, setColor] = useState("");
  const [distressing, setDistressing] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const name = label.trim();
    if (!name || busy) return;
    if (emotions.some((e) => (e.label || "").toLowerCase() === name.toLowerCase())) {
      toast.error("You already have that emotion");
      return;
    }
    setBusy(true);
    try {
      await db.CustomEmotion.create({ label: name, category, is_distressing: distressing, ...(color ? { color } : {}) });
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
      toast.success(`Added "${name}"`);
      go("", { replace: true });
    } catch (e) {
      toast.error(e?.message || "Couldn't add the emotion");
      setBusy(false);
    }
  };

  return (
    <div>
      <SubHeader title="Add an emotion" onBack={back} />
      <Row label="Name">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="e.g. Wistful" aria-label="Emotion name" className="h-9 w-44 max-w-full text-sm" />
      </Row>
      <Row label="Group" hint="Where it sits on the wheel">
        <CategoryPicker value={category} onChange={setCategory} />
      </Row>
      <ColourRow label="Colour" hint="Leave it to use the group's colour"
        value={color} live={categoryColour(category)}
        onChange={(c) => setColor(normalizeHex(c))} onClear={() => setColor("")} />
      <SwitchRow label="Distressing" hint="Brings up the grounding prompt" checked={distressing} onChange={setDistressing} />
      <div className="pt-4">
        <Button className="w-full" onClick={add} disabled={!label.trim() || busy}>Add emotion</Button>
      </div>
    </div>
  );
}

// ── One emotion ─────────────────────────────────────────────────────────────

// Changes write after a short pause and on leaving, so dragging the colour
// picker doesn't write the record on every step.
function useDebouncedPatch(id) {
  const queryClient = useQueryClient();
  const timer = useRef(null);
  const pending = useRef(null);
  const flush = useRef(() => {});
  flush.current = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    db.CustomEmotion.update(id, patch)
      .then(() => queryClient.invalidateQueries({ queryKey: ["customEmotions"] }))
      .catch((e) => toast.error(e?.message || "Couldn't save the emotion"));
  };
  useEffect(() => {
    const now = () => flush.current();
    window.addEventListener("pagehide", now);
    return () => { window.removeEventListener("pagehide", now); now(); };
  }, []);
  return (patch) => {
    pending.current = { ...(pending.current || {}), ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), 400);
  };
}

function EmotionPage({ id, back, go }) {
  const queryClient = useQueryClient();
  const { data: emotions = [], isLoading } = useCustomEmotions();
  const emotion = emotions.find((e) => e.id === id);
  const write = useDebouncedPatch(id);
  // A draft shows at once; the record catches up when the write lands.
  const [draft, setDraft] = useState({});
  const merged = emotion ? { ...emotion, ...draft } : null;
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); write(patch); };

  if (!merged) {
    return (
      <div>
        <SubHeader title="Emotion" onBack={back} />
        <p className="text-sm text-muted-foreground py-3">{isLoading ? "Loading…" : "This emotion isn't here any more."}</p>
      </div>
    );
  }

  const rename = (raw) => {
    const name = String(raw || "").trim();
    if (!name || name === emotion.label) return;
    if (emotions.some((e) => e.id !== id && (e.label || "").toLowerCase() === name.toLowerCase())) {
      toast.error("You already have that emotion");
      return;
    }
    set({ label: name });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${merged.label}"?`,
      body: `Past check-ins that recorded it keep the word, but it leaves the wheel. ${TRASH_HINT}`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    try {
      await db.CustomEmotion.delete(id);
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
      toast.success("Emotion deleted");
      go("", { replace: true });
    } catch {
      toast.error("Couldn't delete the emotion");
    }
  };

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More"
          className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 flex-shrink-0">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={remove} className="text-destructive focus:text-destructive gap-2">
          <Trash2 className="w-4 h-4" /> Delete emotion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const category = merged.category || UNCATEGORIZED;
  return (
    <div>
      <SubHeader title={merged.label} onBack={back} menu={menu} />
      <Row label="Name">
        <DebouncedText value={emotion.label} onCommit={rename} ariaLabel="Emotion name"
          className="h-9 w-44 max-w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      </Row>
      <Row label="Group" hint="Where it sits on the wheel">
        <CategoryPicker value={category} onChange={(c) => set({ category: c })} />
      </Row>
      <ColourRow label="Colour" hint="Leave it to use the group's colour"
        value={normalizeHex(merged.color)} live={categoryColour(category)}
        onChange={(c) => { const hex = normalizeHex(c); if (hex) set({ color: hex }); }}
        onClear={() => set({ color: "" })} />
      <SwitchRow label="Distressing" hint="Brings up the grounding prompt"
        checked={!!merged.is_distressing} onChange={(on) => set({ is_distressing: on })} />
    </div>
  );
}

// ── Built-in distress marks ─────────────────────────────────────────────────

function DistressPage({ back }) {
  const catLabels = useEmotionCategoryLabels();
  const [marked, setMarked] = useState(() => loadSystemDistressSet());

  const toggle = (word) => {
    setMarked((prev) => {
      const next = new Set(prev);
      const key = word.toLowerCase();
      if (next.has(key)) next.delete(key); else next.add(key);
      saveSystemDistressSet(next);
      return next;
    });
  };
  const resetMarks = async () => {
    const ok = await confirm({
      title: "Go back to the starting marks?",
      body: "The emotions marked when the app was new are marked again, and your other marks are taken off.",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    const next = new Set(DEFAULT_DISTRESS.map((w) => String(w).toLowerCase()));
    saveSystemDistressSet(next);
    setMarked(next);
  };

  // One chip set per core (or the whole flat group). Tapping a chip flips
  // that one word; the same word in another group flips with it.
  const chipRow = (rowLabel, words, color) => {
    const value = words.filter((w) => marked.has(w.toLowerCase()));
    const onChange = (nextValue) => {
      const before = new Set(value);
      const after = new Set(nextValue);
      const flipped = words.find((w) => before.has(w) !== after.has(w));
      if (flipped) toggle(flipped);
    };
    return (
      <StackedRow key={rowLabel} label={
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
          {rowLabel}
        </span>
      }>
        <Chips label={`${rowLabel} emotions`} multiple options={words.map((w) => ({ value: w, label: w }))} value={value} onChange={onChange} />
      </StackedRow>
    );
  };

  return (
    <div>
      <SubHeader title="Distressing emotions" onBack={back} />
      <p className="text-xs text-muted-foreground pb-2">
        Tap an emotion to mark it. Picking a marked one in a check-in brings up the grounding prompt.
      </p>
      {Object.entries(WHEEL).map(([key, data], i) => (
        <Group key={key} title={catLabels[key] || data.label} first={i === 0}>
          {data.flat && chipRow(catLabels[key] || data.label, data.flat, data.color)}
          {data.cores && Object.entries(data.cores).map(([core, { color, subs }]) =>
            chipRow(core, [core, ...subs.filter((s) => s !== core)], color))}
        </Group>
      ))}
      <ResetRow label="Reset to the starting marks" onReset={resetMarks} />
    </div>
  );
}

// ── Group names ─────────────────────────────────────────────────────────────

// The four groups keep their structure; the names are the person's.
// A blank name goes back to the default.
function NamesPage({ back }) {
  const queryClient = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => db.SystemSettings.list(),
  });
  const row = pickPrimarySystemSettings(settingsList);
  const overrides = row?.emotion_category_names || {};
  // Bumped when a name is cleared from outside its box (× or Reset), so the
  // box shows the cleared value; typing never remounts it.
  const [gen, setGen] = useState(0);

  const saveName = async (key, raw) => {
    const v = String(raw || "").trim();
    // Read fresh so two quick edits (or two devices) don't drop each other.
    const fresh = pickPrimarySystemSettings(await db.SystemSettings.list());
    const next = { ...(fresh?.emotion_category_names || {}) };
    if (v && v !== DEFAULT_CATEGORY_LABELS[key]) next[key] = v; else delete next[key];
    try {
      if (fresh?.id) await db.SystemSettings.update(fresh.id, { emotion_category_names: next });
      else await db.SystemSettings.create({ emotion_category_names: next });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save the name");
    }
  };

  const anyRenamed = EMOTION_CATEGORY_KEYS.some((k) => overrides[k]);
  return (
    <div>
      <SubHeader title="Group names" onBack={back} />
      <p className="text-xs text-muted-foreground pb-2">
        Rename the four groups to whatever fits. Leave one blank to use its default name.
      </p>
      {EMOTION_CATEGORY_KEYS.map((k) => (
        <Row key={`${k}:${gen}`} label={DEFAULT_CATEGORY_LABELS[k]} own={!!overrides[k]}
          onClear={async () => { await saveName(k, ""); setGen((g) => g + 1); }}>
          <DebouncedText value={overrides[k] || ""} onCommit={(v) => saveName(k, v)}
            placeholder={DEFAULT_CATEGORY_LABELS[k]} ariaLabel={`Name for ${DEFAULT_CATEGORY_LABELS[k]}`}
            className="h-9 w-40 max-w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </Row>
      ))}
      {anyRenamed && (
        <ResetRow label="Use the default names" onReset={async () => {
          const fresh = pickPrimarySystemSettings(await db.SystemSettings.list());
          if (fresh?.id) await db.SystemSettings.update(fresh.id, { emotion_category_names: {} });
          await queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
          setGen((g) => g + 1);
        }} />
      )}
    </div>
  );
}
