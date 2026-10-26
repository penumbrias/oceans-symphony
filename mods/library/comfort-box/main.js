// Comfort box — a library mod for Oceans Symphony (docs/mods.md).
//
// A box of affirmations, reminders, quotes and kind notes. Pull one out at
// random when things are hard, keep favourites, and write notes for a
// particular alter (shown first when they're in front, if the person allows
// the mod to see who is). A gentle starter set comes built in and can be
// switched off.
//
// Saved data:
//   "item"     { text, kind, from, for_alter_id, favorite }
//   "settings" { starters: bool, fav_starters: [starter ids] }   one record

symphony.registerPage("box", async (root) => {
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

  const KINDS = [
    ["affirmation", "Affirmation"], ["reminder", "Reminder"], ["grounding", "Grounding"],
    ["quote", "Quote"], ["note", "Kind note"],
  ];
  const kindLabel = (k) => (KINDS.find((x) => x[0] === k) || KINDS[0])[1];

  // Starters use the person's own words. Ids are stable so favourites stick.
  const today = () => new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const STARTERS = [
    ["s1", "affirmation", "I am safe right now, in this moment."],
    ["s2", "affirmation", `Every ${T("alter", "alter")} here belongs, exactly as they are.`],
    ["s3", "reminder", "It's okay to rest. Rest is not giving up."],
    ["s4", "affirmation", "I've made it through every hard day so far."],
    ["s5", "reminder", "Feelings come and go like waves. This one will pass too."],
    ["s6", "affirmation", "Small steps still count."],
    ["s7", "affirmation", `Whoever is ${T("fronting", "fronting")} right now is doing enough.`],
    ["s8", "reminder", "I'm allowed to ask for help."],
    ["s9", "affirmation", "Today doesn't have to be perfect to be okay."],
    ["s10", "affirmation", `We're a ${T("system", "system")} and a team, even when we disagree.`],
    ["s11", "grounding", "Breathe in for four, out for six. Then name five things you can see."],
    ["s12", "grounding", () => `Today is ${today()}. You are here, now.`],
    ["s13", "reminder", `Drink some water. The body is looking after all of you.`],
    ["s14", "reminder", "You don't have to earn rest, food or kindness."],
    ["s15", "affirmation", "Being gentle with myself is a skill, and I'm practising it right now."],
    ["s16", "grounding", "Feel your feet on the floor. Press down a little. You're here."],
    ["s17", "reminder", "Mistakes are how everyone learns. They don't make you bad."],
    ["s18", "affirmation", `It's okay not to remember everything. We still deserve care.`],
  ];

  // ── data ─────────────────────────────────────────────────────────────────
  let items = [];
  let settings = null;
  let alters = [];
  let fronting = [];
  async function load() {
    items = await symphony.data.list("item");
    const s = await symphony.data.list("settings");
    settings = s[s.length - 1] || null;
  }
  if (canAlters) { try { alters = (await symphony.alters.list()).filter((a) => !a.archived); } catch { alters = []; } }
  if (canFront) { try { fronting = (await symphony.fronting.current()).map((f) => f.alter_id); } catch { fronting = []; } }
  const nameOf = (id) => (alters.find((a) => a.id === id) || {}).name || "";
  await load();

  const startersOn = () => !(settings && settings.starters === false);
  const favStarters = () => new Set((settings && settings.fav_starters) || []);
  async function saveSettings(patch) {
    const fields = { starters: startersOn(), fav_starters: [...favStarters()], ...patch };
    settings = settings ? await symphony.data.update("settings", settings.id, fields) : await symphony.data.create("settings", fields);
  }

  // Everything that can be drawn, as { key, text, kind, from, forId, favorite, starter, id }.
  function pool() {
    const out = items.map((i) => ({ key: i.id, id: i.id, text: i.text, kind: i.kind, from: i.from, forId: i.for_alter_id || null, favorite: !!i.favorite }));
    if (startersOn()) {
      const favs = favStarters();
      for (const [id, kind, text] of STARTERS) out.push({ key: id, starter: true, kind, text: typeof text === "function" ? text() : text, favorite: favs.has(id) });
    }
    return out;
  }

  // ── page ─────────────────────────────────────────────────────────────────
  let filter = "all"; // all | favorites | here | <kind>
  let current = null; // key of the shown item
  let view = "box";   // box | add | manage
  let editing = null; // item id being edited
  const body = el("div");
  root.append(body);

  function candidates() {
    const all = pool();
    if (filter === "favorites") return all.filter((x) => x.favorite);
    if (filter === "here") return all.filter((x) => x.forId && fronting.includes(x.forId));
    if (filter !== "all") return all.filter((x) => x.kind === filter);
    return all;
  }
  function pick() {
    const list = candidates();
    if (!list.length) { current = null; return; }
    // Notes written for whoever is in front come up more often.
    const weighted = list.flatMap((x) => (x.forId && fronting.includes(x.forId) ? [x, x, x] : [x]));
    let next = weighted[Math.floor(Math.random() * weighted.length)];
    if (list.length > 1 && next.key === current) next = list.find((x) => x.key !== current);
    current = next.key;
  }

  async function toggleFavorite(x) {
    if (x.starter) {
      const favs = favStarters();
      favs.has(x.key) ? favs.delete(x.key) : favs.add(x.key);
      await saveSettings({ fav_starters: [...favs] });
      render();
    } else {
      await symphony.data.update("item", x.id, { favorite: !x.favorite });
    }
  }

  function filterRow() {
    const opts = [["all", "Everything"], ["favorites", "♥ Favourites"]];
    if (canFront && fronting.length && items.some((i) => i.for_alter_id && fronting.includes(i.for_alter_id))) opts.push(["here", `For who's ${T("fronting", "fronting")}`]);
    opts.push(...KINDS);
    return el("div", { className: "os-tabs" }, opts.map(([id, label]) => el("button", {
      className: "os-chip", textContent: label, "aria-pressed": filter === id ? "true" : "false",
      onclick: () => { filter = id; pick(); render(); },
    })));
  }

  function boxView() {
    if (!current || !pool().some((x) => x.key === current)) pick();
    const x = pool().find((p) => p.key === current);
    const shown = x
      ? el("div", { className: "os-card", style: "text-align:center;padding:28px 18px;min-height:150px;display:flex;flex-direction:column;justify-content:center;gap:10px" },
        el("p", { className: "os-muted", style: "margin:0;text-transform:uppercase;letter-spacing:.06em;font-size:.75em", textContent: kindLabel(x.kind) }),
        el("p", { style: "font-size:1.35em;line-height:1.4;margin:0;white-space:pre-wrap", textContent: x.text }),
        x.from || x.forId ? el("p", { className: "os-muted", style: "margin:0", textContent: [x.from ? `from ${x.from}` : "", x.forId && nameOf(x.forId) ? `for ${nameOf(x.forId)}` : ""].filter(Boolean).join(" · ") }) : null)
      : el("div", { className: "os-card", style: "text-align:center;padding:24px" },
        el("p", { style: "margin:0", textContent: filter === "favorites" ? "No favourites yet. Tap ♡ on one you like." : "Nothing here yet. Add something that helps." }));
    return [
      filterRow(),
      shown,
      el("div", { className: "os-row", style: "justify-content:center;gap:10px" },
        el("button", { className: "os-button", textContent: "Another one", onclick: () => { pick(); render(); } }),
        x ? el("button", {
          className: "os-button secondary", textContent: x.favorite ? "♥ Favourite" : "♡ Favourite", "aria-pressed": x.favorite ? "true" : "false",
          onclick: () => toggleFavorite(x),
        }) : null),
      el("div", { className: "os-row", style: "justify-content:center;margin-top:14px" },
        el("button", { className: "os-button secondary small", textContent: "Add to the box", onclick: () => { view = "add"; editing = null; render(); } }),
        el("button", { className: "os-button secondary small", textContent: "Everything in the box", onclick: () => { view = "manage"; render(); } })),
    ];
  }

  function form() {
    const item = editing ? items.find((i) => i.id === editing) : null;
    const text = el("textarea", { className: "os-input", rows: 4, placeholder: "Something kind, true or steadying…", value: item ? item.text : "" });
    const kind = el("select", { className: "os-input", "aria-label": "Kind" }, KINDS.map(([v, l]) => el("option", { value: v, textContent: l, selected: item ? item.kind === v : v === "affirmation" })));
    const from = el("input", { className: "os-input", placeholder: "From (optional): a name, a friend, a book…", value: item ? item.from || "" : "" });
    const forSel = canAlters && alters.length ? el("select", { className: "os-input", "aria-label": "Who it's for" },
      el("option", { value: "", textContent: "Everyone" }),
      alters.map((a) => el("option", { value: a.id, textContent: a.name || a.alias || "?", selected: item && item.for_alter_id === a.id }))) : null;
    const save = el("button", { className: "os-button", textContent: item ? "Save changes" : "Put it in the box" });
    save.onclick = async () => {
      const v = text.value.trim();
      if (!v) return;
      const fields = { text: v, kind: kind.value, from: from.value.trim(), for_alter_id: forSel ? forSel.value || null : (item ? item.for_alter_id || null : null) };
      if (item) await symphony.data.update("item", item.id, fields);
      else { const made = await symphony.data.create("item", { ...fields, favorite: false }); current = made.id; }
      view = item ? "manage" : "box";
      editing = null;
      symphony.ui.toast(item ? "Saved" : "In the box");
      render();
    };
    const label = (s) => el("label", { className: "os-label", textContent: s });
    return [el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: item ? "Edit" : "Add to the box" }),
      text, label("Kind"), kind, label("From"), from,
      forSel ? [label(`For (shown more when they're ${T("fronting", "fronting")})`), forSel] : null,
      el("div", { className: "os-row", style: "margin-top:10px" }, save,
        el("button", { className: "os-button secondary", textContent: "Cancel", onclick: () => { view = item ? "manage" : "box"; editing = null; render(); } })))];
  }

  function manageView() {
    const own = [...items].sort((a, b) => (a.created_date < b.created_date ? 1 : -1));
    const starters = el("input", { type: "checkbox", checked: startersOn() });
    starters.onchange = async () => { await saveSettings({ starters: starters.checked }); render(); };
    return [
      el("button", { className: "os-button secondary small", textContent: "‹ Back to the box", onclick: () => { view = "box"; render(); } }),
      el("div", { style: "height:8px" }),
      own.length ? own.map((i) => el("div", { className: "os-card" },
        el("p", { style: "margin:0;white-space:pre-wrap", textContent: i.text }),
        el("p", { className: "os-muted", style: "margin:4px 0 6px", textContent: [kindLabel(i.kind), i.from ? `from ${i.from}` : "", i.for_alter_id && nameOf(i.for_alter_id) ? `for ${nameOf(i.for_alter_id)}` : "", i.favorite ? "♥" : ""].filter(Boolean).join(" · ") }),
        el("div", { className: "os-row" },
          el("button", { className: "os-button secondary small", textContent: "Edit", onclick: () => { editing = i.id; view = "add"; render(); } }),
          el("button", {
            className: "os-button secondary small", textContent: "Remove",
            onclick: async () => {
              if (await symphony.ui.confirm("Take this out of the box?", "You can bring it back from Recent changes.", { confirmLabel: "Remove", destructive: true })) {
                await symphony.data.remove("item", i.id);
              }
            },
          }))))
        : el("p", { className: "os-muted", textContent: "You haven't added anything yet." }),
      el("label", { className: "os-row os-card", style: "cursor:pointer" }, starters, `Include the ${STARTERS.length} starter notes`),
    ];
  }

  function render() {
    const content = view === "add" ? form() : view === "manage" ? manageView() : boxView();
    body.replaceChildren(...[content].flat(Infinity).filter(Boolean));
  }

  symphony.onDataChange(async () => { await load(); if (view !== "add") render(); });
  render();
});
