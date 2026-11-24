// The story sheet for new-house step 1.3: panels, content and sheets, every
// block in every state, at 2, 12 and 200 items, in the person's own paint.
// Unlinked on purpose (reached from the kit's other sheets, or by typing
// /house/kit/panels). Nothing here writes anything: every control changes
// only this page's own state, and the delete examples never touch a record.

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays, Copy, Footprints, Layers as LayersIcon, List, MapPin, Palette, Plus, Shapes, Trash2, Type, NotebookPen,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import HouseRoot from "@/house/tokens/HouseRoot";
import HouseIcon from "@/house/tokens/HouseIcon";
import {
  Button, Panel, PageTabs, ListView, TreeView, RowText, Info, Inspector, InspectorGroup, Layers,
  Row, Card, Stat, AlterChip, AlterChips, EmptyBlock, LoadingBlock, ErrorBlock, ToastHost, ToastCard, showToast,
  Sheet, ConfirmSheet, SafetySheet, Switch, Segmented, SliderRow, TextField, AlterPicker, NestedPicker, ColourField,
} from "@/house/kit";
import Chart from "@/house/kit/Charts";
import KitNav from "@/house/sample/KitNav";
import "@/house/sample/kitSample.css";
import "@/house/sample/controlsSample.css";
import "@/house/sample/panelsSample.css";

const LONG = "Ashwood-under-the-old-lighthouse-steps!"; // 40 characters
const noop = () => {};
const COUNTS = [2, 12, 200];
const PAD = ["#6C8CFF", "#E8833A", "#2FA37C", "#B455C9", "#D4A72C", "#D9466B", "#3AA6C9", "#7A6FF0"];
const KINDS = ["Walk", "Tea with Sam", "Laundry", "Call the clinic", "Read", "Stretch", "Journal", "Groceries", "Nap", "Paint"];

function Section({ id, title, note, children }) {
  return (
    <section className="kit-section" aria-labelledby={`ps-${id}`} data-story={id}>
      <h2 id={`ps-${id}`} className="house-label house-text-lg kit-section-title">{title}</h2>
      {note ? <p className="house-text-sm house-muted kit-note">{note}</p> : null}
      {children}
    </section>
  );
}
function Cell({ name, children, wide = false }) {
  return (
    <div className={`ks-cell${wide ? " ks-cell--wide" : ""}`}>
      <div className="ks-cell-body">{children}</div>
      <span className="house-text-xs house-muted ks-cell-name">{name}</span>
    </div>
  );
}
const Grid = ({ children, cols }) => <div className={`ks-grid${cols === "wide" ? " ps-grid-wide" : ""}`}>{children}</div>;

// Example data only: the Preview Mode system's own alters and groups, padded
// with made-up example people when it has fewer than the story needs.
function useExample() {
  const { data: rawAlters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const alters = useMemo(() => {
    const live = rawAlters.filter((a) => !a.is_archived);
    const pad = ["River", "Ash", "Juniper", "Wren", "Sol", "Moth", "Kestrel", "Lark"].map((name, i) => ({ id: `ex-${i}`, name, color: PAD[i % PAD.length] }));
    return [...live, ...pad].slice(0, Math.max(8, live.length));
  }, [rawAlters]);
  const plans = useMemo(() => Array.from({ length: 200 }, (_, i) => ({
    id: `p${i + 1}`, title: `${KINDS[i % KINDS.length]} ${Math.floor(i / KINDS.length) + 1}`,
    when: `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i % 7]} ${(i % 12) + 8}:${i % 2 ? "30" : "00"}`,
  })), []);
  return { alters, groups, plans };
}

// ── Panels ───────────────────────────────────────────────────────────
function Panels() {
  const [open, setOpen] = useState(false);
  return (
    <Grid>
      <Cell name="Open, with tools"><Panel title="Plans" tools={<Button rank="quiet" icon={Plus}>Add</Button>} collapsible><p className="ps-p">The left panel's list goes here.</p></Panel></Cell>
      <Cell name="Folded"><Panel title="Filters" collapsible open={open} onOpenChange={setOpen}><p className="ps-p">Folded content.</p></Panel></Cell>
      <Cell name="Docked right (edit mode moves it later)"><Panel title="Info" dock="right"><p className="ps-p">A docked panel's body.</p></Panel></Cell>
      <Cell name="40-character title wraps"><Panel title={`${LONG} and their notes`} collapsible><p className="ps-p">Never cut.</p></Panel></Cell>
    </Grid>
  );
}

function PageTabsStory() {
  const [tab, setTab] = useState("about");
  const tabs = [
    { id: "about", label: "About" }, { id: "notes", label: "Notes", dot: true }, { id: "history", label: "History" },
    { id: "relationships", label: "Relationships" }, { id: "more", label: "More" },
  ];
  return (
    <Grid>
      <Cell name="Five tabs, one row, scrolls sideways" wide><PageTabs label="Sections of River" tabs={tabs} value={tab} onChange={setTab} /></Cell>
      <Cell name="Focus"><span data-force-tab="focus-visible"><PageTabs label="Sections (focus)" tabs={tabs.slice(0, 3)} value="notes" onChange={noop} /></span></Cell>
    </Grid>
  );
}

// ── List and tree ────────────────────────────────────────────────────
function Lists({ plans }) {
  const [sel, setSel] = useState({ 2: "p1", 12: "p4", 200: "p150" });
  return (
    <>
      <Grid>
        {COUNTS.map((n) => (
          <Cell key={n} name={`${n} items`}>
            <Panel title={`Plans (${n})`} bodyClassName="ps-scroll">
              <ListView label={`Plans, ${n}`} items={plans.slice(0, n)} value={sel[n]} onSelect={(id) => setSel((s) => ({ ...s, [n]: id }))}
                leading={() => <HouseIcon icon={Footprints} />}
                renderRow={(p) => <RowText title={p.title} subtitle={p.when} />} />
            </Panel>
          </Cell>
        ))}
        <Cell name="1,000 items: paged, 100 at a time">
          <Panel title="Plans (1,000)" bodyClassName="ps-scroll">
            <ListView label="Plans, 1000" items={Array.from({ length: 1000 }, (_, i) => plans[i % 200] && { ...plans[i % 200], id: `q${i}` })} value="q450" onSelect={noop}
              renderRow={(p) => <RowText title={p.title} subtitle={p.when} />} />
          </Panel>
        </Cell>
      </Grid>
      <Grid>
        <Cell name="Empty"><Panel title="Plans"><EmptyBlock icon={CalendarDays} title="No plans this week" body="Plans you make show here, soonest first." action={{ label: "Plan something", icon: Plus, onClick: noop }} /></Panel></Cell>
        <Cell name="Loading (rows of the final size)"><Panel title="Plans"><LoadingBlock label="Loading plans" rows={4} /></Panel></Cell>
        <Cell name="Error"><Panel title="Plans"><ErrorBlock what="Couldn't load your plans" detail="the storage didn't answer" onRetry={noop} /></Panel></Cell>
      </Grid>
    </>
  );
}

function Trees({ groups }) {
  const t = useTerms();
  const [sel, setSel] = useState(null);
  const broken = [
    { id: "a", name: "Self-care" }, { id: "b", name: "Hygiene", parent: "a" }, { id: "c", name: "Shower", parent: "b" },
    { id: "s", name: "Its own parent", parent: "s" },
    { id: "x", name: "Loop one", parent: "y" }, { id: "y", name: "Loop two", parent: "x" },
    { id: "o", name: "Parent was deleted", parent: "gone" },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, name: `Level ${i + 2}`, parent: i === 0 ? "a" : `d${i - 1}` })),
  ];
  const big = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, name: `Folder ${i + 1}`, parent: i < 10 ? null : `t${i % 10}` }));
  const parentOf = (g) => g.parent || g.parent_id || null;
  return (
    <Grid>
      <Cell name={`Groups and sub${t.system}s (example system, ${groups.length})`}>
        <Panel title="Groups" bodyClassName="ps-scroll">
          {groups.length
            ? <TreeView label="Groups" nodes={groups} getParentId={parentOf} value={sel} onSelect={setSel} renderRow={(g) => <RowText title={g.name || "Unnamed"} />} />
            : <EmptyBlock compact title="No groups yet" body={`Groups gather ${t.alters} who belong together.`} />}
        </Panel>
      </Cell>
      <Cell name="Broken data: self-parent, a loop, a lost parent, 13 levels deep (indent stops at 8)">
        <Panel title="Categories" bodyClassName="ps-scroll"><TreeView label="Categories" nodes={broken} getParentId={parentOf} value="c" onSelect={noop} renderRow={(g) => <RowText title={g.name} />} /></Panel>
      </Cell>
      <Cell name="200 folders, some folded">
        <Panel title="Folders (200)" bodyClassName="ps-scroll"><TreeView label="Folders" nodes={big} getParentId={parentOf} defaultExpanded={["t0", "t1"]} value="t20" onSelect={noop} renderRow={(g) => <RowText title={g.name} />} /></Panel>
      </Cell>
    </Grid>
  );
}

// ── Info ─────────────────────────────────────────────────────────────
function InfoStory({ alters }) {
  const t = useTerms();
  const a = alters[0];
  const [editing, setEditing] = useState(null);
  const [pronouns, setPronouns] = useState("they/them");
  const [draft, setDraft] = useState("");
  const menu = [
    { id: "dup", label: "Duplicate", icon: Copy, onSelect: noop },
    { id: "del", label: `Delete ${a?.name || t.alter}`, icon: Trash2, danger: true, onSelect: noop },
  ];
  return (
    <Grid>
      <Cell name="Filled, one row editing" wide>
        <Info title={a?.name || "River"} kind={t.Alter} lead={a ? <AlterChip alter={a} size="lg" /> : null} menu={menu}
          editing={editing}
          renderEditor={() => <TextField label="Pronouns" value={draft} onChange={setDraft} />}
          sections={[
            { title: "About", rows: [
              { id: "pronouns", label: "Pronouns", value: pronouns, onEdit: () => { setDraft(pronouns); setEditing("pronouns"); },
                onSave: () => { setPronouns(draft); setEditing(null); }, onCancel: () => setEditing(null) },
              { id: "role", label: "Role", value: "", empty: "Not set yet", onEdit: noop },
              { id: "long", label: "Nickname", value: LONG, onEdit: noop },
              { id: "added", label: "Added", value: "Mon 3 Mar 2025", lockedReason: "Set when it was made" },
            ] },
          ]} />
      </Cell>
      <Cell name="Loading"><Info loading kind={t.Alter} /></Cell>
      <Cell name="Error"><Info error={`Couldn't open this ${t.alter}`} onRetry={noop} /></Cell>
      <Cell name="Nothing chosen"><Info empty={{ title: "Nothing chosen", body: `Choose ${an(t.alter)} in the list to see their details here.` }} /></Cell>
    </Grid>
  );
}

// ── Inspector ────────────────────────────────────────────────────────
function InspectorStory() {
  const [tab, setTab] = useState("content");
  const [show, setShow] = useState(true);
  const [size, setSize] = useState(undefined);
  const [view, setView] = useState("list");
  const tabs = [
    { id: "text", label: "Text", icon: Type, onReset: noop, body: (
      <InspectorGroup title="Body"><SliderRow label="Text size" value={size} fallback={16} min={10} max={32} unit="px" onChange={setSize} onClear={() => setSize(undefined)} /></InspectorGroup>
    ) },
    { id: "content", label: "Content", icon: List, dot: true, onReset: noop, body: (
      <InspectorGroup title="What it shows">
        <Switch label="Show finished plans" checked={show} onChange={setShow} />
        <Segmented label="Show as" showLabel value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }]} />
      </InspectorGroup>
    ) },
    { id: "shape", label: "Shape", icon: Shapes, onReset: noop, resetDisabledReason: "Nothing set here yet", body: <SliderRow label="Corner size" hint="From the app look" value={undefined} fallback={12} min={0} max={24} unit="px" onChange={noop} onClear={noop} /> },
    { id: "colour", label: "Colour", icon: Palette, onReset: noop, body: <p className="ps-p">Colour rows.</p> },
  ];
  const menu = [{ id: "dup", label: "Duplicate", icon: Copy, onSelect: noop }, { id: "rm", label: "Remove Plans widget", icon: Trash2, danger: true, onSelect: noop }];
  return (
    <Grid>
      <Cell name="Tabs (standard order), dot = has its own setting">
        <div className="ps-insp"><Inspector title="Plans widget" tabs={tabs} tab={tab} onTabChange={setTab} menu={menu}
          undo={{ onClick: noop }} redo={{ onClick: noop, disabledReason: "Nothing to redo" }} onClose={noop} /></div>
      </Cell>
      <Cell name="One list (Accessibility → option menus as one list)">
        <div className="ps-insp"><Inspector title="Plans widget" stacked tabs={tabs.slice(0, 2)} menu={menu} onClose={noop} /></div>
      </Cell>
    </Grid>
  );
}

// ── Layers ───────────────────────────────────────────────────────────
function LayersStory() {
  const make = (n) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, name: i === 3 ? LONG : ["Forest", "Lake house", "Library", "Garden", "Attic", "Shore"][i % 6] + (i >= 6 ? ` ${Math.floor(i / 6) + 1}` : ""), visible: i !== 1, lockedReason: i === 2 ? "Part of the base map" : undefined }));
  const [two, setTwo] = useState(() => make(2));
  const [twelve, setTwelve] = useState(() => make(12));
  const toggle = (set) => (id, v) => set((l) => l.map((x) => (x.id === id ? { ...x, visible: v } : x)));
  return (
    <Grid>
      <Cell name="2 layers, one hidden"><Layers label="Layers (2)" layers={two} onReorder={setTwo} onToggle={toggle(setTwo)} renderLead={() => <HouseIcon icon={MapPin} />} /></Cell>
      <Cell name="12 layers: hidden, locked, 40-character name"><div className="ps-scroll"><Layers label="Layers (12)" layers={twelve} onReorder={setTwelve} onToggle={toggle(setTwelve)} /></div></Cell>
      <Cell name="None yet"><EmptyBlock compact icon={LayersIcon} title="No layers yet" body="Layers stack places on the map, top first." action={{ label: "Add a layer", icon: Plus, onClick: noop }} /></Cell>
    </Grid>
  );
}

// ── Content ──────────────────────────────────────────────────────────
function ContentStory({ alters }) {
  const t = useTerms();
  const [pick, setPick] = useState(null);
  const longAlter = { id: "long", name: LONG, color: "#2FA37C" };
  return (
    <>
      <h3 className="house-label house-text-sm ks-rank-title">Rows</h3>
      <Grid>
        <Cell name="Static, with meta"><Row title="Walk by the river" subtitle="Today, 9:30 pm" meta="45 min" lead={<HouseIcon icon={Footprints} />} /></Cell>
        <Cell name="Button, chosen"><Row title="Tea with Sam" subtitle="Tomorrow" onClick={noop} selected lead={<HouseIcon icon={CalendarDays} />} /></Cell>
        <Cell name="Link"><Row title="Open the journal" href="/house/kit/panels" lead={<HouseIcon icon={NotebookPen} />} /></Cell>
        <Cell name="Disabled, with the reason"><Row title="Move to another day" onClick={noop} disabledReason="Repeating plans move from the series" /></Cell>
        <Cell name="Hover"><span data-force-child="hover"><Row title="Hover me" onClick={noop} /></span></Cell>
        <Cell name="40 characters wrap"><Row title={`${LONG} by the river`} subtitle={LONG} meta="1 h 30 min" onClick={noop} /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Cards and stats</h3>
      <Grid>
        <Cell name="Card"><Card title="This week" footer={<Button rank="quiet">See all</Button>}><p className="ps-p">Three plans done, two to go.</p></Card></Cell>
        <Cell name="Stat"><Stat label="Check-ins this week" value={12} change="3 more than last week" /></Cell>
        <Cell name="Stat with a unit"><Stat label="Sleep last night" value="7.5" unit="hours" change="Same as usual" /></Cell>
        <Cell name="Stat, loading"><LoadingBlock kind="stat" label="Loading the count" /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">{t.Alter} chips</h3>
      <Grid>
        <Cell name="One"><AlterChip alter={alters[0]} /></Cell>
        <Cell name="Small and large"><span className="ps-row"><AlterChip alter={alters[1]} size="sm" /><AlterChip alter={alters[2]} size="lg" /></span></Cell>
        <Cell name="A button, chosen"><AlterChip alter={alters[3]} onClick={() => setPick(alters[3].id === pick ? null : alters[3].id)} selected={pick === alters[3].id || pick == null} /></Cell>
        <Cell name="40-character name wraps"><AlterChip alter={longAlter} /></Cell>
        <Cell name={`Two ${t.fronting}`}><AlterChips alters={alters.slice(0, 2)} /></Cell>
        <Cell name={`Seven ${t.fronting}: three, then +4`} wide><AlterChips alters={[...alters.slice(0, 6), longAlter]} max={3} onMore={noop} /></Cell>
      </Grid>
    </>
  );
}

// ── Charts ───────────────────────────────────────────────────────────
function ChartsStory() {
  const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ day: d, checkins: [3, 5, 2, 4, 6, 1, 3][i], mood: [3, 4, 2, 3, 4, 4, 5][i], energy: [2, 3, 2, 2, 4, 3, 3][i] }));
  const time = [{ name: "Rest", value: 9 }, { name: "Work", value: 6 }, { name: "Self-care", value: 3 }, { name: "Social", value: 2 }];
  return (
    <Grid cols="wide">
      <Cell name="Bar, with legend" wide><Chart kind="bar" title="Check-ins by day" xKey="day" xLabel="Day" data={week} series={[{ key: "checkins", label: "Check-ins" }]} /></Cell>
      <Cell name="Line, two series (dash and marker tell them apart)" wide><Chart kind="line" title="Mood and energy" xKey="day" xLabel="Day" data={week} series={[{ key: "mood", label: "Mood" }, { key: "energy", label: "Energy" }]} /></Cell>
      <Cell name="Donut"><Chart kind="donut" title="Time by activity" data={time} unit="h" valueLabel="Hours" xLabel="Activity" /></Cell>
      <Cell name="The text version"><Chart kind="donut" title="Time by activity (table)" data={time} unit="h" valueLabel="Hours" xLabel="Activity" initialView="table" /></Cell>
      <Cell name="No data yet"><Chart kind="bar" title="Check-ins by day" data={[]} empty={{ title: "No check-ins this week", body: "Your check-ins show here by day." }} /></Cell>
      <Cell name="Loading"><LoadingBlock kind="chart" label="Loading the chart" /></Cell>
    </Grid>
  );
}

// ── Empty / loading / error ──────────────────────────────────────────
function StatesStory() {
  const t = useTerms();
  return (
    <Grid>
      <Cell name="Empty, one next step"><EmptyBlock icon={NotebookPen} title="No journal entries yet" body={`What ${t.alters} write shows here, newest first.`} action={{ label: "Write the first one", icon: Plus, onClick: noop }} /></Cell>
      <Cell name="Loading: rows"><LoadingBlock rows={3} /></Cell>
      <Cell name="Loading: card"><LoadingBlock kind="card" /></Cell>
      <Cell name="Loading: text"><LoadingBlock kind="text" rows={3} /></Cell>
      <Cell name="Error: data safe, Try again"><ErrorBlock what="Couldn't load your journals" onRetry={noop} /></Cell>
      <Cell name="Error while trying again"><ErrorBlock what="Couldn't load your journals" onRetry={noop} retrying /></Cell>
      <Cell name="A save that failed"><ErrorBlock what="Not saved" detail="the storage is full" safe={false} onRetry={noop} /></Cell>
    </Grid>
  );
}

// ── Toast ────────────────────────────────────────────────────────────
function ToastStory() {
  const undoToast = { message: "Walk moved to trash.", detail: "In the trash for 30 days. Find it in Recent changes.", action: { label: "Undo" } };
  return (
    <Grid>
      <Cell name="With Undo (at least 10 s; stops while touched or focused)" wide><ToastCard toast={undoToast} onAction={noop} onClose={noop} /></Cell>
      <Cell name="Failed" wide><ToastCard toast={{ tone: "failed", message: "Couldn't delete Walk.", detail: "Your data is safe; anything already moved is in Recent changes → Trash." }} onClose={noop} /></Cell>
      <Cell name="A live one, at the foot of the screen">
        <Button rank="secondary" onClick={() => showToast({ ...undoToast, message: "Tea with Sam moved to trash.", action: { label: "Undo", onClick: () => showToast({ message: "Tea with Sam is back." }) } })}>Show an Undo toast</Button>
      </Cell>
    </Grid>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────
function SheetsStory() {
  const t = useTerms();
  const [half, setHalf] = useState(false);
  const [full, setFull] = useState(false);
  const [capture, setCapture] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [safety, setSafety] = useState(false);
  const [note, setNote] = useState("");
  const card = (
    <>
      <p className="ps-p">Call Sam: 0123 456 789. The calm room is the second door on the left.</p>
      <MedicalDisclaimer compact />
    </>
  );
  return (
    <>
      <Grid>
        <Cell name="Half (non-modal), drawn in place"><Sheet open inline title="Layers" onClose={noop}><p className="ps-p">The page above stays usable.</p></Sheet></Cell>
        <Cell name="Full, with a foot"><Sheet open inline size="full" title="Choose a place" onClose={noop} footer={<Button rank="primary">Done</Button>}><p className="ps-p">A picker's list.</p></Sheet></Cell>
        <Cell name="Holds typing (a stray tap never closes it)"><Sheet open inline holdsTyping title="Quick note" onClose={noop}><TextField label="Note" value="Half-filled" onChange={noop} /></Sheet></Cell>
        <Cell name="Confirm: asked once, focus on Keep it"><ConfirmSheet open inline thing="Walk" onConfirm={noop} onCancel={noop} /></Cell>
        <Cell name="Confirm: skips the trash"><ConfirmSheet open inline instant verb="Remove" thing="this reminder's alarm" onConfirm={noop} onCancel={noop} /></Cell>
        <Cell name="Safety: no app chrome, Support always there" wide><SafetySheet open inline title="My emergency card" onLeave={noop}>{card}</SafetySheet></Cell>
      </Grid>
      <div className="ps-row ps-open">
        <Button rank="secondary" onClick={() => setHalf(true)}>Open a half sheet</Button>
        <Button rank="secondary" onClick={() => setFull(true)}>Open a full sheet</Button>
        <Button rank="secondary" onClick={() => setCapture(true)}>Open a capture sheet</Button>
        <Button rank="secondary" onClick={() => setConfirm(true)}>Delete Walk…</Button>
        <Button rank="secondary" onClick={() => setSafety(true)}>Open the emergency card</Button>
      </div>
      <Sheet open={half} onClose={() => setHalf(false)} title="Layers"><LayersStory /></Sheet>
      <Sheet open={full} size="full" onClose={() => setFull(false)} title="Choose a place" footer={<Button rank="primary" onClick={() => setFull(false)}>Done</Button>}>
        <p className="ps-p">Tab stays inside this sheet; Escape or Back closes it.</p>
      </Sheet>
      <Sheet open={capture} holdsTyping onClose={() => setCapture(false)} title="Quick note">
        <TextField label="Note" hint={`A press outside won't close this. Escape keeps what you typed as a draft.`} value={note} onChange={setNote} />
      </Sheet>
      <ConfirmSheet open={confirm} thing="Walk" onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); showToast({ message: "Walk moved to trash.", detail: "In the trash for 30 days. Find it in Recent changes. (Example: nothing was deleted.)", action: { label: "Undo", onClick: () => showToast({ message: "Walk is back." }) } }); }} />
      <SafetySheet open={safety} title="My emergency card" onLeave={() => setSafety(false)}>{card}</SafetySheet>
      <p className="house-text-sm house-muted kit-note">{`These open over the page. Sizes: peek, half and full; the grab bar changes it. Example data for ${t.alters} only.`}</p>
    </>
  );
}

// ── Shared picker pop-ups in the house look ──────────────────────────
function PopupsStory({ alters, groups }) {
  const t = useTerms();
  const [who, setWho] = useState(null);
  const [g, setG] = useState(null);
  const [c, setC] = useState("#6C8CFF");
  const opts = groups.map((x) => ({ id: x.id, label: x.name || "Unnamed", _depth: 0 }));
  return (
    <Grid>
      <Cell name={`${t.Alter} picker: open it`}><AlterPicker label="Who wrote it" value={who} onChange={setWho} alters={alters.filter((a) => !String(a.id).startsWith("ex-"))} /></Cell>
      <Cell name="Nested list: open it"><NestedPicker label="Group" value={g} onChange={setG} options={opts} placeholder="Choose a group" allowClear /></Cell>
      <Cell name="Colour: open it"><ColourField label="Colour" value={c} onChange={setC} /></Cell>
    </Grid>
  );
}

function Body() {
  const t = useTerms();
  const { alters, groups, plans } = useExample();
  return (
    <main className="kit-main">
      <header className="kit-header ks-head">
        <h1 className="house-label house-text-xl">Panels, content and sheets</h1>
        <p className="house-text-sm house-muted">{`The rest of the new house's kit, in your colours, with the example ${t.system}. A preview: nothing here is saved.`}</p>
        <KitNav />
      </header>
      <Section id="panel" title="Panels" note="A title bar, tools, and a fold that says what it folds."><Panels /></Section>
      <Section id="tabs" title="Page tabs" note="Sections of one page: bold with a 3 px line, one row."><PageTabsStory /></Section>
      <Section id="list" title="Lists at 2, 12 and 200" note="Keyboard: arrows, Home, End and the first letter. Over 200 rows, 100 at a time."><Lists plans={plans} /></Section>
      <Section id="tree" title="Trees" note="Nothing is hidden by a bad record: loops and lost parents show at the top."><Trees groups={groups} /></Section>
      <Section id="info" title="Info" note="The read view of a record. Edit opens one row in place."><InfoStory alters={alters} /></Section>
      <Section id="inspector" title="Inspector" note="Fixed tabs, rows with the number beside them, Reset at each tab's foot, Remove under ⋯."><InspectorStory /></Section>
      <Section id="layers" title="Layers" note="Show, hide and reorder by buttons or Alt + arrows."><LayersStory /></Section>
      <Section id="content" title="Rows, cards, stats and chips"><ContentStory alters={alters} /></Section>
      <Section id="charts" title="Charts" note="Always a legend and a table of the same numbers."><ChartsStory /></Section>
      <Section id="states" title="Empty, loading and error"><StatesStory /></Section>
      <Section id="toast" title="Toast with Undo"><ToastStory /></Section>
      <Section id="sheets" title="Sheets"><SheetsStory /></Section>
      <Section id="popups" title="Shared pickers' pop-ups" note="Today's pickers, their pop-ups in the house look. Outside the house they look as they always did."><PopupsStory alters={alters} groups={groups} /></Section>
    </main>
  );
}

export default function PanelsSample() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Panels, content and sheets";
    return () => { document.title = prev; };
  }, []);
  return (
    <HouseRoot className="kit-root">
      <Body />
      <ToastHost />
    </HouseRoot>
  );
}
