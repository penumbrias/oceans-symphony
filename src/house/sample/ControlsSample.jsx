// The story sheet for new-house step 1.2: every kit control in every state,
// in the person's own paint. Unlinked on purpose (reached from /house/kit or
// by typing /house/kit/controls). Nothing here writes anything: every
// control changes only this page's own state.
//
// Hover, focus and pressed can't be held still for a picture, so cells
// marked data-force="hover" / "focus-visible" / "active" are put into that
// state by the proof-grid script (scripts/house-grid.mjs) through the
// browser's own "force element state", so the picture shows the REAL rule.

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Rows3, Save, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { flattenGroupTree } from "@/lib/groupTree";
import { toDay } from "@/house/kit/values";
import HouseRoot from "@/house/tokens/HouseRoot";
import {
  Button, IconButton, SaveState, TextField, AuthoredField, NumberField, DateField, TimeField, DurationField,
  Form, FormRow, Checkbox, RadioGroup, Switch, Segmented, FilterChips, SliderRow, Menu,
  AlterPicker, NestedPicker, ColourField, IconField, AssetField,
} from "@/house/kit";
import "@/house/sample/kitSample.css";
import "@/house/sample/controlsSample.css";

const LONG = "Ashwood-under-the-old-lighthouse-steps!"; // 40 characters
const noop = () => {};

function Section({ id, title, note, children }) {
  return (
    <section className="kit-section" aria-labelledby={`ks-${id}`} data-story={id}>
      <h2 id={`ks-${id}`} className="house-label house-text-lg kit-section-title">{title}</h2>
      {note ? <p className="house-text-sm house-muted kit-note">{note}</p> : null}
      {children}
    </section>
  );
}

// One state of one control, with its name under it.
function Cell({ name, children, wide = false }) {
  return (
    <div className={`ks-cell${wide ? " ks-cell--wide" : ""}`}>
      <div className="ks-cell-body">{children}</div>
      <span className="house-text-xs house-muted ks-cell-name">{name}</span>
    </div>
  );
}

function Grid({ children }) { return <div className="ks-grid">{children}</div>; }

// ── Buttons ──────────────────────────────────────────────────────────
function Buttons() {
  const ranks = [["primary", "Save"], ["secondary", "Cancel"], ["quiet", "Show more"], ["danger", "Delete Walk"]];
  return (
    <>
      {ranks.map(([rank, words]) => (
        <div key={rank} className="ks-rank">
          <h3 className="house-label house-text-sm ks-rank-title">{rank[0].toUpperCase() + rank.slice(1)}</h3>
          <Grid>
            <Cell name="Rest"><Button rank={rank}>{words}</Button></Cell>
            <Cell name="Hover"><Button rank={rank} data-force="hover">{words}</Button></Cell>
            <Cell name="Pressed"><Button rank={rank} data-pressed="true">{words}</Button></Cell>
            <Cell name="Focus"><Button rank={rank} data-force="focus-visible">{words}</Button></Cell>
            <Cell name="Busy"><Button rank={rank} busy busyLabel={rank === "danger" ? "Deleting…" : "Saving…"}>{words}</Button></Cell>
            <Cell name="Disabled, with the reason"><Button rank={rank} disabledReason="Pick a time first">{words}</Button></Cell>
            <Cell name="With an icon"><Button rank={rank} icon={rank === "danger" ? Trash2 : Save}>{words}</Button></Cell>
          </Grid>
        </div>
      ))}
      <div className="ks-rank">
        <h3 className="house-label house-text-sm ks-rank-title">Icon buttons (44 × 44, always named)</h3>
        <Grid>
          <Cell name="Quiet"><IconButton icon={MoreHorizontal} label="More for Walk" /></Cell>
          <Cell name="Hover"><IconButton icon={MoreHorizontal} label="More for Walk (hover)" data-force="hover" /></Cell>
          <Cell name="Focus"><IconButton icon={Pencil} label="Edit Walk" data-force="focus-visible" /></Cell>
          <Cell name="Secondary"><IconButton icon={Plus} label="Add a plan" rank="secondary" /></Cell>
          <Cell name="Primary"><IconButton icon={Download} label="Save a copy" rank="primary" /></Cell>
          <Cell name="Busy"><IconButton icon={Download} label="Saving a copy" busy /></Cell>
          <Cell name="Disabled, with the reason"><IconButton icon={Copy} label="Copy Walk" disabledReason="Nothing to copy yet" /></Cell>
        </Grid>
      </div>
      <Cell name="Long words wrap; they never clip" wide>
        <Button rank="secondary">Keep {LONG} as it is and come back later</Button>
      </Cell>
    </>
  );
}

// ── Fields ───────────────────────────────────────────────────────────
function Fields() {
  const t = useTerms();
  const [text, setText] = useState("Walk by the river");
  const [authored, setAuthored] = useState("");
  const [num, setNum] = useState(3);
  const [day, setDay] = useState(toDay(new Date()));
  const [time, setTime] = useState("21:30");
  const [dur, setDur] = useState(90);
  return (
    <>
      <h3 className="house-label house-text-sm ks-rank-title">Text</h3>
      <Grid>
        <Cell name="Empty, with a hint"><TextField label="Title" hint="A few words is plenty." value="" placeholder="What was it?" onChange={noop} /></Cell>
        <Cell name="Filled"><TextField label="Title" value={text} onChange={setText} /></Cell>
        <Cell name="Focus"><TextField label="Title" value={text} onChange={setText} data-force="focus-visible" /></Cell>
        <Cell name="Error"><TextField label="Title" value="" onChange={noop} error="Give it a title so you can find it later." /></Cell>
        <Cell name="Saving"><TextField label="Title" value={text} onChange={noop} save={{ state: "saving" }} /></Cell>
        <Cell name="Saved"><TextField label="Title" value={text} onChange={noop} save={{ state: "saved" }} /></Cell>
        <Cell name="Failed"><TextField label="Title" value={text} onChange={noop} save={{ state: "failed", error: "storage is full", onRetry: noop }} /></Cell>
        <Cell name="Disabled"><TextField label="Title" value={text} onChange={noop} disabled hint="Locked while a sync runs." /></Cell>
        <Cell name="40 characters"><TextField label={`${t.Alter} name`} value={LONG} onChange={noop} /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Authored text (the full grammar)</h3>
      <Grid>
        <Cell name="Empty" wide>
          <AuthoredField label="Note" hint={`Type @ to mention ${t.alters}, - or + to sign, and your command symbol for commands.`} value={authored} onChange={setAuthored} rows={3} />
        </Cell>
        <Cell name="Error, typing kept" wide>
          <AuthoredField label="Note" value="~sleep 7h quality=" onChange={noop} rows={2} toolbar={false} error="That command isn't finished: add a quality from 1 to 5." />
        </Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Number</h3>
      <Grid>
        <Cell name="Value"><NumberField label="Energy" value={num} onChange={setNum} min={0} max={5} unit="of 5" /></Cell>
        <Cell name="At the smallest"><NumberField label="Energy" value={0} onChange={noop} min={0} max={5} unit="of 5" /></Cell>
        <Cell name="Error"><NumberField label="Glasses of water" value={null} onChange={noop} min={0} error="Type a number, like 3." /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Date (typed or chosen; no browser picker)</h3>
      <Grid>
        <Cell name="Empty"><DateField label="Due" value={null} onChange={noop} clearable hint="Type “fri”, “23 Nov” or “tomorrow”." /></Cell>
        <Cell name="Set"><DateField label="Due" value={day} onChange={setDay} /></Cell>
        <Cell name="Another year"><DateField label="First noticed" value="2019-03-14" onChange={noop} /></Cell>
        <Cell name="Error, typing kept"><DateField label="Due" value={null} onChange={noop} error="Couldn't read that as a date. Try “23 Nov”, “tomorrow” or “fri”." /></Cell>
        <Cell name="Calendar open" wide><DateField label="Due" value={day} onChange={setDay} openInline /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Time (on your clock)</h3>
      <Grid>
        <Cell name="Empty"><TimeField label="Starts" value={null} onChange={noop} clearable /></Cell>
        <Cell name="Set"><TimeField label="Starts" value={time} onChange={setTime} /></Cell>
        <Cell name="Saved"><TimeField label="Starts" value={time} onChange={setTime} save={{ state: "saved" }} /></Cell>
        <Cell name="List open" wide><TimeField label="Starts" value={time} onChange={setTime} openInline /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Duration</h3>
      <Grid>
        <Cell name="Set"><DurationField label="How long" value={dur} onChange={setDur} /></Cell>
        <Cell name="Empty"><DurationField label="How long" value={null} onChange={noop} clearable /></Cell>
        <Cell name="At zero"><DurationField label="How long" value={0} onChange={noop} /></Cell>
      </Grid>
    </>
  );
}

// ── Form row ─────────────────────────────────────────────────────────
function FormRows() {
  const t = useTerms();
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("River");
  const [draft, setDraft] = useState("River");
  return (
    <Form label="Example record">
      <FormRow label="Name" value={name} editing={editing === "name"}
        onEdit={() => { setDraft(name); setEditing("name"); }}
        onCancel={() => setEditing(null)} onSave={() => { setName(draft); setEditing(null); }}>
        <TextField label="Name" value={draft} onChange={setDraft} />
      </FormRow>
      <FormRow label="Pronouns" value="" empty="Not set yet" onEdit={noop} />
      <FormRow label={`${t.Alter} name, 40 characters`} value={LONG} onEdit={noop} />
      <FormRow label="Added" value="Mon 3 Mar 2025" lockedReason="Set when it was made" />
      <FormRow label="Role" value="Protector" editing onCancel={noop} onSave={noop} saving>
        <TextField label="Role" value="Protector" onChange={noop} save={{ state: "saving" }} />
      </FormRow>
      <FormRow label="Age" value="" editing onCancel={noop} onSave={noop} saveDisabledReason="Type an age, or Cancel">
        <NumberField label="Age" value={null} onChange={noop} min={0} max={150} error="Type a number, like 3." />
      </FormRow>
    </Form>
  );
}

// ── Choices ──────────────────────────────────────────────────────────
function Choices() {
  const t = useTerms();
  const [a, setA] = useState(true);
  const [sw, setSw] = useState(true);
  const [radio, setRadio] = useState("week");
  const [seg, setSeg] = useState("week");
  const [view, setView] = useState("grid");
  const [chips, setChips] = useState(["checkin", "status"]);
  const [size, setSize] = useState(16);
  const [inherited, setInherited] = useState(undefined);
  const kinds = [
    { value: "checkin", label: "Check-ins" }, { value: "status", label: "Statuses" }, { value: "sleep", label: "Sleep" },
    { value: "plans", label: "Plans" }, { value: "journal", label: "Journals" }, { value: "location", label: "Places" },
    { value: "front", label: `${t.Front} changes` },
  ];
  return (
    <>
      <h3 className="house-label house-text-sm ks-rank-title">Checkbox (a ✓, never an x)</h3>
      <Grid>
        <Cell name="Off"><Checkbox label="Took my meds" checked={false} onChange={noop} /></Cell>
        <Cell name="On"><Checkbox label="Took my meds" checked={a} onChange={setA} /></Cell>
        <Cell name="Mixed"><Checkbox label="All of today's tasks" mixed onChange={noop} /></Cell>
        <Cell name="Hover"><span data-force-parent="hover"><Checkbox label="Took my meds" checked={false} onChange={noop} /></span></Cell>
        <Cell name="Focus"><span data-force-input="focus-visible"><Checkbox label="Took my meds" checked onChange={noop} /></span></Cell>
        <Cell name="Done (struck, and says “done”)"><Checkbox label="Water the plants" checked done onChange={noop} /></Cell>
        <Cell name="Disabled, with the reason"><Checkbox label="Share with friends" checked={false} onChange={noop} disabledReason="Add a friend first" /></Cell>
        <Cell name="Long label wraps"><Checkbox label={`Remind ${LONG} about the appointment tomorrow`} checked onChange={noop} /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Radio</h3>
      <Grid>
        <Cell name="One of several, with descriptions" wide>
          <RadioGroup label="Repeat" value={radio} onChange={setRadio} options={[
            { value: "none", label: "Doesn't repeat" },
            { value: "day", label: "Every day" },
            { value: "week", label: "Every week", description: "On the same weekday" },
            { value: "month", label: "Every month", description: "On the same date" },
            { value: "custom", label: "Custom…", disabledReason: "Save it once first" },
          ]} />
        </Cell>
        <Cell name="Focus"><span data-force-input="focus-visible"><RadioGroup label="Clock" value="12" onChange={noop} options={[{ value: "12", label: "12-hour" }, { value: "24", label: "24-hour" }]} /></span></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Switch (takes effect at once)</h3>
      <Grid>
        <Cell name="Off"><Switch label="Reduce motion" checked={false} onChange={noop} /></Cell>
        <Cell name="On"><Switch label="Reduce motion" checked={sw} onChange={setSw} /></Cell>
        <Cell name="Focus"><Switch label="Reduce motion" checked data-force="focus-visible" onChange={noop} /></Cell>
        <Cell name="Disabled, with the reason"><Switch label="Back up every night" checked={false} onChange={noop} disabledReason="Choose a backup folder first" /></Cell>
        <Cell name="With a description"><Switch label="Sounds" description="Plays a soft chime when a reminder is due." checked onChange={noop} /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Segmented control</h3>
      <Grid>
        <Cell name="Text"><Segmented label="Show" value={seg} onChange={setSeg} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} /></Cell>
        <Cell name="With icons, labelled"><Segmented label="View" showLabel value={view} onChange={setView} options={[{ value: "grid", label: "Grid", icon: LayoutGrid }, { value: "list", label: "List", icon: List }, { value: "tree", label: "Tree", icon: Rows3 }]} /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Filter chips (one row; scrolls sideways)</h3>
      <Grid>
        <Cell name="All" wide><FilterChips label="Show" options={kinds.slice(0, 3)} value={[]} onChange={noop} /></Cell>
        <Cell name="Two on, more than fit" wide><FilterChips label="Show" options={kinds} value={chips} onChange={setChips} /></Cell>
      </Grid>
      <h3 className="house-label house-text-sm ks-rank-title">Slider row (the number beside it)</h3>
      <Grid>
        <Cell name="Its own value" wide><SliderRow label="Text size" value={size} onChange={setSize} min={10} max={32} unit="px" onClear={() => setSize(undefined)} /></Cell>
        <Cell name="Inherited (dashed)" wide><SliderRow label="Corner size" hint="From the app look" value={inherited} fallback={12} onChange={setInherited} min={0} max={24} unit="px" onClear={() => setInherited(undefined)} /></Cell>
      </Grid>
    </>
  );
}

// ── Menu ─────────────────────────────────────────────────────────────
function Menus() {
  const items = [
    { id: "dup", label: "Duplicate", icon: Copy, onSelect: noop },
    { id: "move", label: "Move to another day", disabledReason: "Plans that repeat move from the series" },
    { id: "del", label: "Delete Walk", icon: Trash2, danger: true, onSelect: noop },
  ];
  return (
    <Grid>
      <Cell name="Closed"><Menu label="More for Walk" items={items} /></Cell>
      <Cell name="With words"><Menu label="Sort" items={items.slice(0, 1)}>Sort</Menu></Cell>
      <Cell name="Open (Delete last, behind a line)" wide><Menu label="More for Walk (open)" items={items} openInline /></Cell>
    </Grid>
  );
}

// ── Pickers ──────────────────────────────────────────────────────────
function Pickers() {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const groupOptions = useMemo(() => flattenGroupTree(groups).map((g) => ({ id: g.id, label: g.name || "Unnamed", color: g.color, _depth: g._depth })), [groups]);
  const first = alters.find((x) => !x.is_archived);
  const [who, setWho] = useState(null);
  const [group, setGroup] = useState(null);
  const [colour, setColour] = useState("#6C8CFF");
  const [icon, setIcon] = useState({ iconName: "heart-handshake" });
  const [asset, setAsset] = useState(null);
  useEffect(() => { if (first && who == null) setWho(first.id); }, [first, who]);
  return (
    <Grid>
      <Cell name={`${t.Alter}: chosen`}><AlterPicker label={`Who wrote it`} value={who} onChange={setWho} hint={first ? `Shows ${t.alters} the way your label setting says (${formatAlter(first)}).` : undefined} /></Cell>
      <Cell name={`${t.Alter}: none yet`}><AlterPicker label={t.Fronter} value={null} onChange={noop} /></Cell>
      <Cell name="Nested list"><NestedPicker label={`Group or sub${t.system}`} value={group} onChange={setGroup} options={groupOptions} placeholder="Choose a group" allowClear /></Cell>
      <Cell name="Nested list, error"><NestedPicker label="Category" value={null} onChange={noop} options={[{ id: "a", label: "Self-care", _depth: 0 }, { id: "b", label: "Hygiene", _depth: 1 }, { id: "c", label: "Shower", _depth: 2 }]} error="Choose where it goes." /></Cell>
      <Cell name="Colour"><ColourField label="Colour" value={colour} onChange={setColour} /></Cell>
      <Cell name="Colour, saved"><ColourField label="Accent" value="#E5857A" onChange={noop} save={{ state: "saved" }} /></Cell>
      <Cell name="Icon"><IconField label="Icon" value={icon} onChange={setIcon} /></Cell>
      <Cell name="Picture from assets"><AssetField label="Picture" value={asset} onChange={setAsset} /></Cell>
    </Grid>
  );
}

function SaveStates() {
  return (
    <Grid>
      <Cell name="Saving"><SaveState state="saving" /></Cell>
      <Cell name="Saved"><SaveState state="saved" /></Cell>
      <Cell name="Failed, with Try again" wide><SaveState state="failed" error="the storage is full" onRetry={noop} /></Cell>
    </Grid>
  );
}

function Body() {
  const t = useTerms();
  return (
    <main className="kit-main">
      <header className="kit-header">
        <h1 className="house-label house-text-xl">Controls and pickers</h1>
        <p className="house-text-sm house-muted">Every control of the new house in every state, in your colours. A preview: nothing here is saved.</p>
        <Link to="/house/kit" className="house-text-sm kit-link">Tokens and scales</Link>
      </header>
      <Section id="buttons" title="Buttons" note="Three ranks and danger. Hover, pressed and focus each change shape, not only colour."><Buttons /></Section>
      <Section id="fields" title="Fields" note="Each has a label, a hint, an error and a place that says whether it saved."><Fields /></Section>
      <Section id="save" title="Saving, saved, not saved"><SaveStates /></Section>
      <Section id="formrow" title="Form rows" note="Editing a record looks like its Info: one row opens at a time, with Save and Cancel."><FormRows /></Section>
      <Section id="choices" title="Choices"><Choices /></Section>
      <Section id="menu" title="Menus" note="Arrows, Home, End and the first letter move; Escape closes."><Menus /></Section>
      <Section id="pickers" title="Pickers" note={`Today's shared pickers in the house's look: ${t.alters}, nested lists, colours, icons and pictures.`}><Pickers /></Section>
    </main>
  );
}

export default function ControlsSample() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Controls and pickers";
    return () => { document.title = prev; };
  }, []);
  return (
    <HouseRoot className="kit-root">
      <Body />
    </HouseRoot>
  );
}
