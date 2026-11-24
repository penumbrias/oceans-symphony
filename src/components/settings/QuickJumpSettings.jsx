// Settings → Data & privacy → Quick jump (v0.345.0).
// What the quick-taps gesture opens, how many taps it takes, and whether a
// password lock goes up behind it. The model is src/lib/quickJump.js.
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useTerms } from "@/lib/useTerms";
import { buildNavGroups } from "@/lib/navCatalogue";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { verifyPassword } from "@/lib/localDb";
import { promptText } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Group, ChoiceRow, StackedRow, Row, SwitchRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { readPanicTapsSetting, writePanicTapsSetting } from "@/components/settings/GroceryPanicTapsSettings";
import {
  readQuickJump, readLockPref, writeLockPref, readLastPage, pathOnly, SOUNDSCAPE_FOCUS_PATH,
} from "@/lib/quickJump";
import { useUiLook, UI_LOOKS } from "@/lib/uiLook";
import "@/styles/pixel/sheets.css";

const TAP_CHOICES = [
  { value: 2, label: "2" }, { value: 3, label: "3" }, { value: 4, label: "4" },
  { value: 5, label: "5" }, { value: "off", label: "Off" },
];
const TARGET_CHOICES = [
  { value: "lists", label: "Notes & lists" },
  { value: "page", label: "A page" },
  { value: "image", label: "A picture" },
];

function PictureThumb({ url }) {
  const resolved = useResolvedAvatarUrl(url || "");
  if (!url) return null;
  return resolved
    ? <img src={resolved} alt="" className="w-12 h-12 rounded-lg object-cover border border-border/50" />
    : <span className="w-12 h-12 rounded-lg bg-muted inline-block" />;
}

function PxTick({ on }) {
  return <span className={`psh-tick${on ? " y" : ""}`} aria-hidden="true">{on ? "x" : ""}</span>;
}

// The pixel board's picture well: the chosen picture as it will show.
function PixelPicture({ url, onChoose }) {
  const resolved = useResolvedAvatarUrl(url || "");
  return (
    <button type="button" className="psh-ins psh-qj-pic" onClick={onChoose}
      aria-label={url ? "Change the picture" : "Choose a picture"}>
      {url && resolved
        ? <img src={resolved} alt="" />
        : <span className="psh-mut">{url ? "Loading picture…" : "Choose a picture — it shows full screen"}</span>}
    </button>
  );
}

export default function QuickJumpSettings() {
  const qc = useQueryClient();
  const t = useTerms();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = pickPrimarySystemSettings(list);
  const taps = readPanicTapsSetting(settings);
  const jump = readQuickJump(settings);
  const [lockOn, setLockOn] = useState(readLockPref);
  const [pickerOpen, setPickerOpen] = useState(false);
  const encryptionOn = isEncryptionEnabled();
  const pixel = useUiLook() === UI_LOOKS.PIXEL;

  // Every page the person can open, term-aware, plus the Soundscape in
  // full screen and the exact spot they were on before Settings.
  const pageOptions = useMemo(() => {
    const groups = buildNavGroups(t.Alters, t.System);
    const pages = Object.values(groups).flat()
      .filter((p) => p.path && !pathOnly(p.path).toLowerCase().startsWith("/settings"))
      .map((p) => ({ id: p.path, label: p.label }));
    const out = [{ id: SOUNDSCAPE_FOCUS_PATH, label: "Soundscape, full screen" }, ...pages];
    const last = readLastPage();
    if (last && !out.some((o) => o.id === last)) {
      const base = pages.find((p) => pathOnly(p.id) === pathOnly(last));
      out.unshift({ id: last, label: `The page you were just on${base ? ` (${base.label})` : ""}` });
    }
    if (jump.path && !out.some((o) => o.id === jump.path)) {
      out.unshift({ id: jump.path, label: jump.label || jump.path });
    }
    return out;
  }, [t.Alters, t.System, jump.path, jump.label]);

  const saveJump = async (patch) => {
    const next = { ...jump, ...patch };
    try {
      if (settings?.id) await base44.entities.SystemSettings.update(settings.id, { quick_jump: next });
      else await base44.entities.SystemSettings.create({ quick_jump: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    }
  };

  const setTaps = async (value) => {
    try { await writePanicTapsSetting(value, { settings, qc }); }
    catch (e) { toast.error(e?.message || "Couldn't save"); }
  };

  const setLock = async (on) => {
    // Taking the lock down asks for the password — the same rule the
    // lists panel's lock button always had.
    if (!on && encryptionOn) {
      const pwd = await promptText({
        title: "Turn the lock off?", body: "Enter your password to take the lock down.",
        inputType: "password", confirmLabel: "Turn off",
      });
      if (pwd == null) return;
      if (!(await verifyPassword(pwd))) { toast.error("Incorrect password."); return; }
    }
    writeLockPref(on);
    setLockOn(on);
  };

  const pagePicked = (path) => {
    const opt = pageOptions.find((o) => o.id === path);
    const label = opt?.label?.startsWith("The page you were just on")
      ? (opt.label.match(/\((.*)\)$/)?.[1] || "A page") + " (exact spot)"
      : opt?.label || "";
    saveJump({ target: "page", path, label });
  };

  const tapsHint = taps === "off"
    ? "The gesture is off. Notes & lists still open from the side menu."
    : `Tap anywhere ${taps} times quickly. Typing and sheet buttons never count.`;

  const targetHint = {
    lists: "Your notes, lists and flash cards, over everything.",
    page: "Any page or exact spot. Handy as a shortcut too.",
    image: "A picture or gif you choose, full screen.",
  }[jump.target];

  if (pixel) {
    // The "Quick jump" board: tick rows for where the jump goes, the lock
    // as a tick, and the chosen picture shown large. Same saves as below.
    const last = readLastPage();
    const onLast = jump.target === "page" && !!last && jump.path === last;
    const lockShown = encryptionOn && lockOn;
    return (
      <div className="psh-qj">
        <p className="psh-mut">A few quick taps anywhere jump you somewhere you choose. Use it to cover the screen fast, or just as a shortcut.</p>

        <div className="psh-sub">Quick taps</div>
        <div className="psh-chips" role="radiogroup" aria-label="Quick taps">
          {TAP_CHOICES.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={taps === c.value}
              className={`psh-chip${taps === c.value ? " sel" : ""}`} onClick={() => setTaps(c.value)}>{c.label}</button>
          ))}
        </div>
        <p className="psh-mut psh-small">{tapsHint}</p>

        <div className="psh-sub">Jump to</div>
        <div className="psh-list psh-list-flat" role="radiogroup" aria-label="Jump to">
          <div className="psh-line psh-row psh-qj-row">
            <button type="button" role="radio" aria-checked={jump.target === "image"} className="psh-tickrow psh-grow"
              onClick={() => saveJump({ target: "image" })}>
              <PxTick on={jump.target === "image"} /><span>A picture</span>
            </button>
            {jump.target === "image" && (
              <button type="button" className="psh-chip" onClick={() => setPickerOpen(true)}>
                {jump.image_url ? "Change" : "Choose"}
              </button>
            )}
          </div>
          <div className="psh-line psh-row psh-qj-row">
            <button type="button" role="radio" aria-checked={jump.target === "lists"} className="psh-tickrow psh-grow"
              onClick={() => saveJump({ target: "lists" })}>
              <PxTick on={jump.target === "lists"} /><span>Notes &amp; lists panel</span>
            </button>
          </div>
          <div className="psh-line psh-qj-col">
            <div className="psh-row psh-qj-row">
              <button type="button" role="radio" aria-checked={jump.target === "page" && !onLast} className="psh-tickrow psh-grow"
                onClick={() => saveJump({ target: "page" })}>
                <PxTick on={jump.target === "page" && !onLast} /><span>A page</span>
              </button>
              {jump.target === "page" && jump.label && !onLast && <span className="psh-mut psh-small psh-trunc">{jump.label}</span>}
            </div>
            {jump.target === "page" && (
              <div className="psh-qj-pick">
                <SearchableSelect className="psh-sel psh-sel-wide" value={jump.path || null} onChange={(v) => v && pagePicked(v)} options={pageOptions}
                  placeholder="Choose a page…" searchPlaceholder="Search pages…" />
                {!jump.path && <p className="psh-mut psh-small">Pick one. Until you do, the jump opens notes &amp; lists.</p>}
              </div>
            )}
          </div>
          {last && (
            <div className="psh-line psh-row psh-qj-row">
              <button type="button" role="radio" aria-checked={onLast} className="psh-tickrow psh-grow"
                onClick={() => pagePicked(last)}>
                <PxTick on={onLast} /><span>The page I was just on</span>
              </button>
            </div>
          )}
        </div>

        <button type="button" className="psh-tickrow" aria-pressed={lockShown} disabled={!encryptionOn}
          onClick={() => { if (encryptionOn) setLock(!lockOn); }}>
          <PxTick on={lockShown} /><span>Lock behind it</span>
        </button>
        <p className="psh-mut psh-small">
          {encryptionOn
            ? "Leaving the page the jump opened locks the app until your password is entered."
            : "Needs a password. Turn one on in Storage & encryption."}
        </p>

        {jump.target === "image" && (
          <PixelPicture url={jump.image_url} onChoose={() => setPickerOpen(true)} />
        )}

        <AssetPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} allowFolders
          onSelect={(url) => { saveJump({ target: "image", image_url: url }); setPickerOpen(false); }} />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground leading-relaxed pb-1">
        A few quick taps anywhere jump you somewhere you choose. Use it to cover the screen fast, or just as a shortcut.
      </p>

      <Group title="Gesture" first>
        <ChoiceRow label="Quick taps" hint={tapsHint} options={TAP_CHOICES} value={taps} onChange={setTaps} />
      </Group>

      <Group title="Opens">
        <ChoiceRow label="Jump to" hint={targetHint} options={TARGET_CHOICES} value={jump.target}
          onChange={(target) => saveJump({ target })} />
        {jump.target === "page" && (
          <StackedRow label="Page" hint={jump.path ? undefined : "Pick one. Until you do, the jump opens notes & lists."}>
            <SearchableSelect value={jump.path || null} onChange={(v) => v && pagePicked(v)} options={pageOptions}
              placeholder="Choose a page…" searchPlaceholder="Search pages…" />
          </StackedRow>
        )}
        {jump.target === "image" && (
          <Row label="Picture" hint={jump.image_url ? "Shown full screen. Tap × to close it." : "Pick one. Until you do, the jump opens notes & lists."}>
            <PictureThumb url={jump.image_url} />
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              {jump.image_url ? "Change" : "Choose"}
            </Button>
          </Row>
        )}
      </Group>

      <Group title="Lock">
        <SwitchRow label="Lock behind it"
          hint={encryptionOn
            ? "Leaving what the jump opened locks the app until your password is entered."
            : "Needs a password. Turn one on in Storage & encryption."}
          checked={encryptionOn && lockOn}
          onChange={(on) => { if (encryptionOn) setLock(on); }} />
      </Group>

      <AssetPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} allowFolders
        onSelect={(url) => { saveJump({ target: "image", image_url: url }); setPickerOpen(false); }} />
    </div>
  );
}
