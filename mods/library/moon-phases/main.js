// Moon phases — a library mod for Oceans Symphony (docs/mods.md).
//
// Shows the moon for any day, a month calendar of phases, the next full and
// new moons, and a small moon journal. Everything is worked out on the
// device; nothing is looked up online.
//
// New and full moon times use the method in Meeus, "Astronomical
// Algorithms" ch. 49 (the main correction terms), good to within minutes.
// The phase between them is interpolated.
//
// Saved data:
//   "entry"    { date: "YYYY-MM-DD", text, fronting_ids }   the moon journal
//   "settings" { southern: bool }                          one record

symphony.registerPage("moon", async (root) => {
  const t = symphony.terms;
  const canFront = symphony.permissions.includes("fronting:read");
  const canAlters = symphony.permissions.includes("alters:read");

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
  const SVGNS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const k of kids) if (k) n.append(k);
    return n;
  };

  // ── moon maths ───────────────────────────────────────────────────────────
  const rad = Math.PI / 180;
  const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
  const dateToJd = (d) => d.valueOf() / 86400000 + 2440587.5;

  // k: integer → new moon, k + 0.5 → full moon.
  function truePhase(k) {
    const T = k / 1236.85;
    const isFull = Math.abs(k % 1) > 0.25;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T;
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const M = rad * (2.5534 + 29.1053567 * k);
    const Mp = rad * (201.5643 + 385.81693528 * k + 0.0107582 * T * T);
    const F = rad * (160.7108 + 390.67050284 * k - 0.0016118 * T * T);
    const O = rad * (124.7746 - 1.56375588 * k + 0.0020672 * T * T);
    const s = Math.sin;
    const c = isFull
      ? [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209]
      : [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208];
    jde += c[0] * s(Mp) + c[1] * E * s(M) + c[2] * s(2 * Mp) + c[3] * s(2 * F)
      + c[4] * E * s(Mp - M) + c[5] * E * s(Mp + M) + c[6] * E * E * s(2 * M)
      - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M)
      - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
      - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O);
    return jdToDate(jde);
  }
  const kNear = (date) => Math.floor((dateToJd(date) - 2451550.09766) / 29.530588861);

  // The new moon before `date` and the one after, plus the full in between.
  function cycleAround(date) {
    let k = kNear(date) - 1;
    while (truePhase(k + 1) <= date) k++;
    while (truePhase(k) > date) k--;
    return { newMoon: truePhase(k), full: truePhase(k + 0.5), nextNew: truePhase(k + 1), k };
  }

  // 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
  function phaseAt(date) {
    const cy = cycleAround(date);
    const f = date < cy.full
      ? 0.5 * (date - cy.newMoon) / (cy.full - cy.newMoon)
      : 0.5 + 0.5 * (date - cy.full) / (cy.nextNew - cy.full);
    return {
      f,
      lit: (1 - Math.cos(2 * Math.PI * f)) / 2,
      age: (date - cy.newMoon) / 86400000,
      cycle: cy,
    };
  }

  const DAYF = 1 / 29.53;
  function phaseName(f) {
    if (f < DAYF || f > 1 - DAYF) return "New moon";
    if (Math.abs(f - 0.5) < DAYF) return "Full moon";
    if (Math.abs(f - 0.25) < DAYF) return "First quarter";
    if (Math.abs(f - 0.75) < DAYF) return "Last quarter";
    if (f < 0.25) return "Waxing crescent";
    if (f < 0.5) return "Waxing gibbous";
    if (f < 0.75) return "Waning gibbous";
    return "Waning crescent";
  }
  const PHASE_NOTES = {
    "New moon": "The moon is between Earth and the sun, so its lit side faces away. A traditional time for beginnings.",
    "Waxing crescent": "A thin sliver growing each evening, seen after sunset in the west.",
    "First quarter": "Half lit, high in the sky at sunset.",
    "Waxing gibbous": "More than half lit and growing. Bright in the evening sky.",
    "Full moon": "The whole face is lit, rising around sunset and up all night.",
    "Waning gibbous": "Shrinking from full, rising later each night.",
    "Last quarter": "Half lit again, the other half. Rises around midnight and is seen in the morning.",
    "Waning crescent": "A last thin sliver before dawn, as the cycle comes round.",
  };

  // A moon drawn for phase f. Lit side on the right while waxing (as seen
  // from the northern hemisphere); `southern` mirrors it.
  function moonSvg(f, size, southern) {
    const r = 48, C = 50;
    const s = svg("svg", { viewBox: "0 0 100 100", width: size, height: size, "aria-hidden": "true" });
    s.append(svg("circle", { cx: C, cy: C, r, style: "fill:#2b3245" }));
    const lit = (1 - Math.cos(2 * Math.PI * f)) / 2;
    if (lit > 0.01) {
      const waxing = f < 0.5;
      const rx = Math.abs(Math.cos(2 * Math.PI * f)) * r;
      const crescent = lit < 0.5;
      const top = `${C} ${C - r}`, bottom = `${C} ${C + r}`;
      const d = waxing
        ? `M ${top} A ${r} ${r} 0 0 1 ${bottom} A ${rx} ${r} 0 0 ${crescent ? 0 : 1} ${top} Z`
        : `M ${top} A ${r} ${r} 0 0 0 ${bottom} A ${rx} ${r} 0 0 ${crescent ? 1 : 0} ${top} Z`;
      s.append(svg("path", { d, style: "fill:#f4ecd0" }));
    }
    s.append(svg("circle", { cx: C, cy: C, r, fill: "none", "stroke-width": 1.5, style: "stroke:var(--color-muted,#B6D4E3)" }));
    if (southern) s.style.transform = "scaleX(-1)";
    return s;
  }

  // ── data ─────────────────────────────────────────────────────────────────
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const fmtWhen = (d) => d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  let entries = [];
  let settings = null;
  let alters = [];
  async function load() {
    entries = await symphony.data.list("entry");
    const s = await symphony.data.list("settings");
    settings = s[s.length - 1] || null;
  }
  if (canAlters) { try { alters = await symphony.alters.list(); } catch { alters = []; } }
  const nameOf = (id) => (alters.find((a) => a.id === id) || {}).name || "";
  await load();

  // ── page ─────────────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(12, 0, 0, 0);
  let selected = ymd(today);
  let monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 12);

  const body = el("div");
  root.append(body);
  const southern = () => !!(settings && settings.southern);

  function heroCard() {
    const day = fromYmd(selected);
    const when = selected === ymd(today) ? new Date() : day;
    const p = phaseAt(when);
    const name = phaseName(p.f);
    return el("div", { className: "os-card", style: "text-align:center" },
      el("p", { className: "os-muted", style: "margin:0 0 6px", textContent: selected === ymd(today) ? "Tonight" : fmtDay(day) }),
      el("div", { style: "display:flex;justify-content:center" }, moonSvg(p.f, 150, southern())),
      el("p", { style: "font-size:1.35em;font-weight:600;margin:8px 0 0", textContent: name }),
      el("p", { className: "os-muted", style: "margin:2px 0 6px", textContent: `${Math.round(p.lit * 100)}% lit · ${p.age.toFixed(1)} days since the new moon` }),
      el("p", { style: "margin:0;font-size:0.92em", textContent: PHASE_NOTES[name] }));
  }

  function upcomingCard() {
    const now = new Date();
    const events = [];
    let k = kNear(now) - 1;
    while (events.length < 4) {
      for (const [kk, label] of [[k, "New moon"], [k + 0.5, "Full moon"]]) {
        const d = truePhase(kk);
        if (d > now && events.length < 4) events.push([label, d]);
      }
      k++;
    }
    return el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: "Coming up" }),
      events.map(([label, d]) => el("div", { className: "os-row", style: "justify-content:space-between;padding:3px 0" },
        el("span", { className: "os-row", style: "gap:6px" }, moonSvg(label === "Full moon" ? 0.5 : 0, 20, southern()), el("span", { textContent: label })),
        el("span", { className: "os-muted", textContent: fmtWhen(d) }))));
  }

  function calendarCard() {
    const y = monthStart.getFullYear(), m = monthStart.getMonth();
    const first = new Date(y, m, 1, 12);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // weeks start on Monday
    const grid = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center" });
    for (const w of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) grid.append(el("span", { className: "os-muted", style: "font-size:0.75em", textContent: w }));
    for (let i = 0; i < lead; i++) grid.append(el("span"));
    const withEntries = new Set(entries.map((e) => e.date));
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d, 12);
      const key = ymd(date);
      const p = phaseAt(date);
      const btn = el("button", {
        style: `font:inherit;border:0;border-radius:10px;padding:4px 0;cursor:pointer;background:${key === selected ? "var(--color-primary,#3B82F6)" : "transparent"};color:${key === selected ? "#fff" : "inherit"};display:flex;flex-direction:column;align-items:center;gap:2px;min-height:44px`,
        "aria-label": `${fmtDay(date)}, ${phaseName(p.f)}${withEntries.has(key) ? ", has a journal note" : ""}`,
        "aria-pressed": key === selected ? "true" : "false",
        onclick: () => { selected = key; render(); },
      }, el("span", { style: "font-size:0.8em;font-weight:" + (key === ymd(today) ? "700" : "400"), textContent: String(d) }), moonSvg(p.f, 18, southern()),
        withEntries.has(key) ? el("span", { style: "width:5px;height:5px;border-radius:50%;background:currentColor" }) : null);
      grid.append(btn);
    }
    const nav = (delta) => { monthStart = new Date(y, m + delta, 1, 12); render(); };
    return el("div", { className: "os-card" },
      el("div", { className: "os-row", style: "justify-content:space-between;margin-bottom:6px" },
        el("button", { className: "os-button secondary small", textContent: "‹", "aria-label": "Previous month", onclick: () => nav(-1) }),
        el("span", { style: "font-weight:600", textContent: first.toLocaleDateString([], { month: "long", year: "numeric" }) }),
        el("button", { className: "os-button secondary small", textContent: "›", "aria-label": "Next month", onclick: () => nav(1) })),
      grid);
  }

  function journalCard() {
    const day = fromYmd(selected);
    const mine = entries.filter((e) => e.date === selected).sort((a, b) => (a.created_date < b.created_date ? -1 : 1));
    const input = el("textarea", { className: "os-input", rows: 3, placeholder: "How does this moon feel? Anything you noticed…" });
    const save = el("button", { className: "os-button", textContent: "Add to moon journal" });
    save.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
      let fronting_ids = [];
      if (canFront) { try { fronting_ids = (await symphony.fronting.current()).map((f) => f.alter_id); } catch { /* fine */ } }
      await symphony.data.create("entry", { date: selected, text, fronting_ids, phase: phaseName(phaseAt(day).f) });
      input.value = "";
      symphony.ui.toast("Saved");
    };
    return el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: `Moon journal · ${fmtDay(day)}` }),
      mine.map((e) => {
        const who = (e.fronting_ids || []).map(nameOf).filter(Boolean).join(", ");
        return el("div", { style: "border-top:1px solid var(--color-muted,#B6D4E3);padding:8px 0" },
          el("div", { style: "white-space:pre-wrap", textContent: e.text }),
          el("div", { className: "os-row", style: "justify-content:space-between;margin-top:4px" },
            el("span", { className: "os-muted", textContent: `${e.phase || ""}${who ? ` · ${who}` : ""}` }),
            el("button", {
              className: "os-button secondary small", textContent: "Remove",
              onclick: async () => {
                if (await symphony.ui.confirm("Remove this note?", "You can bring it back from Recent changes.", { confirmLabel: "Remove", destructive: true })) {
                  await symphony.data.remove("entry", e.id);
                }
              },
            })));
      }),
      input,
      el("div", { className: "os-row", style: "margin-top:8px;justify-content:space-between" },
        el("span", { className: "os-muted", textContent: canFront ? `Notes remember who was ${t.fronting || "fronting"}` : "" }),
        save));
  }

  function settingsRow() {
    const box = el("input", { type: "checkbox", checked: southern(), id: "southern" });
    box.onchange = async () => {
      const fields = { southern: box.checked };
      settings = settings ? await symphony.data.update("settings", settings.id, fields) : await symphony.data.create("settings", fields);
      render();
    };
    return el("label", { className: "os-row os-muted", style: "cursor:pointer;margin:4px 0 0" }, box, "I'm in the southern hemisphere (flip the moon)");
  }

  function render() {
    body.replaceChildren(heroCard(), calendarCard(), journalCard(), upcomingCard(), settingsRow());
  }

  symphony.onDataChange(async () => { await load(); render(); });
  render();
});
