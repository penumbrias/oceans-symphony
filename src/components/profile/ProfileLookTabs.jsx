// A profile's look, as inspector tabs (v0.310.0) — built to
// docs/inspector-design-guide.md and mounted inside Profile style
// (ProfileLookSheet, its own sheet since v0.312.1), and, for the defaults
// of new/empty profiles (profileLookDefaults.js), inside Display options. This replaces the old
// "Profile style" accordion (ProfileStyleEditor) and the Look tab of Alter
// info.
//
//   Content — the header: shown or not, and what else it shows (alters).
//   Text    — font and text colours, for Body | Header.
//   Colour  — the page's colours and wave, the background picture and its
//             opacities, the page song; the header's colours and picture.
//   Styles  — copy header ↔ body, keep them matched, reset the whole look.
//
// The look is the PS.* keys on the record's custom_fields (profileStyle.js);
// nothing stored moved or was renamed. Every change writes at once through
// patchProfileLook (fresh read, key by key) after a short debounce, so the
// page behind the sheet shows it as you drag.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, FileText, Type, Palette, Star as StarIcon } from "lucide-react";
import { toast } from "sonner";
import { Row, StackedRow, Group, SwitchRow, Segmented, ChoiceRow, SliderRow, ColourRow, TabBar, ResetRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import FontUploadButton from "@/components/shared/FontUploadButton";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import AlterImagePoolManager from "@/components/alters/AlterImagePoolManager";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useProfileFonts, fontStackFor } from "@/lib/profileFonts";
import { useTerms } from "@/lib/useTerms";
import { PS, readProfileBg } from "@/lib/profileStyle";
import { patchProfileLook, LOOK_QUERY_KEYS, PROFILE_LOOK_KEYS, isLookDefaultsSubject } from "@/lib/lookSubject";

// Body ↔ header pairs: the palette, text, font and background opacity.
// Pictures are never copied (a banner and a page picture usually differ).
const SYNC_PAIRS = [
  [PS.BG_COLOR, PS.HEADER_BG],
  [PS.THEME_SURFACE, PS.HEADER_THEME_SURFACE],
  [PS.THEME_PRIMARY, PS.HEADER_THEME_PRIMARY],
  [PS.THEME_SECONDARY, PS.HEADER_THEME_SECONDARY],
  [PS.THEME_ACCENT, PS.HEADER_THEME_ACCENT],
  [PS.THEME_MUTED, PS.HEADER_THEME_MUTED],
  [PS.THEME_TEXT, PS.HEADER_TEXT],
  [PS.THEME_TEXT2, PS.HEADER_THEME_TEXT2],
  [PS.PAGE_FONT, PS.HEADER_FONT],
  [PS.BG_OPACITY, PS.HEADER_BG_OPACITY],
];
const SYNC_MAP = {};
for (const [b, h] of SYNC_PAIRS) { SYNC_MAP[b] = h; SYNC_MAP[h] = b; }
// The body "Text" colour also sets the legacy inline page colour, so text
// that isn't a Tailwind utility (currentColor) changes too.
const SHADOW = { [PS.THEME_TEXT]: PS.PAGE_TEXT };

// Which CSS variable each colour key resolves to when it isn't set — the
// swatch then shows the real colour on the page (the app theme or this
// profile's), greyed and dashed.
const LIVE_VAR = {
  [PS.BG_COLOR]: "--color-bg", [PS.THEME_SURFACE]: "--color-surface", [PS.THEME_PRIMARY]: "--color-primary",
  [PS.THEME_SECONDARY]: "--color-secondary", [PS.THEME_ACCENT]: "--color-accent", [PS.THEME_MUTED]: "--color-muted",
  [PS.THEME_TEXT]: "--color-text-primary", [PS.THEME_TEXT2]: "--color-text-secondary", [PS.THEME_WAVE]: "--color-wave",
  [PS.HEADER_BG]: "--color-bg", [PS.HEADER_THEME_SURFACE]: "--color-surface", [PS.HEADER_THEME_PRIMARY]: "--color-primary",
  [PS.HEADER_THEME_SECONDARY]: "--color-secondary", [PS.HEADER_THEME_ACCENT]: "--color-accent", [PS.HEADER_THEME_MUTED]: "--color-muted",
  [PS.HEADER_TEXT]: "--color-text-primary", [PS.HEADER_THEME_TEXT2]: "--color-text-secondary",
};

const WAVE_OPTIONS = [
  { value: "", label: "Off" },
  { value: "var(--color-bg)", label: "Background" },
  { value: "var(--color-surface)", label: "Surface" },
  { value: "var(--color-primary)", label: "Primary" },
  { value: "var(--color-secondary)", label: "Secondary" },
  { value: "var(--color-accent)", label: "Accent" },
  { value: "var(--color-muted)", label: "Muted" },
  { value: "var(--color-text-primary)", label: "Text" },
  { value: "var(--color-text-secondary)", label: "Text 2nd" },
  { value: "custom", label: "Custom" },
];

const TAB_KEYS = {
  content: [PS.HIDE_HEADER, PS.HEADER_SHOW_GROUPS, PS.HEADER_SHOW_SUBSYSTEMS, PS.HEADER_SHOW_FIELDS, PS.HEADER_SHOW_ALTER_FIELDS, PS.HEADER_SHOW_PRONOUNS, PS.HEADER_CHIP_MODE],
  text: [PS.PAGE_FONT, PS.HEADER_FONT, PS.THEME_TEXT, PS.PAGE_TEXT, PS.THEME_TEXT2, PS.HEADER_TEXT, PS.HEADER_THEME_TEXT2],
  colour: [
    PS.BG_COLOR, PS.THEME_SURFACE, PS.THEME_PRIMARY, PS.THEME_SECONDARY, PS.THEME_ACCENT, PS.THEME_MUTED, PS.THEME_WAVE, PS.THEME_BG,
    PS.BG_IMAGE, PS.BG_ROTATION, PS.BG_OPACITY, PS.READABILITY, PS.SONG,
    PS.HEADER_BG, PS.HEADER_BG_OPACITY, PS.HEADER_THEME_SURFACE, PS.HEADER_THEME_PRIMARY, PS.HEADER_THEME_SECONDARY,
    PS.HEADER_THEME_ACCENT, PS.HEADER_THEME_MUTED, PS.HEADER_IMAGE, PS.HEADER_OPACITY,
  ],
};

// The colour a CSS variable has on the profile page right now.
function liveColor(cssVar) {
  try {
    const el = document.querySelector(".os-pf") || document.documentElement;
    const v = getComputedStyle(el).getPropertyValue(cssVar).trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : (v || "");
  } catch { return ""; }
}
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ""));

function PictureRow({ label, hint, url, onPick, onClear, ownerAlterId = null, ownerAlterName = "" }) {
  const resolved = useResolvedAvatarUrl(url || "");
  return (
    <Row label={label} hint={hint} align="start">
      <span className="flex items-center gap-1.5">
        {resolved && (
          <span className="w-10 h-8 rounded-lg border border-border overflow-hidden flex items-center justify-center bg-muted/30">
            <img src={resolved} alt="" className="w-full h-full object-cover" />
          </span>
        )}
        <AssetButton onPick={onPick} title={`${label} — choose a picture`} ownerAlterId={ownerAlterId} ownerAlterName={ownerAlterName} />
        {url && (
          <button type="button" onClick={onClear} aria-label={`${label} — remove`} title="Remove"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-destructive">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    </Row>
  );
}

function FontRow({ label, value, onChange }) {
  const fonts = useProfileFonts();
  const options = useMemo(() => fonts.map((f) => ({ id: f.id, label: f.isUpload ? `${f.label} · yours` : f.label })), [fonts]);
  const known = options.some((o) => o.id === (value || ""));
  return (
    <Row label={label} align="start" own={!!value} onClear={() => onChange("")}>
      <span className="flex items-center gap-1.5 w-[11.5rem] max-w-full">
        <span className="flex-1 min-w-0" style={{ fontFamily: fontStackFor(value) || undefined }}>
          <SearchableSelect value={value || ""} onChange={(id) => onChange(id || "")}
            options={known ? options : [{ id: value, label: "Custom font" }, ...options]} placeholder="Default" />
        </span>
        <FontUploadButton onUploaded={(family) => onChange(family)} />
      </span>
    </Row>
  );
}

// `onDraft(changes)`: edit a look that isn't stored yet (the new-alter
// sheet, v0.320.0). Every change goes to the caller's draft instead of the
// record — the caller passes the draft back as `subject.customFields`. A
// picture pool belongs to one saved alter, so rotation stays off here too.
export default function ProfileLookTabs({ subject, tab, onTab, onDraft = null }) {
  const t = useTerms();
  const qc = useQueryClient();
  const { type, id } = subject;
  const isAlter = type === "alter";
  // The defaults for new/empty profiles of this type (profileLookDefaults.js)
  // use the same tabs; a picture pool belongs to one alter, so rotation
  // stays off here.
  const forDefaults = isLookDefaultsSubject(subject);
  const draft = typeof onDraft === "function";
  const pictureOwnerId = isAlter && !forDefaults && !draft ? id : null;
  const subsystemTerm = `sub${t.system}`;

  // The draft: the record's look plus edits not yet written. Re-seeded
  // when the record changes under us and nothing is pending.
  const [cf, setCf] = useState(() => ({ ...(subject.customFields || {}) }));
  const pending = useRef({});
  const timer = useRef(null);
  const subjectKey = `${type}:${id}`;
  const lastKey = useRef(subjectKey);
  useEffect(() => {
    if (lastKey.current !== subjectKey) {
      lastKey.current = subjectKey;
      pending.current = {};
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setCf({ ...(subject.customFields || {}) });
      return;
    }
    if (Object.keys(pending.current).length === 0 && !timer.current) setCf({ ...(subject.customFields || {}) });
  }, [subject.customFields, subjectKey]);

  const flush = async () => {
    timer.current = null;
    const changes = pending.current;
    pending.current = {};
    if (!Object.keys(changes).length) return;
    if (draft) { onDraft(changes); return; }
    try {
      await patchProfileLook({ type, id }, changes);
      for (const key of LOOK_QUERY_KEYS[type]?.(id) || []) qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e?.message || "Couldn't save the look");
    }
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [matched, setMatched] = useState(false);
  const write = (changes) => {
    const all = { ...changes };
    for (const [k, v] of Object.entries(changes)) {
      if (SHADOW[k]) all[SHADOW[k]] = v;
      if (matched && SYNC_MAP[k]) all[SYNC_MAP[k]] = v;
    }
    setCf((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(all)) { if (v === undefined) delete next[k]; else next[k] = v; }
      return next;
    });
    pending.current = { ...pending.current, ...all };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 250);
  };
  const set = (key, val) => write({ [key]: val });
  const clear = (key) => write({ [key]: undefined });
  const resetKeys = (keys) => write(Object.fromEntries(keys.map((k) => [k, undefined])));

  const ps = readProfileBg(cf);
  const [poolOpen, setPoolOpen] = useState(false);
  const [side, setSide] = useState("body");
  const ownerName = subject.label || "";

  const colourRow = (key, label, hint = null) => (
    <ColourRow key={key} label={label} hint={hint} value={isHex(cf[key]) ? cf[key] : ""} live={liveColor(LIVE_VAR[key] || "--color-bg")}
      onChange={(hex) => set(key, hex)} onClear={() => clear(key)} />
  );
  const pct = (v) => Math.round(v * 100);
  const opacityRow = (key, label, fallback, hint = null) => (
    <SliderRow label={label} hint={hint} value={cf[key] !== undefined ? pct(Number(cf[key])) : undefined} fallback={pct(fallback)}
      min={0} max={100} step={1} unit="%" onChange={(v) => set(key, Math.max(0.02, Math.min(1, v / 100)))} onClear={() => clear(key)} />
  );

  const tabs = [
    { id: "content", label: "Content", icon: FileText, dot: TAB_KEYS.content.some((k) => cf[k] !== undefined) },
    { id: "text", label: "Text", icon: Type, dot: TAB_KEYS.text.some((k) => cf[k] !== undefined) },
    { id: "colour", label: "Colour", icon: Palette, dot: TAB_KEYS.colour.some((k) => cf[k] !== undefined) },
    { id: "styles", label: "Styles", icon: StarIcon },
  ];

  const wave = cf[PS.THEME_WAVE] || "";
  const waveChoice = !wave ? "" : (WAVE_OPTIONS.some((o) => o.value === wave) ? wave : "custom");

  const copy = (direction) => {
    const changes = {};
    for (const [bodyKey, headerKey] of SYNC_PAIRS) {
      const [from, to] = direction === "headerToBody" ? [headerKey, bodyKey] : [bodyKey, headerKey];
      const v = cf[from];
      changes[to] = v === undefined || v === "" || v === null ? undefined : v;
    }
    write(changes);
    toast.success(direction === "headerToBody" ? "Header colours copied to the body" : "Body colours copied to the header");
  };
  const resetAll = async () => {
    if (!(await confirm({ title: forDefaults ? "Reset the defaults?" : "Reset the whole look?", body: forDefaults ? "New and empty profiles go back to the app's look. Profiles with their own Profile style are untouched." : "Colours, pictures, fonts, the song and the header options go back to the app's look. The page's content is untouched.", confirmLabel: "Reset", destructive: true }))) return;
    resetKeys(PROFILE_LOOK_KEYS);
  };

  return (
    <div data-profile-look={type} data-profile-look-defaults={forDefaults ? "" : undefined}>
      <div className="sticky -top-1 z-10 -mx-4 bg-background">
        <TabBar tabs={tabs} value={tab} onChange={onTab} />
      </div>
      {forDefaults && (
        <p className="text-[0.6875rem] text-muted-foreground pt-2">
          {subject.hint || "The look every profile of this kind starts with. A profile's own Profile style always wins, setting by setting."}
        </p>
      )}
      <div role="tabpanel" aria-labelledby={`inspector-tab-${tab}`} className="pt-2">
        {tab === "content" && (
          <>
            <Group title="Header" first>
              <SwitchRow label="Show the header" hint="The avatar, name, pronouns and role at the top. Hiding it deletes nothing."
                checked={!cf[PS.HIDE_HEADER]} onChange={(on) => set(PS.HIDE_HEADER, on ? undefined : true)} />
              {isAlter && (
                <>
                  <SwitchRow label="Show groups" checked={!!cf[PS.HEADER_SHOW_GROUPS]} onChange={(on) => set(PS.HEADER_SHOW_GROUPS, on ? true : undefined)} />
                  <SwitchRow label={`Show ${subsystemTerm}s`} checked={!!cf[PS.HEADER_SHOW_SUBSYSTEMS]} onChange={(on) => set(PS.HEADER_SHOW_SUBSYSTEMS, on ? true : undefined)} />
                  <SwitchRow label="Show custom fields" checked={!!cf[PS.HEADER_SHOW_FIELDS]} onChange={(on) => set(PS.HEADER_SHOW_FIELDS, on ? true : undefined)} />
                  <SwitchRow label={`Show ${t.alter}-specific custom fields`} checked={!!cf[PS.HEADER_SHOW_ALTER_FIELDS]} onChange={(on) => set(PS.HEADER_SHOW_ALTER_FIELDS, on ? true : undefined)} />
                  <SwitchRow label="Always show pronouns" checked={!!cf[PS.HEADER_SHOW_PRONOUNS]} onChange={(on) => set(PS.HEADER_SHOW_PRONOUNS, on ? true : undefined)} />
                  <ChoiceRow label={`Group and ${subsystemTerm} chips`} value={cf[PS.HEADER_CHIP_MODE] || "both"}
                    own={!!cf[PS.HEADER_CHIP_MODE]} onClear={() => clear(PS.HEADER_CHIP_MODE)}
                    onChange={(v) => set(PS.HEADER_CHIP_MODE, v)}
                    options={[{ value: "icon", label: "Icon" }, { value: "name", label: "Name" }, { value: "both", label: "Both" }]} />
                  <p className="text-[0.6875rem] text-muted-foreground py-1.5">What the header shows moves up there instead of showing further down the page. Group and {subsystemTerm} chips link to their pages.</p>
                </>
              )}
            </Group>
            <ResetRow onReset={() => resetKeys(TAB_KEYS.content)} />
          </>
        )}

        {tab === "text" && (
          <>
            <Segmented label="Text" value={side} onChange={setSide}
              options={[{ value: "body", label: "Body" }, { value: "header", label: "Header" }]} />
            <div className="pt-1">
              {side === "body" ? (
                <>
                  <FontRow label="Font" value={cf[PS.PAGE_FONT] || ""} onChange={(v) => (v ? set(PS.PAGE_FONT, v) : clear(PS.PAGE_FONT))} />
                  {colourRow(PS.THEME_TEXT, "Text colour")}
                  {colourRow(PS.THEME_TEXT2, "Second text colour", "Captions and hints")}
                </>
              ) : (
                <>
                  <FontRow label="Font" value={cf[PS.HEADER_FONT] || ""} onChange={(v) => (v ? set(PS.HEADER_FONT, v) : clear(PS.HEADER_FONT))} />
                  {colourRow(PS.HEADER_TEXT, "Text colour")}
                  {colourRow(PS.HEADER_THEME_TEXT2, "Second text colour")}
                </>
              )}
            </div>
            <ResetRow onReset={() => resetKeys(TAB_KEYS.text)} />
          </>
        )}

        {tab === "colour" && (
          <>
            <Segmented label="Colour" value={side} onChange={setSide}
              options={[{ value: "body", label: "Body" }, { value: "header", label: "Header" }]} />
            {side === "body" ? (
              <>
                <Group title="Page colours">
                  {colourRow(PS.BG_COLOR, "Background", ps.hasImage ? "With a picture set, this fills the cards and entry boxes" : null)}
                  {colourRow(PS.THEME_SURFACE, "Surface")}
                  {colourRow(PS.THEME_PRIMARY, "Primary")}
                  {colourRow(PS.THEME_SECONDARY, "Secondary")}
                  {colourRow(PS.THEME_ACCENT, "Accent")}
                  {colourRow(PS.THEME_MUTED, "Muted")}
                  <ChoiceRow label="Wave" hint="The wave on the header banner" value={waveChoice}
                    own={!!wave} onClear={() => clear(PS.THEME_WAVE)}
                    onChange={(v) => (v === "custom" ? set(PS.THEME_WAVE, liveColor("--color-primary") || "#8b5cf6") : v ? set(PS.THEME_WAVE, v) : clear(PS.THEME_WAVE))}
                    options={WAVE_OPTIONS} />
                  {waveChoice === "custom" && colourRow(PS.THEME_WAVE, "Wave colour")}
                </Group>
                <Group title="Background">
                  <PictureRow label="Picture" url={cf[PS.BG_IMAGE] || ""} onPick={(url) => set(PS.BG_IMAGE, url)} onClear={() => clear(PS.BG_IMAGE)}
                    ownerAlterId={pictureOwnerId} ownerAlterName={pictureOwnerId ? ownerName : ""} />
                  {isAlter && !forDefaults && !draft && (
                    <ChoiceRow label="Rotation" hint="Cycle through a pool of pictures on each app open" value={cf[PS.BG_ROTATION] || "off"}
                      own={!!cf[PS.BG_ROTATION]} onClear={() => clear(PS.BG_ROTATION)}
                      onChange={(v) => set(PS.BG_ROTATION, v)}
                      options={[{ value: "off", label: "Off" }, { value: "random", label: "Random" }, { value: "sequential", label: "In order" }]} />
                  )}
                  {isAlter && !forDefaults && !draft && (cf[PS.BG_ROTATION] || "off") !== "off" && (
                    <Row label="Pool pictures">
                      <button type="button" onClick={() => setPoolOpen(true)}
                        className="h-8 px-3 rounded-lg border border-border/60 text-xs hover:bg-muted/40">Manage…</button>
                    </Row>
                  )}
                  {ps.hasImage
                    ? (
                      <>
                        {opacityRow(PS.BG_OPACITY, "Picture opacity", 0.5)}
                        {opacityRow(PS.READABILITY, "Surface opacity", 0.9, "How solid the cards and entry boxes are over the picture")}
                      </>
                    )
                    : ps.bgColor ? opacityRow(PS.BG_OPACITY, "Background opacity", 0.15) : null}
                </Group>
                <Group title="Song">
                  <StackedRow label="Page song" hint={forDefaults ? "Plays when a profile without its own song opens" : "Plays when the profile opens"}>
                    <ProfileSongPicker value={cf[PS.SONG] || null} onChange={(v) => (v ? set(PS.SONG, v) : clear(PS.SONG))} subjectLabel="page" />
                  </StackedRow>
                </Group>
              </>
            ) : (
              <>
                <Group title="Header colours">
                  {colourRow(PS.HEADER_BG, "Background")}
                  {cf[PS.HEADER_BG] && opacityRow(PS.HEADER_BG_OPACITY, "Background opacity", 1)}
                  {colourRow(PS.HEADER_THEME_SURFACE, "Surface")}
                  {colourRow(PS.HEADER_THEME_PRIMARY, "Primary")}
                  {colourRow(PS.HEADER_THEME_SECONDARY, "Secondary")}
                  {colourRow(PS.HEADER_THEME_ACCENT, "Accent")}
                  {colourRow(PS.HEADER_THEME_MUTED, "Muted")}
                </Group>
                <Group title="Header picture">
                  <PictureRow label="Picture" hint="The banner behind the name" url={cf[PS.HEADER_IMAGE] || ""} onPick={(url) => set(PS.HEADER_IMAGE, url)} onClear={() => clear(PS.HEADER_IMAGE)}
                    ownerAlterId={pictureOwnerId} ownerAlterName={pictureOwnerId ? ownerName : ""} />
                  {cf[PS.HEADER_IMAGE] && opacityRow(PS.HEADER_OPACITY, "Picture opacity", 0.45)}
                </Group>
              </>
            )}
            <ResetRow onReset={() => resetKeys(TAB_KEYS.colour)} />
          </>
        )}

        {tab === "styles" && (
          <>
            <Group title="Header and body" first>
              <Row label="Copy the body's colours to the header">
                <button type="button" onClick={() => copy("bodyToHeader")} className="h-8 px-3 rounded-lg border border-border/60 text-xs hover:bg-muted/40">Copy</button>
              </Row>
              <Row label="Copy the header's colours to the body">
                <button type="button" onClick={() => copy("headerToBody")} className="h-8 px-3 rounded-lg border border-border/60 text-xs hover:bg-muted/40">Copy</button>
              </Row>
              <SwitchRow label="Keep them matched" hint="While this is on, a colour set on one side is set on the other too" checked={matched} onChange={setMatched} />
            </Group>
            <Group title="Reset">
              <Row label="Reset the whole look" hint="Back to the app's look; the page's content stays">
                <button type="button" onClick={resetAll} className="h-8 px-3 rounded-lg border border-destructive/40 text-xs text-destructive hover:bg-destructive/10">Reset…</button>
              </Row>
            </Group>
          </>
        )}
      </div>
      {isAlter && !forDefaults && !draft && (
        <AlterImagePoolManager open={poolOpen} onClose={() => setPoolOpen(false)} alterId={id} role="background" />
      )}
    </div>
  );
}
