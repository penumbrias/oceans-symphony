# Making mods for Oceans Symphony

A mod adds a feature to Oceans Symphony without changing the app itself.
You write it, pack it into one `.osmod` file, and share that file. Anyone
can install it from **Mods → Install**, keep using the normal app with its
updates, and switch the mod off or remove it whenever they like.

The example in [`mods/library/little-notes`](../mods/library/little-notes)
is a complete mod in about 60 lines. Start by copying it.

Every mod in the app's mod library is in that same folder, written to be
read and copied:

| Mod | Shows you how to… |
|---|---|
| `little-notes` | the basics: save, list and remove your own records |
| `sun-dial` | draw with SVG, update on a timer, keep one settings record |
| `moon-phases` | build a month calendar, sign entries with who's in front |
| `cycle-tracker` | keep one record per day, work things out from history |
| `astrology` | tabs, list → detail → edit flows, link a record to an alter |
| `tarot-guide` | ship a large built-in reference, search and filter it |
| `comfort-box` | built-in starter content the person can switch off |
| `letters-to-later` | hide content until a date, confirm before big steps |

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
them: `os-card`, `os-button` (add `secondary` for an outline button,
`small` for a compact one), `os-input` (inputs, textareas and selects),
`os-row`, `os-muted`, `os-h` (a small heading), `os-label` (a field label),
`os-chip` (a pill button; set `aria-pressed="true"` to show it selected),
`os-tabs` (a wrapping row of chips) and `os-grid`.

`alert()`, `confirm()` and `prompt()` don't work inside the sandbox; use
`symphony.ui.toast` and `symphony.ui.confirm` instead.

### Reading the person's data (needs permission)

| Permission | Call | You get |
|---|---|---|
| `alters:read` | `symphony.alters.list()` | `[{ id, name, alias, pronouns, role, color, archived }]` |
| `fronting:read` | `symphony.fronting.current()` | `[{ alter_id, is_primary, since }]` |

`symphony.permissions` lists what was granted. A call without permission
rejects with an error; check first and show a friendly message.

### Reading the person's records (`data:read`, the heavy one)

Some mods need more than names and the current front: a journal search, a
mood chart, an export to another format. `data:read` gives a **read-only
copy** of whole kinds of records. Mods work like apps from a store here: the
app provides this, and the person decides with every risk spelled out.

`data:read` and `files:save` were designed by
[ShineSpark330](https://github.com/ShineSpark330) in their
[Apeiron Zetta fork](https://github.com/ShineSpark330/AZ). This app keeps
their API shape, so a mod written for Apeiron Zetta runs here too.

List what you want in the manifest, beside the permission:

```json
"permissions": ["data:read"],
"dataScopes": ["JournalEntry", "EmotionCheckIn"]
```

The kinds you can ask for (`READABLE_DATA` in
`src/lib/mods/modDataAccess.js`): `Alter`, `FrontingSession`, `JournalEntry`,
`EmotionCheckIn`, `SymptomCheckIn`, `Activity`, `Task`, `StatusNote`,
`Location`, `Sleep`, `SystemChangeEvent`, `Group`, `AlterNote`. Anything
else is dropped.

```js
await symphony.appData.collections();   // the kinds the person allowed, e.g. ["JournalEntry"]
const { total, offset, records } = await symphony.appData.list("JournalEntry", { offset: 0, limit: 100 });
```

How the person is asked:

- Installing never allows it. The mod's card shows a "Read your records" panel;
  the person opens a sheet that says plainly what it means (it sees
  everything in those records; nobody checks what a mod does; it can't send
  anything off the device, but it can show it or save it to a file), ticks
  each kind themselves (nothing is pre-ticked) and confirms they trust you.
- They can change or take it away at any time, and the card shows when your
  mod last read anything.
- An update that asks for **more** kinds of records than before loses the
  permission until the person says yes again.

What you get is cleaned first: whispers are masked, locked journal entries
come with `content: null, locked: true`, fields that start with `_` and
anything named like a secret are left out, and trashed records never appear.
Pages hold up to 500 records and 4 MB; ask for less if a page is too big.

**Ask for as little as you can.** Every kind you list is one more thing the
person has to trust you with, and the sheet says so.

### Saving files (`files:save`)

```js
const result = await symphony.ui.saveFile("moods.csv", new Blob([csv], { type: "text/csv" }), "text/csv");
// "downloaded", "shared", "cancelled" or "failed"
```

The app asks the person **every time**, naming your mod, the file and its
size, so only call this when they've just asked for a file (pressed your
Export button). Up to 100 MB.

### Interface helpers

```js
symphony.ui.toast("Saved");         // the app's own toast
symphony.ui.openPage("settings");   // go to another page of your mod
const ok = await symphony.ui.confirm("Remove this?", "You can bring it back from Recent changes.",
  { confirmLabel: "Remove", destructive: true });   // the app's own dialog → true / false
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
- **No changing anything outside its own data.** Mods can read core data
  with permission (and, with `data:read`, whole kinds of records the person
  allowed), but can't create, change or delete alters, fronts, journals or
  anything else the app owns.
- **No saving files behind the person's back.** `files:save` always asks.
- **No background running.** A mod's code only runs while one of its pages is
  open.
- No `localStorage`/`indexedDB` (use `symphony.data`), no popups, no
  navigating away (a mod frame that tries is stopped).

## Rules for every mod

These aren't enforced by code (the sandbox enforces the hard limits above).
They're what makes a mod feel like part of Oceans Symphony instead of
something bolted on, and every mod in the built-in library follows them.

### 1. The person's data comes first

- **Never lose anything.** Prefer adding records to overwriting them. If your
  mod is a log (moods, counts, notes), each entry is a new record.
- **Removing is a choice the person makes.** Ask before `symphony.data.remove`,
  and say what will go. Never clear a collection as a "reset" without asking.
- **Keep old data readable.** When you change a record's shape in a new
  version, keep reading the old shape. Don't rewrite every record on start-up.
- **Don't keep copies of core data.** Read alters or the front when you need
  them; don't save names or ids into your own records except as a reference
  (an `alter_id`), so a rename or a deletion in the app isn't contradicted by
  your mod.

### 2. Use the person's words

People rename "alter", "system", "front" and "switch", and it matters to
them. Every word your mod shows that has a term goes through
`symphony.terms` — headings, buttons, placeholders, empty states, error
messages, all of it. "Headmate" counts too: use `symphony.terms.alter`.
Manifest text (`description`) can use `{{alters}}`-style placeholders; the
app fills them in.

### 3. Work with less than you asked for

Every permission can be refused, at install or later. Check
`symphony.permissions` before each call that needs one, and when it's
missing, keep working with what you have and say kindly what turning it on
would add. A page that just errors is a broken mod.

### 4. No medical claims

Oceans Symphony is a journaling and organising tool, not a medical product.
A mod must not diagnose, promise to treat anything, or present itself as a
replacement for care. If your mod touches crisis, safety or symptoms, say
plainly that it isn't medical advice, and never make a crisis feature depend
on your mod working.

### 5. Gentle by default

People open this app on hard days. No guilt-tripping streaks, no red alarm
text for missed days, no sudden sounds or flashing. Make anything
intense (timers, alarms, content warnings) opt-in.

### 6. Easy to use for everyone

- Use the `os-*` classes or the theme variables, so your mod follows the
  person's colours, dark mode and text size.
- Real `<button>`, `<input>` and `<label>` elements, with text (or an
  `aria-label`) on every control.
- Tap targets at least 40px; everything reachable without hover.
- It has to work on a phone first: one column, no horizontal scrolling.

### 7. Be honest

Your description says what the mod does and what it asks to see, and why.
Ask only for permissions you use. Don't hide features behind the mod's name.

## Versions and updates

- `version` is yours to choose; use `major.minor.patch` and raise it on every
  release. Installing a file with the same `id` updates the mod in place.
- An update keeps the mod's data and whether it's on. Permissions the person
  already granted stay granted; **a permission your new version adds is not
  granted** until the person ticks it, so check for it (rule 3).
- Never change your `id`. It's what ties people's data to your mod.

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

## Getting into the mod library

The mod library is the list of mods that come with the app (Mods page →
Mod library). Each one is a folder in [`mods/library`](../mods/library), the
same `manifest.json` + `main.js` you'd pack into a file. The app finds every
folder there by itself; there is no list to edit.

To propose a mod for the library, open a pull request that adds its folder.
It's reviewed like any other change to the app, against this checklist:

- [ ] Follows every rule above (data first, terms, missing permissions, no
      medical claims, gentle, accessible, honest).
- [ ] Folder name is the mod's `id`; the manifest parses
      (`node scripts/test-mod-library.mjs` passes).
- [ ] Plain JavaScript in one `main.js`, readable (not minified), with a
      short comment at the top saying what it does.
- [ ] Works with every permission refused, and on a phone-sized screen in
      light and dark mode.
- [ ] Has an empty state that tells a first-time user what to do.
- [ ] Doesn't ask for `data:read` unless the mod can't exist without it, and
      then only for the kinds of records it actually reads.
- [ ] A changelog entry in `src/lib/changelog.js` naming the new mod.

Library mods update along with the app: when a new app version ships a
different `version` of a library mod, the installed copy is swapped for it
on the next launch (data, on/off state and granted permissions kept). A mod
someone installed from a file with the same `id` is never touched.

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
  and the nav catalogue, and keeps library mods up to date.
- `src/lib/mods/builtinMods.js`: the mod library. Finds `mods/library/*`
  with `import.meta.glob`; manifests are bundled, each mod's code is a lazy
  chunk loaded only when it's added or updated. Installed rows carry
  `source: "builtin"` or `"file"`.
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
