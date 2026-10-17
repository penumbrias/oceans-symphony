# Making mods for Oceans Symphony

A mod adds a feature to Oceans Symphony without changing the app itself.
You write it, pack it into one `.osmod` file, and share that file. Anyone
can install it from **Mods → Install**, keep using the normal app with its
updates, and switch the mod off or remove it whenever they like.

The example in [`mods/examples/little-notes`](../mods/examples/little-notes)
is a complete mod in about 60 lines. Start by copying it.

## What a mod is

A folder with two files:

```
my-mod/
  manifest.json   who you are, what you add, what you need to see
  main.js         your code (one file; bundle it first if you use npm packages)
```

Pack it into a shareable file:

```
node scripts/pack-mod.mjs path/to/my-mod
# → path/to/my-mod/my-mod-1.0.0.osmod
```

The `.osmod` file is plain JSON: the manifest with your code in a `code` field.

### manifest.json

```json
{
  "id": "twin-notes",
  "name": "Twin notes",
  "version": "1.0.0",
  "author": "Your name",
  "description": "One or two sentences people see before installing.",
  "homepage": "https://example.com/twin-notes",
  "permissions": ["alters:read"],
  "pages": [
    { "id": "notes", "title": "Twin notes" },
    { "id": "settings", "title": "Twin notes settings" }
  ]
}
```

- `id`: lowercase letters, numbers and dashes. It's the mod's identity: a file
  with the same `id` installs as an **update**, and the mod's saved data is
  tied to it. Never change it after you've shared the mod.
- `pages`: up to 12. Each page appears in the app's navigation (people can
  pin it to their bars or dashboard like any other page).
- `permissions`: only what you need. People see each one in plain words and
  can say no; your mod must still work (show a message) when one is missing.
- `homepage`: optional, `https://` only. Shown as an "About" link.

## The `symphony` API

Your code runs with one global, `symphony`. Every call that touches data
returns a Promise.

### Pages

```js
symphony.registerPage("notes", async (root, symphony) => {
  root.textContent = "Hello!";
});
```

Each page opens in its own frame, runs your whole `main.js`, then calls the
renderer for that page id with an empty `root` element. Draw with plain DOM,
or bundle a small framework (Preact, Lit…) into `main.js`. The frame grows to
fit your content.

### Your own data

```js
const note = await symphony.data.create("note", { text: "hi", pinned: false });
await symphony.data.update("note", note.id, { pinned: true });
const all = await symphony.data.list("note");              // oldest first
const pinned = await symphony.data.list("note", { pinned: true }); // simple equality filter
const one = await symphony.data.get("note", note.id);      // or null
await symphony.data.remove("note", note.id);
symphony.onDataChange((change) => redraw());               // any change to your data, from anywhere
```

- Collections are names you choose (letters, numbers, `-`, `_`).
- Records are plain JSON objects, up to 256 KB and 100 fields. Field names are
  letters, numbers and `_`, starting with a letter. `id`, `created_date` and
  `updated_date` are set by the app.
- Your data is stored with everything else: encrypted if the person uses
  encryption, included in their backups, synced between their devices, and
  removed records can be restored from Recent changes. It is **kept** when
  the mod is removed, and comes back if it's installed again.

### The person's words and colours

```js
symphony.terms.alter     // "alter", or whatever they call alters
symphony.terms.Alters    // capitalised plural
symphony.terms.fronting, symphony.terms.system, symphony.terms.switch …
symphony.theme           // reserved
```

Always use `symphony.terms` instead of writing "alter", "system", "front" or
"switch" yourself. People customise these words and it matters to them.

The app's colours arrive as CSS variables (`--color-bg`, `--color-surface`,
`--color-primary`, `--color-text-primary`, `--color-text-secondary`,
`--color-muted`, `--radius`, `--font-sans`). A few ready-made classes use
them: `os-card`, `os-button` (add `secondary` for an outline button),
`os-input`, `os-row`, `os-muted`.

### Reading the person's data (needs permission)

| Permission | Call | You get |
|---|---|---|
| `alters:read` | `symphony.alters.list()` | `[{ id, name, alias, pronouns, role, color, archived }]` |
| `fronting:read` | `symphony.fronting.current()` | `[{ alter_id, is_primary, since }]` |

`symphony.permissions` lists what was granted. A call without permission
rejects with an error; check first and show a friendly message.

More read permissions (journals, history, custom fields…) will be added over
time. Ask for what you need in the Oceans Symphony repo.

### Interface helpers

```js
symphony.ui.toast("Saved");         // the app's own toast
symphony.ui.openPage("settings");   // go to another page of your mod
symphony.mod                        // { id, name, version }
symphony.page                       // the page id being shown
```

## What mods can't do (on purpose)

People keep their whole system's history in this app, so mods are walled off:

- **No access to the app's storage.** Mods run in a sandboxed frame with its
  own empty origin; the browser itself stops it reading the app's database,
  settings or files.
- **No network.** `fetch`, XHR, WebSockets, WebRTC, remote images, fonts and
  scripts are all blocked. A mod can't send anything off the device. Bundle
  every asset into `main.js` (images as `data:` URLs).
- **No changing anything outside its own data.** Mods can read some core data
  with permission, but can't create, change or delete alters, fronts,
  journals or anything else the app owns.
- **No background running.** A mod's code only runs while one of its pages is
  open.
- No `localStorage`/`indexedDB` (use `symphony.data`), no popups, no
  navigating away (a mod frame that tries is stopped).

## Testing your mod

1. `node scripts/pack-mod.mjs my-mod`
2. In the app: **Mods → Install**, pick the `.osmod` file.
3. Change your code, pack again, install the same file again: it updates in
   place and keeps your test data.

Errors thrown by your code show up in the page frame. On the web build you
can also use the browser's dev tools; the frame's script is named
`mod-<id>.js`.

## Sharing

Share the `.osmod` file however you like. Tell people what it does and what
it asks to see. Oceans Symphony doesn't review mods, so people are told to
install only mods from people they trust. Be that person.

---

## How it works (for app contributors)

- `public/mod-host.html` + `public/mod-host.js`: the sandbox page. Loaded in
  `<iframe sandbox="allow-scripts">` (opaque origin). Its own CSP blocks all
  network; it refuses to run if Capacitor's native bridge is visible in the
  frame (old Android WebViews expose it to every frame).
- `src/lib/mods/broker.js`: answers every call; the only code that touches
  the database for a mod.
- `src/lib/mods/modPackage.js`: parses and checks `.osmod` files, and lists
  the permissions.
- `src/lib/mods/modStore.js`: `ModPackage` / `ModData` entities, install,
  remove, data export and delete (always saves a copy first).
- `src/lib/mods/registry.js`: puts mod pages into `ALL_PAGES`, the sidebar
  and the nav catalogue.
- `src/components/mods/ModFrame.jsx`, `src/pages/Mods.jsx`,
  `src/pages/ModPage.jsx`: the screens.
- The parent page's CSP `frame-src 'self' blob:` also blocks a mod frame from
  navigating to another site; `ModFrame` stops a frame that loads twice.
- On the web, `vercel.json` gives `/mod-host.html` its own headers (it must be
  frameable by the app, unlike every other page).

Known limits of the sandbox: it is the browser's, so it's strong, but a mod
is still code someone else wrote. The real protection is that a mod only ever
receives the data its permissions name. Keep new permissions narrow, and
describe them honestly in `MOD_PERMISSIONS`.
