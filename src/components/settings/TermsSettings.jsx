import React, { useState, useEffect } from "react";

const PRESETS = [
  { label: "DID / OSDD (default)", system: "system", alter: "alter", switch: "switch", front: "front" },
  { label: "Headmates", system: "system", alter: "headmate", switch: "switch", front: "front" },
  { label: "Parts (IFS)", system: "system", alter: "part", switch: "shift", front: "influence" }, // gerund()/agent() drop the silent e (influencing / influencer) — same as the Guide
  { label: "Collective", system: "collective", alter: "member", switch: "switch", front: "front" },
];
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Languages, Save } from "lucide-react";
import { pluralize, gerund, agent } from "@/lib/useTerms";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { markTermsCustomizedToday } from "@/lib/dailyTaskSystem";
import { Row } from "@/components/shared/SettingRows";
import {
  COMMAND_WORD_TYPES, BUILT_IN_COMMAND_WORDS, BUILT_IN_WHISPER_WORDS, DEFAULT_COMMAND_SIGN,
  getCustomCommandWord, getWhisperWords, sanitizeCommandWord, isValidCommandSign,
} from "@/lib/commandTerms";
import {
  getTherapyKeyword, setTherapyKeyword, DEFAULT_THERAPY_KEYWORD, THERAPY_KEYWORD_EVENT,
} from "@/lib/therapyCommand";

// Each base word and the key of its plural override.
const PLURAL_KEY = { system: "systems", alter: "alters", switch: "switches", front: "fronts" };

export default function TermsSettings({ embedded = false } = {}) {
  const qc = useQueryClient();
  const terms = useTerms();
  const [vals, setVals] = useState({
    system: "", alter: "", switch: "", front: "",
    fronting: "", fronter: "", switching: "",
    systems: "", alters: "", switches: "", fronts: "",
    signpostAdd: "", signpostReplace: "",
  });
  // Command symbol + words. A blank word means "the built-in word".
  const [cmd, setCmd] = useState({ sign: DEFAULT_COMMAND_SIGN, words: {}, whisper: "", therapy: "" });
  const [commandError, setCommandError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signpostError, setSignpostError] = useState("");

  const applyPreset = (preset) => {
    setVals((p) => ({
      ...p,
      system: preset.system, alter: preset.alter, switch: preset.switch, front: preset.front,
      // Presets are regular bases — clear any overrides the user had.
      fronting: "", fronter: "", switching: "",
      systems: "", alters: "", switches: "", fronts: "",
    }));
  };

  // When the user edits a base term, the Advanced override fields that
  // were just mirroring the OLD base's auto-conjugation should reset to
  // empty so the new base re-drives them. Without this, typing "control"
  // into Front would leave `fronting: "fronting"` in the form (from the
  // initial load), which handleSave then persists as an explicit
  // override — so useTerms reads "control" + override "fronting" and
  // surfaces "fronting" instead of "controlling". Explicit overrides
  // the user typed themselves (e.g. "activating" for base "active") do
  // NOT match the auto-form, so they're preserved.
  const setBase = (key, value) => {
    setVals((prev) => {
      const next = { ...prev, [key]: value };
      // Same for the plural: an irregular plural belongs to the word it
      // was typed for ("children" must not outlive "child").
      const pk = PLURAL_KEY[key];
      if (pk && prev[key] !== value) next[pk] = "";
      if (key === "front") {
        if (prev.fronting && prev.fronting === gerund(prev.front)) next.fronting = "";
        if (prev.fronter && prev.fronter === agent(prev.front)) next.fronter = "";
      } else if (key === "switch") {
        if (prev.switching && prev.switching === gerund(prev.switch)) next.switching = "";
      }
      return next;
    });
  };

  useEffect(() => {
    setVals({
      system: terms.system,
      alter: terms.alter,
      switch: terms.switch,
      front: terms.front,
      // Show the resolved values (override or auto-derived) so the user
      // sees what's currently in effect; leaving them blank on save
      // means "fall back to auto" again.
      fronting: terms.fronting,
      fronter: terms.fronter,
      switching: terms.switching,
      systems: terms.systems,
      alters: terms.alters,
      switches: terms.switches,
      fronts: terms.fronts,
      signpostAdd: terms.signpostAdd || "+",
      signpostReplace: terms.signpostReplace || "-",
    });
  }, [terms.system, terms.alter, terms.switch, terms.front, terms.fronting, terms.fronter, terms.switching, terms.systems, terms.alters, terms.switches, terms.fronts, terms.signpostAdd, terms.signpostReplace]);

  // Load what's in effect (useTerms has just pushed the saved values into
  // commandTerms). The therapy word lives in localStorage, so follow its event.
  useEffect(() => {
    const load = () => {
      const therapy = getTherapyKeyword();
      const whisper = getWhisperWords().find((w) => !BUILT_IN_WHISPER_WORDS.includes(w)) || "";
      setCmd({
        sign: terms.commandSign || DEFAULT_COMMAND_SIGN,
        words: Object.fromEntries(COMMAND_WORD_TYPES.map(({ key }) => [key, getCustomCommandWord(key) || ""])),
        whisper,
        therapy: therapy === DEFAULT_THERAPY_KEYWORD ? "" : therapy,
      });
    };
    load();
    window.addEventListener(THERAPY_KEYWORD_EVENT, load);
    return () => window.removeEventListener(THERAPY_KEYWORD_EVENT, load);
  }, [terms.commandSign, terms.commandWordsSig]);

  // A signpost trigger must be a single symbol that can't blend into a name or
  // clash with the app's other inline syntax (@mention, /whisper, [ ] whisper
  // brackets, ~section signposts).
  const RESERVED_SIGNS = new Set(["@", "/", "[", "]", (cmd.sign || DEFAULT_COMMAND_SIGN).trim()]);
  const isValidSign = (ch) =>
    typeof ch === "string" && ch.length === 1 && !/[\w\s]/.test(ch) && !RESERVED_SIGNS.has(ch);

  // Validate + clean the command symbol and words. Returns { error } or the
  // values to save. A word equal to its own built-in one is stored blank.
  const checkCommands = (addSign, replaceSign) => {
    const sign = (cmd.sign || DEFAULT_COMMAND_SIGN).trim();
    if (!isValidCommandSign(sign, { signpostAdd: addSign, signpostReplace: replaceSign })) {
      return { error: "The command symbol must be one symbol that isn't a letter, number, space, a signpost symbol, or one of @ / [ ] < > : & ; \" ' =." };
    }
    const taken = new Map(); // word → what it already starts
    Object.entries(BUILT_IN_COMMAND_WORDS).forEach(([type, ws]) => ws.forEach((w) => taken.set(w, type)));
    const words = {};
    for (const { key, label } of COMMAND_WORD_TYPES) {
      const w = sanitizeCommandWord(cmd.words[key]);
      if (!w || BUILT_IN_COMMAND_WORDS[key].includes(w)) continue;
      if (taken.has(w)) return { error: `“${w}” already starts another command — pick another word for ${label}.` };
      taken.set(w, key);
      words[key] = w;
    }
    const therapy = sanitizeCommandWord(cmd.therapy) || DEFAULT_THERAPY_KEYWORD;
    if (taken.has(therapy)) return { error: `“${therapy}” already starts another command — pick another word for therapy notes.` };
    let whisper = sanitizeCommandWord(cmd.whisper);
    if (BUILT_IN_WHISPER_WORDS.includes(whisper)) whisper = "";
    return { sign, words, therapy, whisper };
  };

  const handleSave = async () => {
    // Validate the signpost triggers before saving — a bad sign would silently
    // break signposting everywhere.
    const addSign = (vals.signpostAdd || "+").trim();
    const replaceSign = (vals.signpostReplace || "-").trim();
    if (!isValidSign(addSign) || !isValidSign(replaceSign)) {
      setSignpostError(`Each signpost trigger must be a single symbol (not a letter, number, space, or one of @ / [ ] ${(cmd.sign || DEFAULT_COMMAND_SIGN).trim()}).`);
      return;
    }
    if (addSign === replaceSign) {
      setSignpostError("The add and replace triggers must be different.");
      return;
    }
    setSignpostError("");
    const command = checkCommands(addSign, replaceSign);
    if (command.error) { setCommandError(command.error); return; }
    setCommandError("");
    setSaving(true);
    // Only persist override fields when they differ from the auto-derived
    // form — otherwise blank them so future base-term edits propagate
    // through the auto-conjugation again.
    const baseFront = vals.front.trim() || "front";
    const baseSwitch = vals.switch.trim() || "switch";
    const autoFronting = gerund(baseFront);
    const autoFronter = agent(baseFront);
    const autoSwitching = gerund(baseSwitch);
    const data0 = {
      system: vals.system.trim() || "system",
      alter: vals.alter.trim() || "alter",
      switch: baseSwitch,
      front: baseFront,
    };
    const data = {
      term_system: vals.system.trim() || "system",
      term_alter: vals.alter.trim() || "alter",
      term_switch: baseSwitch,
      term_front: baseFront,
      term_fronting: vals.fronting.trim() && vals.fronting.trim() !== autoFronting ? vals.fronting.trim() : "",
      term_fronter: vals.fronter.trim() && vals.fronter.trim() !== autoFronter ? vals.fronter.trim() : "",
      term_switching: vals.switching.trim() && vals.switching.trim() !== autoSwitching ? vals.switching.trim() : "",
      // Plurals: only an irregular one is stored (blank = add an "s"), the
      // same rule the first-run setup uses.
      ...Object.fromEntries(Object.entries(PLURAL_KEY).map(([base, pk]) => {
        const word = data0[base];
        const typed = (vals[pk] || "").trim();
        return [`term_${pk}`, typed && typed !== pluralize(word) ? typed : ""];
      })),
      signpost_add: addSign,
      signpost_replace: replaceSign,
      command_sign: command.sign,
      command_words: command.words,
      whisper_word: command.whisper,
    };
    if (command.therapy !== getTherapyKeyword()) setTherapyKeyword(command.therapy);
    if (terms._settingsId) {
      await base44.entities.SystemSettings.update(terms._settingsId, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    markTermsCustomizedToday();
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    setSaving(false);
  };

  const fields = [
    { key: "system", label: "System", hint: "e.g. system, collective, network" },
    { key: "alter", label: "Alter", hint: "e.g. alter, headmate, part, member" },
    { key: "switch", label: "Switch", hint: "e.g. switch, shift, change" },
    { key: "front", label: "Front", hint: "e.g. front, active, present" },
  ];

  const cmdSign = isValidCommandSign((cmd.sign || "").trim(), { signpostAdd: "", signpostReplace: "" }) ? cmd.sign.trim() : DEFAULT_COMMAND_SIGN;

  const inner = (
    <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Preset</label>
          <select
            value=""
            onChange={(e) => { const p = PRESETS[Number(e.target.value)]; if (p) applyPreset(p); }}
            className="w-full h-9 px-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Choose a preset to fill the terms below…</option>
            {PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label} — {p.alter} · {p.front}ing</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(({ key, label, hint }) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
              <Input
                value={vals[key]}
                onChange={(e) => setBase(key, e.target.value)}
                placeholder={hint}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            <span className="font-medium">System:</span>{" "}
            <span className="text-foreground font-medium">{vals.system}</span> · <span className="text-foreground font-medium">{vals.systems || pluralize(vals.system)}</span>
          </p>
          <p>
            <span className="font-medium">Alter:</span>{" "}
            <span className="text-foreground font-medium">{vals.alter}</span> · <span className="text-foreground font-medium">{vals.alters || pluralize(vals.alter)}</span>
          </p>
          <p>
            <span className="font-medium">Switch:</span>{" "}
            <span className="text-foreground font-medium">{vals.switch}</span> · <span className="text-foreground font-medium">{vals.switches || pluralize(vals.switch)}</span> · <span className="text-foreground font-medium">{gerund(vals.switch)}</span>
          </p>
          <p>
            <span className="font-medium">Front:</span>{" "}
            <span className="text-foreground font-medium">{vals.front}</span> · <span className="text-foreground font-medium">{vals.fronts || pluralize(vals.front)}</span> · <span className="text-foreground font-medium">{vals.fronting || gerund(vals.front)}</span> · <span className="text-foreground font-medium">{vals.fronter || agent(vals.front)}</span>
          </p>
        </div>

        {/* Signpost triggers — the symbols typed before a name to attribute a
            post/message to an alter. Customisable so a user who prefers, say,
            "!name" / ".name" gets that everywhere. */}
        <div className="border-t border-border/40 pt-3">
          <label className="text-xs font-medium text-foreground block mb-1">Signpost triggers</label>
          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed mb-2">
            The symbol you type before a name to sign a message or post as an {vals.alter || "alter"}. One replaces the author with the named {vals.alter || "alter"}s; the other adds them alongside the current {terms.fronters}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Sign-as symbol</label>
              <Input
                value={vals.signpostReplace}
                onChange={(e) => setVals((p) => ({ ...p, signpostReplace: Array.from(e.target.value).slice(-1).join("") }))}
                placeholder="-"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Add-author symbol</label>
              <Input
                value={vals.signpostAdd}
                onChange={(e) => setVals((p) => ({ ...p, signpostAdd: Array.from(e.target.value).slice(-1).join("") }))}
                placeholder="+"
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground mt-1">
            e.g. <span className="font-mono text-foreground">{(vals.signpostReplace || "-")}{vals.alter || "name"}</span> signs as them; <span className="font-mono text-foreground">{(vals.signpostAdd || "+")}{vals.alter || "name"}</span> adds them.
          </p>
          {signpostError && <p className="text-[0.6875rem] text-destructive mt-1.5">{signpostError}</p>}
        </div>

        {/* Inline commands — the symbol that starts a ~command and the word
            for each kind. Built-in words always keep working, so a new word
            is an addition, never a rename that breaks old habits. */}
        <div className="border-t border-border/40 pt-3" data-tour="terms-commands">
          <label className="text-xs font-medium text-foreground block mb-1">Commands</label>
          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed mb-1">
            Type these in any note, chat or journal to log things as you write. Pick your own symbol and words; the built-in words keep working too.
          </p>
          <Row label="Command symbol" hint={`Starts a command, like ${cmdSign}feeling`}
            own={cmdSign !== DEFAULT_COMMAND_SIGN} onClear={() => setCmd((p) => ({ ...p, sign: DEFAULT_COMMAND_SIGN }))}>
            <Input
              value={cmd.sign}
              onChange={(e) => setCmd((p) => ({ ...p, sign: Array.from(e.target.value).slice(-1).join("") }))}
              placeholder={DEFAULT_COMMAND_SIGN}
              aria-label="Command symbol"
              className="h-8 w-14 text-sm font-mono text-center"
            />
          </Row>
          {COMMAND_WORD_TYPES.map(({ key, label, example }) => (
            <CommandWordRow key={key} label={label} prefix={cmdSign} fallback={key}
              hint={`e.g. ${cmdSign}${sanitizeCommandWord(cmd.words[key]) || key}:${example}`}
              value={cmd.words[key] || ""}
              onChange={(v) => setCmd((p) => ({ ...p, words: { ...p.words, [key]: v } }))} />
          ))}
          <CommandWordRow label="Therapy notes" prefix={cmdSign} fallback={DEFAULT_THERAPY_KEYWORD}
            hint="Saves what follows for your next therapy report"
            value={cmd.therapy}
            onChange={(v) => setCmd((p) => ({ ...p, therapy: v }))} />
          <CommandWordRow label="Whisper" prefix="/" fallback="w"
            hint={`/${sanitizeCommandWord(cmd.whisper) || "w"} @name [secret] hides it from everyone else`}
            value={cmd.whisper}
            onChange={(v) => setCmd((p) => ({ ...p, whisper: v }))} />
          {commandError && <p className="text-[0.6875rem] text-destructive mt-1.5">{commandError}</p>}
        </div>

        {/* Advanced word-form overrides. The auto-conjugator assumes the
            base term is a regular verb root; adjectives like "active"
            yield "activing" / "activer" instead of "activating" /
            "active fronter". This section lets the user type the
            correct forms explicitly. */}
        <div className="border-t border-border/40 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? "▾" : "▸"} Advanced word forms (override if auto-conjugation looks off)
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-2">
              <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
                Used when the base term isn't a regular word. e.g. setting Front to "active" would auto-conjugate to "activing" / "activer" — type "activating" / "active fronter" here instead, or "children" for the plural of "child". Leave blank to fall back to the automatic form.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Fronting form</label>
                  <Input
                    value={vals.fronting}
                    onChange={(e) => setVals((p) => ({ ...p, fronting: e.target.value }))}
                    placeholder={gerund(vals.front || "front")}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Fronter form</label>
                  <Input
                    value={vals.fronter}
                    onChange={(e) => setVals((p) => ({ ...p, fronter: e.target.value }))}
                    placeholder={agent(vals.front || "front")}
                    className="h-8 text-sm"
                  />
                </div>
                {Object.entries(PLURAL_KEY).map(([base, pk]) => (
                  <div key={pk}>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Plural of “{vals[base] || base}”</label>
                    <Input
                      value={vals[pk]}
                      onChange={(e) => setVals((p) => ({ ...p, [pk]: e.target.value }))}
                      placeholder={pluralize(vals[base] || base)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Switching form</label>
                  <Input
                    value={vals.switching}
                    onChange={(e) => setVals((p) => ({ ...p, switching: e.target.value }))}
                    placeholder={gerund(vals.switch || "switch")}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90">
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Terms</>}
        </Button>
    </div>
  );

  // Embedded mode (inside a Settings SubSection) drops the heavyweight Card
  // header — the SubSection already provides the "Terminology" title.
  if (embedded) return inner;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Languages className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Terminology</CardTitle>
            <CardDescription>Customize the language used throughout the app</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{inner}</CardContent>
    </Card>
  );
}
// One command word: the symbol shown in front, the built-in word greyed as
// the placeholder, × to go back to it.
function CommandWordRow({ label, hint, prefix, fallback, value, onChange }) {
  return (
    <Row label={label} hint={hint} own={!!(value || "").trim()} onClear={() => onChange("")}>
      <div className="relative w-32">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">{prefix}</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          aria-label={`${label} command word`}
          className="h-8 pl-6 text-sm"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </Row>
  );
}
