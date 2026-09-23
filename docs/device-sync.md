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
| `symphony-sync-<system>-<device>.data.json` | entities | whenever data changes |
| `symphony-sync-<system>-<device>.media.json` | images + fonts | only when the media set changes |

Without that split, saving a status note would rewrite every avatar you
own. The media fingerprint is a cheap hash of the id set.

**Merging is the existing engine.** `mergeDbDump` already does per-record
newer-wins on `updated_date`, folds the `SystemSettings` singleton field
by field, and guards active fronting sessions. Sync did not need a new
merge strategy — only transport and scheduling.

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
- **localStorage preferences** (theme, font size, nav layout). They are
  per-device by nature; a phone should not inherit a desktop's font size.
  Layout that lives in `SystemSettings` *does* sync, because it lives in
  the database.
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
- **Android / iOS (Capacitor)** — scoped storage means the app can't be
  handed an arbitrary folder, so the location is fixed at
  `Documents/OceansSymphony`. That is reachable from a computer over USB,
  which is the point: the desktop does the reaching, the phone just keeps
  its snapshot somewhere findable.
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

## Order of operations

The runner **writes before it reads**. If a cable is pulled halfway
through, the worst outcome is that our snapshot reached the other device
and we didn't get theirs — fixed by syncing again. Reading first and
failing before the write leaves the other device with nothing.

## Not done yet

- A LAN transport. The snapshot format and merge layer are transport
  agnostic, so it would slot in beside the file adapters.
- Android has not been verified on real hardware; the adapter is written
  against the same Capacitor Filesystem API the backup path already uses,
  but it needs a phone to confirm.
