// Cycle tracker — a library mod for Oceans Symphony (docs/mods.md).
//
// Log bleeding days and how the body feels, see the cycle on a calendar, and
// get a rough guess at the next start from the person's own history. Written
// for every body: no gendered words, and the person picks the word used for
// bleeding ("period", "bleed", …). It asks for no permissions: a body's cycle
// belongs to the whole body, not to whoever is in front.
//
// Saved data:
//   "day"      { date: "YYYY-MM-DD", flow: ""|spotting|light|medium|heavy, feelings: [], note }
//              one record per day that has anything logged
//   "settings" { word, predictions: bool }   one record

symphony.registerPage("cycle", async (root) => {
  // ── tiny DOM helpers ─────────────────────────────────────────────────────
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
    return n;
  };

  // ── dates (always local days, kept as "YYYY-MM-DD") ──────────────────────
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const daysBetween = (a, b) => Math.round((fromYmd(b) - fromYmd(a)) / 86400000);
  const fmtDay = (s) => fromYmd(s).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const fmtShort = (s) => fromYmd(s).toLocaleDateString([], { month: "short", day: "numeric" });
  const todayKey = () => ymd(new Date());

  const FLOWS = [
    ["", "None"], ["spotting", "Spotting"], ["light", "Light"], ["medium", "Medium"], ["heavy", "Heavy"],
  ];
  const FLOW_COLOR = { spotting: "rgba(225,29,72,.25)", light: "rgba(225,29,72,.45)", medium: "rgba(225,29,72,.7)", heavy: "rgba(190,18,60,.95)" };
  const FEELINGS = [
    "Cramps", "Back ache", "Headache", "Bloating", "Tender chest", "Tired", "Low energy", "Restless",
    "Cravings", "Nausea", "Skin changes", "Trouble sleeping", "Mood shifts", "Dysphoria", "Feeling good",
  ];
  const WORDS = ["period", "bleed", "flow", "monthly"];

  // ── data ─────────────────────────────────────────────────────────────────
  let days = [];
  let settings = null;
  async function load() {
    days = await symphony.data.list("day");
    const s = await symphony.data.list("settings");
    settings = s[s.length - 1] || null;
  }
  await load();
  const word = () => (settings && WORDS.includes(settings.word) ? settings.word : "period");
  const predictionsOn = () => !(settings && settings.predictions === false);
  const dayOf = (key) => days.find((d) => d.date === key) || null;
  const bleeds = (d) => d && ["light", "medium", "heavy"].includes(d.flow);

  // A cycle starts on the first bleeding day after at least two clear days.
  // Spotting alone never starts one. Returns [{ start, length (days bled) }].
  function cycles() {
    const keys = days.filter(bleeds).map((d) => d.date).sort();
    const out = [];
    for (const k of keys) {
      const last = out[out.length - 1];
      if (last && daysBetween(last.end, k) <= 2) { last.end = k; continue; }
      out.push({ start: k, end: k });
    }
    return out.map((c) => ({ start: c.start, bled: daysBetween(c.start, c.end) + 1 }));
  }

  function stats() {
    const cs = cycles();
    const lengths = [];
    for (let i = 1; i < cs.length; i++) {
      const L = daysBetween(cs[i - 1].start, cs[i].start);
      if (L >= 15 && L <= 90) lengths.push(L); // longer gaps are usually missed logging
    }
    const recent = lengths.slice(-6);
    const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
    const spread = recent.length > 1
      ? Math.max(2, Math.round(Math.sqrt(recent.reduce((a, b) => a + (b - avg) ** 2, 0) / recent.length)))
      : 3;
    const bledAvg = cs.length ? Math.min(10, Math.round(cs.slice(-6).reduce((a, c) => a + c.bled, 0) / Math.min(6, cs.length))) : null;
    const last = cs[cs.length - 1] || null;
    const next = last && avg ? addDays(last.start, avg) : null;
    return { cs, lengths, avg, spread, bledAvg, last, next };
  }

  // ── page ─────────────────────────────────────────────────────────────────
  let selected = todayKey();
  let settingsOpen = false;
  let month = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 12); })();
  const body = el("div");
  root.append(body);

  function summaryCard(st) {
    const w = word();
    const today = todayKey();
    const lines = [];
    if (!st.last) {
      lines.push(el("p", { style: "margin:0", textContent: `Tap a day on the calendar and log your ${w} to get started.` }));
    } else {
      const dayN = daysBetween(st.last.start, today) + 1;
      lines.push(el("p", { style: "font-size:1.35em;font-weight:600;margin:0", textContent: `Day ${dayN} of this cycle` }));
      lines.push(el("p", { className: "os-muted", style: "margin:2px 0 0", textContent: `Started ${fmtDay(st.last.start)}` }));
      if (predictionsOn()) {
        if (st.next) {
          const from = addDays(st.next, -st.spread), to = addDays(st.next, st.spread);
          const late = daysBetween(to, today);
          lines.push(el("p", { style: "margin:8px 0 0", textContent: late > 0
            ? `Your next ${w} is a few days later than your usual. Cycles shift for lots of reasons, and that's common.`
            : `Next ${w} may start around ${fmtShort(st.next)} (between ${fmtShort(from)} and ${fmtShort(to)}).` }));
          lines.push(el("p", { className: "os-muted", style: "margin:2px 0 0", textContent: `Your cycles have averaged ${st.avg} days${st.bledAvg ? `, with about ${st.bledAvg} days of bleeding` : ""}.` }));
        } else {
          lines.push(el("p", { className: "os-muted", style: "margin:8px 0 0", textContent: `Log the start of one more ${w} and a guess at the next one will show here.` }));
        }
      }
    }
    return el("div", { className: "os-card" }, lines);
  }

  function calendarCard(st) {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1, 12);
    const count = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const predicted = new Set();
    if (predictionsOn() && st.next) {
      // The guessed window, and the usual bleeding days from the guessed start.
      for (let i = -st.spread; i <= st.spread; i++) predicted.add(addDays(st.next, i));
    }
    const grid = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center" });
    for (const w of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) grid.append(el("span", { className: "os-muted", style: "font-size:0.75em", textContent: w }));
    for (let i = 0; i < lead; i++) grid.append(el("span"));
    const today = todayKey();
    for (let n = 1; n <= count; n++) {
      const key = ymd(new Date(y, m, n, 12));
      const d = dayOf(key);
      const flow = d && d.flow;
      const isSel = key === selected;
      const hasFeel = d && ((d.feelings || []).length || d.note);
      const bits = [];
      if (flow) bits.push(FLOWS.find((f) => f[0] === flow)[1]);
      if (hasFeel) bits.push("has notes");
      if (!flow && predicted.has(key)) bits.push(`${word()} may start`);
      grid.append(el("button", {
        "aria-label": `${fmtDay(key)}${bits.length ? ", " + bits.join(", ") : ""}`,
        "aria-pressed": isSel ? "true" : "false",
        style: [
          "font:inherit;cursor:pointer;border-radius:10px;min-height:42px;padding:2px 0;position:relative",
          `background:${flow ? FLOW_COLOR[flow] : "transparent"}`,
          `border:${isSel ? "2px solid var(--color-primary,#3B82F6)" : predicted.has(key) && !flow ? "1.5px dashed rgba(225,29,72,.6)" : "1px solid transparent"}`,
          `color:${flow === "heavy" || flow === "medium" ? "#fff" : "inherit"}`,
          `font-weight:${key === today ? 700 : 400}`,
        ].join(";"),
        onclick: () => { selected = key; render(); },
      }, String(n), hasFeel ? el("span", { style: "position:absolute;bottom:4px;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:currentColor" }) : null));
    }
    const nav = (delta) => { month = new Date(y, m + delta, 1, 12); render(); };
    return el("div", { className: "os-card" },
      el("div", { className: "os-row", style: "justify-content:space-between;margin-bottom:6px" },
        el("button", { className: "os-button secondary small", textContent: "‹", "aria-label": "Previous month", onclick: () => nav(-1) }),
        el("span", { style: "font-weight:600", textContent: first.toLocaleDateString([], { month: "long", year: "numeric" }) }),
        el("button", { className: "os-button secondary small", textContent: "›", "aria-label": "Next month", onclick: () => nav(1) })),
      grid,
      predictionsOn() ? el("p", { className: "os-muted", style: "margin:8px 0 0", textContent: `Dashed days: when your next ${word()} may start.` }) : null);
  }

  function dayCard() {
    const existing = dayOf(selected);
    let flow = existing ? existing.flow || "" : "";
    const feelings = new Set(existing ? existing.feelings || [] : []);
    const note = el("textarea", { className: "os-input", rows: 2, placeholder: "Anything else about today…", value: existing ? existing.note || "" : "" });

    const flowRow = el("div", { className: "os-tabs", role: "group", "aria-label": "Bleeding" });
    const drawFlow = () => flowRow.replaceChildren(...FLOWS.map(([v, label]) => el("button", {
      className: "os-chip", textContent: label, "aria-pressed": flow === v ? "true" : "false",
      onclick: () => { flow = v; drawFlow(); },
    })));
    drawFlow();
    const feelRow = el("div", { className: "os-tabs", role: "group", "aria-label": "How the body feels" });
    const drawFeel = () => feelRow.replaceChildren(...FEELINGS.map((f) => el("button", {
      className: "os-chip", textContent: f, "aria-pressed": feelings.has(f) ? "true" : "false",
      onclick: () => { feelings.has(f) ? feelings.delete(f) : feelings.add(f); drawFeel(); },
    })));
    drawFeel();

    const save = el("button", { className: "os-button", textContent: "Save" });
    save.onclick = async () => {
      const fields = { date: selected, flow, feelings: [...feelings], note: note.value.trim() };
      const empty = !fields.flow && !fields.feelings.length && !fields.note;
      const current = dayOf(selected);
      if (current) await symphony.data.update("day", current.id, fields);
      else if (!empty) await symphony.data.create("day", fields);
      symphony.ui.toast("Saved");
    };
    const clear = existing ? el("button", {
      className: "os-button secondary", textContent: "Clear this day",
      onclick: async () => {
        if (await symphony.ui.confirm(`Clear ${fmtDay(selected)}?`, "This removes what you logged for this day. You can bring it back from Recent changes.", { confirmLabel: "Clear", destructive: true })) {
          await symphony.data.remove("day", existing.id);
        }
      },
    }) : null;

    return el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: fmtDay(selected) }),
      el("label", { className: "os-label", textContent: "Bleeding" }), flowRow,
      el("label", { className: "os-label", textContent: "How your body feels" }), feelRow,
      el("label", { className: "os-label", textContent: "Note" }), note,
      el("div", { className: "os-row", style: "margin-top:10px" }, save, clear));
  }

  function historyCard(st) {
    if (st.cs.length < 2) return null;
    const rows = [];
    for (let i = st.cs.length - 1; i >= Math.max(1, st.cs.length - 6); i--) {
      const L = daysBetween(st.cs[i - 1].start, st.cs[i].start);
      rows.push(el("div", { className: "os-row", style: "justify-content:space-between;padding:3px 0" },
        el("span", { textContent: `${fmtShort(st.cs[i - 1].start)} → ${fmtShort(st.cs[i].start)}` }),
        el("span", { className: "os-muted", textContent: `${L} days · bled ${st.cs[i - 1].bled}` })));
    }
    return el("div", { className: "os-card" }, el("p", { className: "os-h", textContent: "Recent cycles" }), rows);
  }

  function settingsCard() {
    const select = el("select", { className: "os-input", "aria-label": "Word to use" },
      WORDS.map((w) => el("option", { value: w, textContent: w, selected: w === word() })));
    const pred = el("input", { type: "checkbox", checked: predictionsOn() });
    const saveSettings = async () => {
      const fields = { word: select.value, predictions: pred.checked };
      settings = settings ? await symphony.data.update("settings", settings.id, fields) : await symphony.data.create("settings", fields);
    };
    select.onchange = saveSettings;
    pred.onchange = saveSettings;
    return el("details", { className: "os-card", open: settingsOpen, ontoggle: (e) => { settingsOpen = e.target.open; } },
      el("summary", { style: "cursor:pointer;font-weight:600", textContent: "Settings" }),
      el("label", { className: "os-label", textContent: "Word for bleeding" }), select,
      el("label", { className: "os-row", style: "margin-top:10px;cursor:pointer" }, pred, "Show guesses for the next one"));
  }

  const disclaimer = () => el("p", { className: "os-muted", style: "margin:4px 2px 0",
    textContent: "Not medical advice, and not a way to prevent or plan pregnancy. Guesses come only from what you've logged here. If something changes or worries you, a clinician can help." });

  function render() {
    const st = stats();
    body.replaceChildren(summaryCard(st), calendarCard(st), dayCard(), historyCard(st), settingsCard(), disclaimer());
  }

  symphony.onDataChange(async () => { await load(); render(); });
  render();
});
