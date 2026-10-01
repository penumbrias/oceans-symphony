# Oceans Symphony on Windows — test checklist

Thank you for testing! This takes about 30–45 minutes. You don't need to
be technical. Use **made-up test data only** — nothing real.

For each step, tick it if it worked. If something goes wrong, write down
what you clicked, what you expected, and what happened instead. A
screenshot helps a lot (press **Windows key + Shift + S**).

Please also write down:

- Windows version (Start → Settings → System → About): ____________
- App version (in the app: Settings, top right corner): ____________

---

## 1. Install

- [ ] Download the file named like `OceansSymphony-0.xxx.x-x64-Setup.exe`.
      If the browser warns that the file is "not commonly downloaded",
      choose **Keep** (it may be under the `...` menu).
- [ ] Double-click it. A blue box will probably say **"Windows protected
      your PC"**. That's expected — the app isn't signed with a paid
      certificate. Click **More info**, then **Run anyway**.
- [ ] It should install **without** asking for an administrator password,
      and open the app by itself when done.
- [ ] There's an **Oceans Symphony** icon on the desktop and in the Start
      menu, and the icon looks right (not a blank or generic picture).

## 2. First run

- [ ] The app opens to a screen saying your data isn't here yet, with
      options like "Sync from another device" and "Import a backup file".
- [ ] Click the little **folder button** next to the long path on that
      screen (or use the menu: press **Alt**, then **File → Open Data
      Folder**). A File Explorer window opens on a folder ending in
      `AppData\Roaming\Oceans Symphony`. Write that path down.
- [ ] Go through setup as if you were a new user.

## 3. Make some test data

- [ ] Add two or three alters (or whatever the app calls them after
      setup). Give one of them a **profile picture**.
- [ ] Set someone as fronting.
- [ ] Write a journal entry and set a status on the home screen.

## 4. Close and reopen

- [ ] Close the app with the **X** in the corner.
- [ ] Open it again from the Start menu.
- [ ] Everything from step 3 is still there — **including the profile
      picture**.
- [ ] The window opens in the same size and place you left it.
- [ ] With the app open, double-click the desktop icon again. It should
      just bring the open window to the front, **not** open a second
      copy.

## 5. Sync folder

You'll need a USB stick for part of this (optional but very helpful).

- [ ] Make a folder with a **space in its name**, e.g. `My Sync` in
      Documents.
- [ ] In the app: **Settings → Data & privacy → Sync between devices →
      Choose folder**, and pick that folder.
- [ ] Press **Sync**. In File Explorer, a file starting with
      `symphony-sync-` and ending in `.json` appears in that folder.
- [ ] Press Sync again — no errors.
- [ ] Try the same with a folder on a **USB stick** (it'll be a drive like
      `E:` or `D:`).
- [ ] In File Explorer, hold **Shift**, right-click the sync folder, and
      choose **Copy as path**. In the app, paste it into the
      "…or paste a folder path" box and press **Use**. It should be
      accepted, and Sync should still work.
- [ ] **Phones:** plugging a phone in with a USB cable and picking a
      folder on it is **expected not to work on Windows** (Windows doesn't
      treat a phone as a normal folder). Try it anyway and note exactly
      what happens. Using a USB stick, or copying the `symphony-sync-`
      files between the phone and the PC by hand in File Explorer, is the
      Windows way.

## 6. Backup and restore

- [ ] **Settings → Data & privacy → Export**: export a backup. A
      "Save as" window appears; save the file to Documents. The file
      shows up there.
- [ ] Add one more journal entry (so you can tell before/after apart).
- [ ] **Import** the backup you just saved. Your test data is all still
      there afterwards and nothing looks broken.

## 7. Updates (only if you're told a newer version is out)

- [ ] Leave the app open for at least a minute. A box says **"Update
      ready"**.
- [ ] Click **Restart now**. The app closes and opens again by itself, on
      the newer version (check Settings, top right). No administrator
      password was asked for.
- [ ] Your test data is still there.
- [ ] (Optional) Do it once with **Later** instead: close the app, wait
      a few seconds, open it — it should be on the newer version.

## 8. Uninstall

- [ ] Start → Settings → **Apps** → find **Oceans Symphony** →
      **Uninstall**.
- [ ] The desktop and Start-menu icons are gone.
- [ ] Open the folder you wrote down in step 2. **It should still be
      there** — uninstalling deliberately keeps your data.
- [ ] Install the app again (step 1). It should open **with your test
      data already in it**.
- [ ] When you're completely finished testing and want everything gone:
      uninstall, then delete that `Oceans Symphony` folder by hand.

---

## Anything else

- Did any text look cut off, blurry, or in the wrong place?
- Did the app ever freeze, show a blank white or dark window, or show an
  error box? (Write down the exact wording.)
- Anything that felt confusing?

Thank you!
