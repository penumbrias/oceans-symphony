// Letters to later — a library mod for Oceans Symphony (docs/mods.md).
//
// Write a letter, choose the day it opens, and seal it. Until then only the
// envelope shows (who it's from and to, and when it opens). Letters can be
// to the person's future self or from one alter to another.
//
// Sealed means hidden, not locked: the letter is stored like the rest of the
// person's data (encrypted if they use encryption, in their backups), and it
// can be opened early on purpose. The page says so.
//
// Saved data:
//   "letter" { title, body, from_ids: [], to_id ("" = everyone / future us),
//              open_on: "YYYY-MM-DD", opened_at: ISO | null }

symphony.registerPage("letters", async (root) => {
  const t = symphony.terms;
  const canFront = symphony.permissions.includes("fronting:read");
  const canAlters = symphony.permissions.includes("alters:read");
  const T = (k, fallback) => (typeof t[k] === "string" && t[k] ? t[k] : fallback);

  // ── tiny DOM helpers ─────────────────────────────────────────────────────
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k);
    return n;
  };

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const todayKey = () => ymd(new Date());
  const fmtDay = (s) => fromYmd(s).toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  const daysUntil = (s) => Math.round((fromYmd(s) - fromYmd(todayKey())) / 86400000);

  // ── data ─────────────────────────────────────────────────────────────────
  let letters = [];
  let alters = [];
  const load = async () => { letters = await symphony.data.list("letter"); };
  if (canAlters) { try { alters = (await symphony.alters.list()).filter((a) => !a.archived); } catch { alters = []; } }
  const nameOf = (id) => (alters.find((a) => a.id === id) || {}).name || "";
  await load();

  const isReady = (l) => l.open_on <= todayKey();
  const fromText = (l) => (l.from_ids || []).map(nameOf).filter(Boolean).join(", ") || "Past us";
  const toText = (l) => (l.to_id && nameOf(l.to_id)) || `Future us`;

  // ── page ─────────────────────────────────────────────────────────────────
  let view = "list"; // list | write | <letter id>
  const body = el("div");
  root.append(body);

  function envelope(l) {
    const ready = isReady(l);
    const opened = !!l.opened_at;
    const left = daysUntil(l.open_on);
    const status = opened ? `Opened ${new Date(l.opened_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
      : ready ? "Ready to open" : left === 1 ? "Opens tomorrow" : `Opens in ${left} days`;
    return el("button", {
      className: "os-card",
      style: `display:block;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;${ready && !opened ? "border-color:var(--color-primary,#3B82F6);border-width:2px" : ""}`,
      onclick: () => { view = l.id; render(); },
    },
      el("div", { className: "os-row", style: "justify-content:space-between" },
        el("strong", { textContent: l.title || (opened ? "A letter" : "A sealed letter") }),
        el("span", { "aria-hidden": "true", textContent: opened ? "📖" : ready ? "💌" : "✉️" })),
      el("div", { className: "os-muted", textContent: `From ${fromText(l)} to ${toText(l)}` }),
      el("div", { className: "os-muted", textContent: `${status} · ${fmtDay(l.open_on)}` }));
  }

  function listView() {
    const sorted = [...letters].sort((a, b) => {
      const ar = isReady(a) && !a.opened_at, br = isReady(b) && !b.opened_at;
      if (ar !== br) return ar ? -1 : 1;
      if (!!a.opened_at !== !!b.opened_at) return a.opened_at ? 1 : -1;
      return a.open_on < b.open_on ? -1 : 1;
    });
    const waiting = sorted.filter((l) => !l.opened_at), opened = sorted.filter((l) => l.opened_at);
    return [
      el("div", { className: "os-row", style: "justify-content:space-between;margin-bottom:8px" },
        el("span", { className: "os-muted", textContent: waiting.length ? `${waiting.length} waiting` : "" }),
        el("button", { className: "os-button", textContent: "Write a letter", onclick: () => { view = "write"; render(); } })),
      letters.length ? null : el("div", { className: "os-card" },
        el("p", { style: "margin:0", textContent: "Write to yourself in a month, a year, or on a day that matters." }),
        el("p", { className: "os-muted", style: "margin:6px 0 0", textContent: `Letters can also go from one ${T("alter", "alter")} to another. They stay sealed until the day you choose.` })),
      waiting.map(envelope),
      opened.length ? el("p", { className: "os-h", style: "margin-top:14px", textContent: "Opened" }) : null,
      opened.map(envelope),
      el("p", { className: "os-muted", style: "margin:10px 2px 0", textContent: "Sealed letters are hidden, not locked: they're kept with the rest of your data and in your backups, and can be opened early if you choose." }),
    ];
  }

  function writeView() {
    const title = el("input", { className: "os-input", placeholder: "A title for the envelope (optional)" });
    const text = el("textarea", { className: "os-input", rows: 10, placeholder: "Dear future us…" });
    const PRESETS = [["1 week", 7], ["1 month", 30], ["3 months", 91], ["6 months", 182], ["1 year", 365]];
    const date = el("input", { className: "os-input", type: "date", min: addDays(1), value: addDays(30), "aria-label": "Open on" });
    const presets = el("div", { className: "os-tabs" }, PRESETS.map(([label, n]) => el("button", {
      className: "os-chip", textContent: label, onclick: () => { date.value = addDays(n); },
    })));
    const from = new Set();
    const fromRow = canAlters && alters.length ? el("div", { className: "os-tabs" }) : null;
    const drawFrom = () => fromRow && fromRow.replaceChildren(...alters.map((a) => el("button", {
      className: "os-chip", textContent: a.name || a.alias || "?", "aria-pressed": from.has(a.id) ? "true" : "false",
      onclick: () => { from.has(a.id) ? from.delete(a.id) : from.add(a.id); drawFrom(); },
    })));
    const toSel = canAlters && alters.length ? el("select", { className: "os-input", "aria-label": "To" },
      el("option", { value: "", textContent: "Future us (everyone)" }),
      alters.map((a) => el("option", { value: a.id, textContent: a.name || a.alias || "?" }))) : null;
    // Start "from" with whoever is in front.
    if (canFront && fromRow) {
      symphony.fronting.current().then((f) => { f.forEach((x) => from.add(x.alter_id)); drawFrom(); }).catch(() => drawFrom());
    } else drawFrom();

    const seal = el("button", { className: "os-button", textContent: "Seal it" });
    seal.onclick = async () => {
      const v = text.value.trim();
      if (!v) { symphony.ui.toast("The letter is empty."); return; }
      if (!date.value || date.value <= todayKey()) { symphony.ui.toast("Pick a day after today for it to open."); return; }
      const ok = await symphony.ui.confirm(`Seal until ${fmtDay(date.value)}?`, "You won't see what it says until then (unless you choose to open it early). You can't edit a sealed letter.", { confirmLabel: "Seal it" });
      if (!ok) return;
      await symphony.data.create("letter", { title: title.value.trim(), body: v, from_ids: [...from], to_id: toSel ? toSel.value : "", open_on: date.value, opened_at: null });
      view = "list";
      symphony.ui.toast("Sealed");
      render();
    };
    const label = (s) => el("label", { className: "os-label", textContent: s });
    return [el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: "Write a letter" }),
      title, el("div", { style: "height:8px" }), text,
      fromRow ? [label("From"), fromRow] : null,
      toSel ? [label("To"), toSel] : null,
      label("Opens on"), presets, date,
      el("div", { className: "os-row", style: "margin-top:12px" }, seal,
        el("button", { className: "os-button secondary", textContent: "Cancel", onclick: async () => {
          if (text.value.trim() && !(await symphony.ui.confirm("Discard this letter?", "What you wrote here won't be kept.", { confirmLabel: "Discard", destructive: true }))) return;
          view = "list"; render();
        } })))];
  }

  function letterView(l) {
    const back = el("button", { className: "os-button secondary small", textContent: "‹ All letters", onclick: () => { view = "list"; render(); } });
    const remove = el("button", {
      className: "os-button secondary small", textContent: "Remove letter",
      onclick: async () => {
        if (await symphony.ui.confirm("Remove this letter?", "You can bring it back from Recent changes.", { confirmLabel: "Remove", destructive: true })) {
          await symphony.data.remove("letter", l.id);
          view = "list";
        }
      },
    });
    const head = el("div", {},
      el("p", { style: "font-size:1.2em;font-weight:600;margin:0", textContent: l.title || "A letter" }),
      el("p", { className: "os-muted", style: "margin:2px 0 0", textContent: `From ${fromText(l)} to ${toText(l)} · written ${new Date(l.created_date).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}` }));

    if (!l.opened_at) {
      const ready = isReady(l);
      const open = el("button", { className: "os-button", textContent: ready ? "Open it" : "Open early" });
      open.onclick = async () => {
        if (!ready && !(await symphony.ui.confirm("Open it early?", `It was sealed until ${fmtDay(l.open_on)}.`, { confirmLabel: "Open now" }))) return;
        await symphony.data.update("letter", l.id, { opened_at: new Date().toISOString() });
      };
      return [back, el("div", { className: "os-card", style: "margin-top:8px;text-align:center;padding:24px 16px" },
        el("p", { style: "font-size:2.2em;margin:0", "aria-hidden": "true", textContent: ready ? "💌" : "✉️" }),
        head,
        el("p", { style: "margin:12px 0", textContent: ready ? "It's the day. This letter is ready for you." : `Sealed until ${fmtDay(l.open_on)}.` }),
        open), remove];
    }
    return [back, el("div", { className: "os-card", style: "margin-top:8px" }, head,
      el("div", { style: "white-space:pre-wrap;margin-top:12px;line-height:1.6", textContent: l.body })), remove];
  }

  function render() {
    const letter = letters.find((l) => l.id === view);
    if (view !== "list" && view !== "write" && !letter) view = "list";
    const content = view === "write" ? writeView() : letter ? letterView(letter) : listView();
    body.replaceChildren(...[content].flat(Infinity).filter(Boolean));
  }

  symphony.onDataChange(async () => { await load(); if (view !== "write") render(); });
  render();
});
