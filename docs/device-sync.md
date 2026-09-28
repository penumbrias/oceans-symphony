# Device sync

Two of your own devices kept in step, with no cloud, no account and no
server. Added in v0.242.0.

The app does not open a network connection to do this. It reads and
writes **files** in a folder you choose — a phone plugged in over USB, a
USB stick, anything local. "Nothing leaves your devices" is guaranteed by
construction here, not by policy: there is no code path that could send
data anywhere.

## How it works

**One file per device.** Every device writes only its own file and reads
everyone else's. That removes write conflicts entirely — no two writers
ever touch the same path, so there is no last-writer-wins race and no
`.sync-conflict` copies to reconcile.

Two files per device, split deliberately:

| File | Contents | Rewritten |
|---|---|---|
| `symphony-sync-<system>-<device>.data.json` | entities | on the next pass after data changes (content-hashed) |
| `symphony-sync-<system>-<device>.media.json` | images + fonts | only when the media set changes |

Without that split, saving a status note would rewrite every avatar you
own. The media fingerprint is a cheap hash of the id set.

**Merging is field by field (v0.245.0).** `mergeDbDump` uses the rules in
`src/lib/syncMerge.js`. Every record written by the entity proxy carries
`_ft`, the time each field last changed (`_ft.__base` covers untouched
fields). Two copies of a record merge per field, and the newer change to
that field wins. An edit on one device therefore never drags the other
device's stale copy of every other field along, and a deliberate clear
stays cleared. Records from older builds have no `_ft`, so each of their
fields counts as old as `updated_date`; their empty values never blank a
local value, and an empty local field with no time of its own is still
filled in.

Task completions (`DailyProgress`) are one record per
`frequency::period_key`. Incoming records fold into the local record for
the same period, whatever its id, and the tick set merges task by task.
A task stays ticked while its latest tick is newer than its latest
untick (`cleared_times`). Duplicates of one period, left by an old create
race, fold into one keeper: the earliest created, then the smallest id,
so every device picks the same one. Writes go through the serialized
`toggleDailyProgressTasks`.

(The pre-0.245 rule was whole-record newer-wins. Stage 1 of
docs/audit-2026-09-25/sync-merge-audit.md explains why it lost data.)

**Stage 2–3 rules (v0.246.0):**

- **Fronting sessions:** sessions are never reopened, so an end is a
  fact. A session ended on either device is ended on both, at that
  device's end time; a still-running copy never un-ends it, and a session
  is never rewritten to end at its own start. A session that is NEW here
  and still live on the other device arrives as history (`sync_demoted`)
  while a front is live here; the live front here is never replaced.
- **Settings (`SystemSettings`):** in a row from an older build, a field
  has no known age, because widget drags bump `updated_date`. So a
  timed edit on either device wins over it, and two old rows keep their
  own values. Incoming settings fold into the row the app reads
  (`pickPrimarySystemSettings`).
- **Logs union:** `Presence.sightings` and `FrontingSession.note` keep
  every entry from both devices (`LOG_FIELDS` in syncMerge.js).
- **Presets linked:** an incoming preset that matches a local one by
  content (`MERGE_CONTENT_KEYS`) under a different id is aliased to the
  local id throughout the incoming data before merging. The other
  device's ticks and symptom logs then point at this device's rows.
- **Recent changes → "Changed by sync":** every value a merge replaced
  or cleared keeps the before-version there, restorable. Conflict-review
  choices go through `applyChosenVersion`, which stamps them as new
  edits so the rejected version can't win the next sync.
- **Auto-sync publishes local edits:** a pass runs when another device's
  file changed or when this device has written anything since the last
  pass (`getLocalRevision`). Our data file is only rewritten when its
  content hash changed. This ended the 30-second rewrite ping-pong
  between two open devices.

## Sync never deletes

This is a rule, not a default, and `applyDeletions` is hard-coded to
`false` at the call site in `applyDataSnapshot`.

The reasoning is that someone may well be syncing *because* they want
deleted data back. With deletions not applied, incoming tombstones are
ignored and local tombstones don't suppress incoming records — so
syncing from a device that still has a record genuinely restores it.
That behaviour is a feature here, not a leak.

Deletions the other device made are surfaced in a review list
("Deleted on another device, still here") with Keep and Delete-here-too
per item. Choosing to delete goes through the normal entity delete, so it
writes a tombstone and a `HistoryEvent` snapshot — still recoverable from
Recent changes.

## What is deliberately not synced

- **Device-bound entities** (`FriendIdentity`, `PushSubscription`) —
  stripped on write by `stripDeviceBound` and again on read inside
  `mergeDbDump`. Copying a Friends identity to a second device is
  impersonation, not sync.
- **Appearance and layout are never synced automatically** (owner's
  rule, v0.243.7: the desktop and the phone are meant to look
  different). Each snapshot carries them in a separate `appearance`
  section — the localStorage preferences (theme, fonts, accessibility)
  plus the SystemSettings look/layout fields listed in
  `src/lib/syncLook.js` (home boards, bars, navigation, dashboard layout,
  pinned-alters strip, corners, wave, banner crop, plan surfaces, toast
  prefs). Nothing applies that section except the explicit "Use another
  device's appearance" button, which writes the layout through the normal
  entity update so the previous layout lands in Recent changes.

  Incoming SystemSettings rows are also stripped of those fields before
  the newer-wins merge, because peers on older builds still send them
  inside the record. The merge only overwrites fields an incoming record
  actually carries, so a device on an older build simply keeps its own
  layout when it reads a new snapshot.

  Before this, preferences filled gaps and the settings record merged
  newer-wins: resizing a widget on the desktop rewrote the phone's home
  layout on the next sync (seen Sept 25, 2026).
- **The device id.** See below — this one matters.

## The device id must stay device-bound

`symphony_sync_device_id` is deliberately **not** in `BACKUP_LS_KEYS` and
not in the settings mirror. If it rode along in a backup, restoring onto
a second machine would clone it — both devices would then write to the
same filename and silently overwrite each other's snapshot. That is the
one way a per-device-file scheme can lose data. Same reasoning as
`FriendIdentity` being excluded from backups.

## Encryption

Sync files mirror the device's storage mode: **if the app is encrypted
here, its snapshots are encrypted too.** One rule, easy to explain, and
it means an encrypted user can never be surprised by a plaintext dump of
their journals sitting on a phone's storage.

The header (which device, when, which system) stays readable either way,
so the UI can list peers without a passphrase. Only the payload is
ciphertext. Two devices must use the same passphrase to read each other's
snapshots; a mismatch reports itself rather than failing silently.

## Platforms

Everything platform-specific lives in `src/lib/syncAdapters.js` behind one
small interface, so a new platform is a new adapter rather than a rewrite.

- **Desktop (Electron)** — the user picks any folder. Point it at a
  plugged-in phone's storage or a USB stick. Fully implemented and
  verified end to end.
- **Android (Storage Access Framework, v0.243.6)** — the user grants the
  folder once through the system folder picker (opened at
  `Documents/OceansSymphony`), and the native `SyncFolder` plugin
  (`android/.../SyncFolderPlugin.java`, bridge `src/lib/nativeSyncFolder.js`)
  lists, reads, writes and removes snapshots through that persisted grant.
  This replaced a fixed-folder `@capacitor/filesystem` adapter that could
  only sync ONE way: under scoped storage an app can't see files it didn't
  create, so the desktop's snapshot (copied in over USB) was invisible to
  the phone. Verified on a Galaxy S24 / Android 16 with `adb run-as`: the
  desktop's file was in the folder and the app's listing omitted it. The
  handle is stored as JSON `{ uri, docId, name }` in `symphony_sync_folder`;
  if the user picks `Documents` itself, the plugin works inside its
  `OceansSymphony` subfolder so both devices keep meeting in one place.
  "All files access" (`MANAGE_EXTERNAL_STORAGE`) was rejected as the fix —
  Play rarely approves it for this kind of app.
- **iOS (Capacitor)** — fixed location `Documents/OceansSymphony` in the
  app's own Documents, via `@capacitor/filesystem`.
- **Web / TWA** — not offered. A browser tab can't keep access to a
  folder between visits. The panel says so instead of showing a button
  that won't work.

There is no `watch()` in the adapter interface on purpose: inotify-style
watching silently never fires on MTP mounts and removable media. The
runner polls by mtime instead.

## Desktop containment

The renderer can name a directory, but `electron/main.cjs` refuses any
operation whose **filename** isn't one of our own snapshot files
(`SYNC_FILE_RE`). So even a compromised renderer can't read `~/.ssh` or
overwrite documents through this channel — the worst it can do is touch
files it already owns. Writes go to a `.part` file and are renamed, so a
yanked cable can't leave a half-written snapshot for the other device to
merge; the `.part` name is itself rejected by the filter, so it is never
listed or read. MTP doesn't always support rename, so there is a direct-
write fallback.

## Writing to a phone over USB (gvfs / MTP)

An Android phone mounted over USB appears under
`/run/user/<uid>/gvfs/mtp:host=.../`, and that FUSE layer **rejects every
POSIX write**. Verified against a Samsung device: `writeFile`,
`copyFile`, write streams and `rename` all fail with `ENOTSUP`, whether
creating or overwriting — and so does plain `cp`. Reads and `unlink`
work fine; it is writes specifically.

What does work is `gio copy`, because GIO talks to the gvfs daemon
directly instead of going through the FUSE mount. So the desktop write
path tries POSIX first (right for every normal disk) and falls back to
staging a local temp file and handing it to `gio`. `gio` ships with
glib2 and is by definition present when the path is a gvfs mount, since
that is what mounted it.

## Two devices, two system ids

A system id is minted per install, not per person, so a phone and a
desktop set up separately always have different ones. Scoping sync to
"same system id" therefore meant the main use case could never work.

Merging anything found in the folder would be wrong too — a multi-system
user pointing two systems at one folder would have them blended
irreversibly. So **the folder is the pairing, confirmed once**: an
unrecognised system is reported in the UI ("Another device is using a
different system") and merged only after the user pairs it. Pairings are
remembered per local system.

## A bad snapshot must not look like a broken sync

Two things leave unusable files in the folder: a device that gets
reinstalled (a fresh install mints a new device id, so its old file stays
behind forever) and a write that is cut off part-way.

Both were originally reported to the user as a bare "That file isn't
readable JSON", which reads as "sync is broken" when in fact every other
device had synced fine. Now an unparseable snapshot is collected in
`report.unreadable` with its filename, the rest of the pass continues,
and the panel offers to remove it. Removal goes through the same
filename-guarded channel as read and write, so it can only ever delete a
snapshot.

Writes are staged and moved into place on BOTH platforms so a partial
write never becomes the live snapshot — `.part` then rename on desktop
(with a `gio copy` fallback for MTP, which is not atomic), and the same
on Capacitor. `.part` is deliberately outside the pattern readers accept,
so a leftover fragment is invisible rather than merged.

## Order of operations

The runner **writes before it reads**. If a cable is pulled halfway
through, the worst outcome is that our snapshot reached the other device
and we didn't get theirs — fixed by syncing again. Reading first and
failing before the write leaves the other device with nothing.

## Setting up a new device

The desktop first-run screen (`DesktopFirstRunNotice`) offers "Sync from
another device" above "Import a backup file", because if the other device
is on the end of a cable then exporting a file, finding it and importing
it is three steps of busywork for something sync already does.

Pairing is implicit in that flow: choosing a folder to pull from IS the
confirmation, so the usual "another device is using a different system"
prompt would be asking again about a decision already made. A database
has to exist before anything can merge into it, so the flow runs
StorageModeSetup's `setupLocalStorage` first (passed in as `prepare`).

## Putting a device's old layout back

`scripts/sync-restore-layout.mjs` lifts a layout value out of one device's
undo history (its snapshot's `HistoryEvent` table) and writes it into the
folder as a data-less "Layout restore" device for another system. On the
target device, "Use look" on that entry applies it through the normal
confirmed, undoable path. Written for the Sept 25, 2026 case where the
desktop's widget resize overwrote the phone's home layout before look
fields stopped syncing. `--list`, write, then `--remove` when done.

"Use look" is per device (v0.243.8). It used to be one button that took
the NEWEST device in the folder, which is whichever wrote last, so with two
devices it could apply the wrong one's look.

## Testing with one device

`scripts/sync-test-peer.mjs` impersonates a second device so sync can be
exercised without two machines. Point the desktop app at a folder and
press Sync once (so there is a snapshot to copy the system id from), then:

```bash
node scripts/sync-test-peer.mjs <folder>                   # list what's there
node scripts/sync-test-peer.mjs <folder> --add "New name"  # peer sends a record
node scripts/sync-test-peer.mjs <folder> --delete-last     # peer claims it deleted it
```

`--delete-last` is the interesting one: after syncing, the record must
still be present AND listed under "Deleted on another device, still
here". Unencrypted snapshots only — forging into an encrypted body would
require the passphrase, which is the point of it.

## Not done yet

- A LAN transport. The snapshot format and merge layer are transport
  agnostic, so it would slot in beside the file adapters.
- The Android SAF adapter compiles and the scoped-storage failure it fixes
  was confirmed on hardware; the full desktop → phone round trip through
  the picker still needs a pass on a real phone.

## Peers are per device AND system

`listSyncPeers` groups files by `deviceId:systemId`, and the seen-marks
use the same key. One device can leave snapshots for two systems in the
folder (a multi-system user, or an old system left behind after a
reinstall). Grouped by device alone, the second file overwrote the
first's data slot while the entry kept the first system's id — pairing
one system could merge the other's data. The desktop first-run flow pairs
only each device's newest system for the same reason, and the background
"anything new?" poll ignores unpaired peers (an unpaired file is never
marked seen, so it used to trigger a full pass every 30 seconds).
