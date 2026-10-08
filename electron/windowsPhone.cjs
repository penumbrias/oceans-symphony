// Windows: device sync straight to a phone plugged in over USB.
//
// Why this exists: Windows exposes an Android phone over MTP. File
// Explorer shows it, but it is not a filesystem path, so Node's fs and the
// folder picker can't reach it (Linux mounts the same phone through gvfs,
// which is why the plain folder code works there). The Windows Shell CAN
// reach it — Explorer is built on it — so every operation here runs a small
// PowerShell script that drives the Shell COM object (Shell.Application).
// No native module, nothing to install.
//
// The phone's sync folder is addressed as a "phone path":
//   phone://<device name>/<storage name>
// meaning <storage>\Documents\OceansSymphony on that device — the folder the
// phone app syncs into by default. main.cjs stores it like any folder path
// and routes list/read/write/remove here when it sees the prefix.
//
// DATA SAFETY:
//   * Only our own snapshot files are touched (main.cjs's badName guard
//     runs before anything here, and the script re-checks the pattern).
//   * Replacing the desktop's snapshot on the phone MOVES the old copy into
//     a local holding folder first (MTP ignores "overwrite" flags and would
//     pop a Replace/Skip dialog), then copies the new one. If the new copy
//     doesn't arrive, the old one is put back.
//   * Nothing is ever deleted on the phone outright: "remove" moves the
//     file to this PC, and main deletes that local copy.
//
// Every script run is serialized: two Shell copies racing on one MTP
// device is how Explorer itself gets confused.

const { execFile } = require('node:child_process');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const PREFIX = 'phone://';

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$shell = New-Object -ComObject Shell.Application
$FLAGS = 4 + 16 + 512 + 1024
$SYNC_RE = '^symphony-sync-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.(data|media)\.json$'

function Out-Result($o) { [Console]::Out.Write((ConvertTo-Json -InputObject $o -Compress -Depth 5)) }

# FolderItem.Name hides the extension when Explorer is set to; the real
# file name comes from the property system.
function Get-FileName($item) {
  $n = $null
  try { $n = $item.ExtendedProperty('System.FileName') } catch {}
  if (-not $n) { $n = $item.Name }
  return [string]$n
}

function Find-Child($folder, $name) {
  foreach ($i in $folder.Items()) { if ($i.IsFolder -and $i.Name -eq $name) { return $i } }
  return $null
}

function Find-File($folder, $name) {
  foreach ($i in $folder.Items()) {
    if (-not $i.IsFolder -and (Get-FileName $i) -eq $name) { return $i }
  }
  return $null
}

function Is-Drive($item) { return ([string]$item.Path) -match '^[A-Za-z]:\\' }

function Get-Devices {
  $out = @()
  foreach ($d in $shell.NameSpace(17).Items()) {
    if (Is-Drive $d) { continue }
    if (-not $d.IsFolder) { continue }
    $storages = @()
    try { $storages = @($d.GetFolder.Items() | Where-Object { $_.IsFolder }) } catch {}
    if ($storages.Count -eq 0) {
      # A phone that is locked, or not in File Transfer mode, shows up with
      # nothing inside. Report it so the app can say what to do.
      $out += [pscustomobject]@{ device = [string]$d.Name; storage = $null; hasFolder = $false }
      continue
    }
    foreach ($s in $storages) {
      $has = $false
      try {
        $docs = Find-Child $s.GetFolder 'Documents'
        if ($docs) { $has = [bool](Find-Child $docs.GetFolder 'OceansSymphony') }
      } catch {}
      $out += [pscustomobject]@{ device = [string]$d.Name; storage = [string]$s.Name; hasFolder = $has }
    }
  }
  return ,$out
}

function Resolve-Target {
  # Test mode: the same Shell calls against a normal folder.
  if ($env:SYM_LOCAL) { return $shell.NameSpace($env:SYM_LOCAL) }
  $dev = $null
  foreach ($d in $shell.NameSpace(17).Items()) {
    if (-not (Is-Drive $d) -and $d.Name -eq $env:SYM_DEVICE) { $dev = $d; break }
  }
  if (-not $dev) { throw 'PHONE_NOT_FOUND' }
  $st = Find-Child $dev.GetFolder $env:SYM_STORAGE
  if (-not $st) { throw 'PHONE_LOCKED' }
  $docs = Find-Child $st.GetFolder 'Documents'
  if (-not $docs) { throw 'FOLDER_NOT_FOUND' }
  $f = Find-Child $docs.GetFolder 'OceansSymphony'
  if (-not $f) { throw 'FOLDER_NOT_FOUND' }
  return $f.GetFolder
}

# Done when the copy is complete: the file exists, nothing holds it open,
# and either it has the expected size or its size has stopped changing.
# Android's MTP can report a stale size for a file the app rewrote, so the
# expected size alone is not trusted (waiting on it is how a sync hangs).
function Wait-Local($file, $expected, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  $last = -1; $stable = 0
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $file) {
      try {
        $fs = [IO.File]::Open($file, 'Open', 'Read', 'None')
        $len = $fs.Length
        $fs.Close()
        if ($expected -gt 0 -and $len -eq $expected) { return $true }
        if ($len -gt 0 -and $len -eq $last) { $stable++ } else { $stable = 0 }
        $last = $len
        if ($stable -ge 4) { return $true }
      } catch {}
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

# Moves our own file off the target into a local folder. Used to replace
# (MTP pops a dialog instead of overwriting) and to remove.
function Move-Off($name, $toDir) {
  $f = Resolve-Target
  $old = Find-File $f $name
  if (-not $old) { return $false }
  $size = [int64]$old.Size
  $shell.NameSpace($toDir).MoveHere($old, $FLAGS)
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    $gone = -not (Find-File (Resolve-Target) $name)
    if ($gone -and (Wait-Local (Join-Path $toDir $name) $size 3)) { return $true }
  }
  throw 'MOVE_TIMEOUT'
}

function Wait-Target($name, $expected, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  $last = -1; $stable = 0
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    $i = Find-File (Resolve-Target) $name
    if (-not $i) { $stable = 0; $last = -1; continue }
    $size = [int64]$i.Size
    if ($size -eq $expected) { return $true }
    # Some phones report 0 or a rounded size for a new object; accept it
    # once it has been present and unchanged for a few seconds.
    if ($size -eq $last) { $stable++ } else { $stable = 0 }
    $last = $size
    if ($stable -ge 10) { return $true }
  }
  return $false
}

try {
  switch ($env:SYM_OP) {
    'devices' {
      Out-Result @{ ok = $true; devices = (Get-Devices) }
    }
    'list' {
      $f = Resolve-Target
      $files = @()
      foreach ($i in $f.Items()) {
        if ($i.IsFolder) { continue }
        $n = Get-FileName $i
        if ($n -notmatch $SYNC_RE) { continue }
        $mt = 0
        try { $mt = ([DateTimeOffset]$i.ModifyDate).ToUnixTimeMilliseconds() } catch {}
        $files += [pscustomobject]@{ name = $n; size = [int64]$i.Size; mtimeMs = [int64]$mt }
      }
      Out-Result @{ ok = $true; files = $files }
    }
    'read' {
      $name = $env:SYM_NAME
      if ($name -notmatch $SYNC_RE) { throw 'BAD_NAME' }
      $item = Find-File (Resolve-Target) $name
      if (-not $item) { throw 'FILE_NOT_FOUND' }
      $size = [int64]$item.Size
      $shell.NameSpace($env:SYM_TMP).CopyHere($item, $FLAGS)
      if (-not (Wait-Local (Join-Path $env:SYM_TMP $name) $size 180)) { throw 'COPY_TIMEOUT' }
      Out-Result @{ ok = $true }
    }
    'write' {
      $name = $env:SYM_NAME
      if ($name -notmatch $SYNC_RE) { throw 'BAD_NAME' }
      $src = Join-Path $env:SYM_TMP $name
      $size = (Get-Item -LiteralPath $src).Length
      $moved = Move-Off $name $env:SYM_BAK
      (Resolve-Target).CopyHere($src, $FLAGS)
      if (Wait-Target $name $size 180) { Out-Result @{ ok = $true; replaced = $moved }; break }
      # The new copy never arrived whole. Put the previous one back so the
      # phone still has the desktop's last complete snapshot.
      $restored = $false
      if ($moved -and -not (Find-File (Resolve-Target) $name)) {
        (Resolve-Target).CopyHere((Join-Path $env:SYM_BAK $name), $FLAGS)
        $restored = Wait-Target $name ((Get-Item -LiteralPath (Join-Path $env:SYM_BAK $name)).Length) 120
      }
      Out-Result @{ ok = $false; error = 'WRITE_TIMEOUT'; restored = $restored }
    }
    'remove' {
      $name = $env:SYM_NAME
      if ($name -notmatch $SYNC_RE) { throw 'BAD_NAME' }
      $moved = Move-Off $name $env:SYM_BAK
      Out-Result @{ ok = $true; removed = $moved }
    }
    default { throw 'BAD_OP' }
  }
} catch {
  Out-Result @{ ok = $false; error = [string]$_.Exception.Message }
}
`;

// What each script error means, in words a person can act on.
const MESSAGES = {
  PHONE_NOT_FOUND: "The phone isn't showing up. Check it's plugged in, unlocked, and set to File transfer.",
  PHONE_LOCKED: "The phone is connected but its storage isn't visible. Unlock it and set USB to File transfer.",
  FOLDER_NOT_FOUND: "There's no Documents/OceansSymphony folder on the phone yet. Press Sync once in the phone app first.",
  FILE_NOT_FOUND: 'That sync file is no longer on the phone.',
  COPY_TIMEOUT: 'Copying from the phone took too long. Check the cable and try again.',
  MOVE_TIMEOUT: 'The phone took too long to respond. Check the cable and try again.',
  WRITE_TIMEOUT: "Couldn't finish copying to the phone. Nothing was lost; try again.",
  BAD_NAME: 'Refused: not a sync file.',
  BAD_OP: 'Internal error: unknown phone operation.',
};

const friendly = (code) => MESSAGES[code] || code || 'Something went wrong talking to the phone.';

function isPhonePath(dir) {
  return typeof dir === 'string' && dir.startsWith(PREFIX);
}

function phonePath(device, storage) {
  return `${PREFIX}${encodeURIComponent(device)}/${encodeURIComponent(storage)}`;
}

function parsePhonePath(dir) {
  if (!isPhonePath(dir)) return null;
  const [d, s] = dir.slice(PREFIX.length).split('/');
  if (!d || !s) return null;
  try {
    return { device: decodeURIComponent(d), storage: decodeURIComponent(s) };
  } catch {
    return null;
  }
}

// helperDir: where the script file lives (main passes <userData>). A file
// rather than -EncodedCommand keeps well clear of the command-line limit.
function createWindowsPhone({ helperDir, powershell = 'powershell.exe', localTarget = null } = {}) {
  let scriptPath = null;
  let queue = Promise.resolve();

  async function ensureScript() {
    if (scriptPath) return scriptPath;
    await fsp.mkdir(helperDir, { recursive: true });
    const p = path.join(helperDir, 'symphony-phone.ps1');
    // BOM so Windows PowerShell 5.1 reads the file as UTF-8.
    await fsp.writeFile(p, '﻿' + SCRIPT, 'utf8');
    scriptPath = p;
    return p;
  }

  function runOnce(op, env, timeoutMs) {
    return new Promise((resolve) => {
      ensureScript().then((p) => {
        execFile(
          powershell,
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', p],
          {
            env: { ...process.env, SYM_OP: op, ...env },
            windowsHide: true,
            timeout: timeoutMs,
            maxBuffer: 4 * 1024 * 1024,
          },
          (err, stdout, stderr) => {
            const text = String(stdout || '').replace(/^﻿/, '').trim();
            if (text) {
              try { resolve(JSON.parse(text)); return; } catch { /* fall through */ }
            }
            resolve({ ok: false, error: String(stderr || err?.message || 'No answer from PowerShell.').trim() });
          },
        );
      }, (e) => resolve({ ok: false, error: e?.message || 'Could not prepare the phone helper.' }));
    });
  }

  // A plain-text trail of every phone operation (<userData>\phone-sync.log,
  // reachable from File → Open Data Folder) so "sync got stuck" can be
  // traced to the exact step. File names and timings only — never data.
  const logPath = path.join(helperDir, 'phone-sync.log');
  async function log(line) {
    try {
      const st = await fsp.stat(logPath).catch(() => null);
      if (st && st.size > 512 * 1024) await fsp.rename(logPath, `${logPath}.old`).catch(() => {});
      await fsp.appendFile(logPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch { /* logging must never break sync */ }
  }

  // Serialize: one Shell operation on the phone at a time.
  function run(op, env = {}, timeoutMs = 240000) {
    const label = `${op}${env.SYM_NAME ? ` ${env.SYM_NAME}` : ''}`;
    const next = queue.then(async () => {
      const t0 = Date.now();
      await log(`start ${label}`);
      const res = await runOnce(op, env, timeoutMs);
      const extra = res?.ok
        ? (Array.isArray(res.files) ? ` files=${res.files.length}` : '')
        : ` error=${String(res?.error || '').slice(0, 300).replace(/\s+/g, ' ')}`;
      await log(`${res?.ok ? 'ok   ' : 'FAIL '} ${label} ${Date.now() - t0}ms${extra}`);
      return res;
    });
    queue = next.catch(() => {});
    return next;
  }

  function targetEnv(dir) {
    if (localTarget) return { SYM_LOCAL: localTarget };
    const t = parsePhonePath(dir);
    if (!t) return null;
    return { SYM_DEVICE: t.device, SYM_STORAGE: t.storage };
  }

  async function freshDir(tag) {
    return fsp.mkdtemp(path.join(os.tmpdir(), `symphony-phone-${tag}-`));
  }

  async function devices() {
    const res = await run('devices', {}, 60000);
    if (!res?.ok) return { ok: false, error: friendly(res?.error) };
    const list = Array.isArray(res.devices) ? res.devices : res.devices ? [res.devices] : [];
    return { ok: true, devices: list };
  }

  async function list(dir) {
    const env = targetEnv(dir);
    if (!env) return { ok: false, error: 'That phone location is not valid.' };
    const res = await run('list', env, 60000);
    if (!res?.ok) return { ok: false, error: friendly(res?.error) };
    const files = Array.isArray(res.files) ? res.files : res.files ? [res.files] : [];
    return { ok: true, files };
  }

  async function read(dir, name) {
    const env = targetEnv(dir);
    if (!env) return { ok: false, error: 'That phone location is not valid.' };
    const tmp = await freshDir('read');
    try {
      const res = await run('read', { ...env, SYM_NAME: name, SYM_TMP: tmp });
      if (!res?.ok) return { ok: false, error: friendly(res?.error) };
      return { ok: true, text: await fsp.readFile(path.join(tmp, name), 'utf8') };
    } catch (e) {
      return { ok: false, error: e?.message || 'Could not read that file from the phone.' };
    } finally {
      fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function write(dir, name, text) {
    const env = targetEnv(dir);
    if (!env) return { ok: false, error: 'That phone location is not valid.' };
    const tmp = await freshDir('write');
    const bak = await freshDir('prev');
    let keepBak = false;
    try {
      await fsp.writeFile(path.join(tmp, name), text, 'utf8');
      const res = await run('write', { ...env, SYM_NAME: name, SYM_TMP: tmp, SYM_BAK: bak });
      if (res?.ok) return { ok: true, atomic: false, via: 'shell' };
      // A previous snapshot that came off the phone and could not be put
      // back is kept on this PC rather than thrown away.
      if (res && res.restored === false) keepBak = true;
      return { ok: false, error: friendly(res?.error) };
    } catch (e) {
      return { ok: false, error: e?.message || 'Could not write to the phone.' };
    } finally {
      fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
      if (!keepBak) fsp.rm(bak, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function remove(dir, name) {
    const env = targetEnv(dir);
    if (!env) return { ok: false, error: 'That phone location is not valid.' };
    const bak = await freshDir('remove');
    try {
      const res = await run('remove', { ...env, SYM_NAME: name, SYM_BAK: bak });
      if (!res?.ok) return { ok: false, error: friendly(res?.error) };
      return { ok: true };
    } finally {
      fsp.rm(bak, { recursive: true, force: true }).catch(() => {});
    }
  }

  return { devices, list, read, write, remove };
}

module.exports = { createWindowsPhone, isPhonePath, phonePath, parsePhonePath, SCRIPT };
