// Little notes: an example Oceans Symphony mod. See docs/mods.md.
//
// `symphony` is the only thing a mod gets from the app. Everything here is
// plain browser JavaScript drawing into the page's root element.

symphony.registerPage("notes", async (root) => {
  const t = symphony.terms;               // the person's own words
  const canSeeAlters = symphony.permissions.includes("alters:read");
  const canSeeFront = symphony.permissions.includes("fronting:read");

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const k of kids) n.append(k);
    return n;
  };

  const alters = canSeeAlters ? await symphony.alters.list() : [];
  const nameOf = (id) => (alters.find((a) => a.id === id) || {}).name || "";

  async function currentSigner() {
    if (!canSeeFront) return null;
    const front = await symphony.fronting.current();
    const primary = front.find((f) => f.is_primary) || front[0];
    return primary ? primary.alter_id : null;
  }

  const input = el("textarea", { className: "os-input", rows: 3, placeholder: "Write a little note…" });
  const save = el("button", { className: "os-button", textContent: "Save note" });
  const list = el("div");
  root.append(
    el("div", { className: "os-card" },
      input,
      el("div", { className: "os-row", style: "margin-top:8px;justify-content:space-between" },
        el("span", { className: "os-muted", textContent: canSeeFront ? `Signed with whoever is ${t.fronting || "fronting"}` : "Unsigned" }),
        save)),
    list,
  );

  async function draw() {
    const notes = await symphony.data.list("note");
    notes.sort((a, b) => (a.created_date < b.created_date ? 1 : -1));
    list.replaceChildren(...(notes.length ? notes.map((n) => {
      const del = el("button", { className: "os-button secondary", textContent: "Remove" });
      del.onclick = async () => {
        // Ask first: removing is the person's choice (docs/mods.md, rule 1).
        if (await symphony.ui.confirm("Remove this note?", "You can bring it back from Recent changes.", { confirmLabel: "Remove", destructive: true })) {
          await symphony.data.remove("note", n.id);
        }
      };
      const who = n.alter_id ? nameOf(n.alter_id) : "";
      return el("div", { className: "os-card" },
        el("div", { textContent: n.text }),
        el("div", { className: "os-row", style: "margin-top:6px;justify-content:space-between" },
          el("span", { className: "os-muted", textContent: `${who ? who + " · " : ""}${new Date(n.created_date).toLocaleString()}` }),
          del));
    }) : [el("p", { className: "os-muted", textContent: "No notes yet." })]));
  }

  save.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    await symphony.data.create("note", { text, alter_id: await currentSigner() });
    input.value = "";
    symphony.ui.toast("Note saved");
  };

  symphony.onDataChange(draw);   // redraw after saves, removes, syncs
  await draw();
});
