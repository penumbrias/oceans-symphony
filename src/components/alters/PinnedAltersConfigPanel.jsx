// The pinned-{alters} bar's WIDGET CONFIG (v0.190.0): everything about
// WHAT the bar shows, inline in the bar's options sheet — pins (add /
// remove, order), labels, what a chip shows, how a fronting chip stands
// out, per-alter bar avatars (saved into that alter's own asset folder),
// and a quick route to the front-level catalogue. Size and shape (bar
// height, icon size) live in UI & text with the rest of the look.
// Writes SystemSettings.pinned_alters_config — the same record the
// gallery reads and the classic Alters page's pinned dialog writes.
//
// Rows come from SettingRows (docs/inspector-design-guide.md) so the panel
// sits flat in both inspectors that host it: Display options → Bars →
// pinned bar, and the Pinned widget's Content tab (v0.333.0).
//   parts="all"  — everything (the bar, the classic Pinned widget)
//   parts="pins" — only who is pinned and their order (the board's Pinned
//                  widget, which draws its own avatars)
//   sizes        — also the icon size (the widget has no Bars tab for it)
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Search, Images, X, ListOrdered } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { PinPickerRow } from "@/components/alters/PinnedAltersGallery";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import FrontLevelsSettings from "@/components/settings/FrontLevelsSettings";
import { AVATAR_SHAPES, shapeLayerStyles } from "@/lib/avatarShapes";
import { setBarPicture } from "@/lib/barPicture";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { setAlterFields, refreshAlter } from "@/lib/alterEntry";
import { Row, StackedRow, Group, SwitchRow, ChoiceRow, SliderRow } from "@/components/shared/SettingRows";

// Shape swatches — the shape itself is the label.
function ShapeRow({ value, onChange, exclude = "" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {AVATAR_SHAPES.filter((sh) => sh.id !== exclude).map((sh) => {
        const layers = shapeLayerStyles(sh.id);
        const on = value === sh.id;
        return (
          <button key={sh.id} type="button" aria-pressed={on} aria-label={sh.label} title={sh.label}
            onClick={() => onChange(sh.id)}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center ${on ? "border-primary/60 bg-primary/10" : "border-border/50 hover:bg-muted/30"}`}>
            <span className="w-6 h-6 block" style={{ background: on ? "var(--color-primary)" : "var(--color-text-secondary)", ...layers.inner }} />
          </button>
        );
      })}
    </div>
  );
}

function OrderRow({ alter, label, avatarOverride, onUp, onDown, first, last, onPickAvatar, onClearAvatar }) {
  const avatar = useResolvedAvatarUrl(avatarOverride || alter.avatar_url);
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40">
      <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ border: `2px solid ${alter.color || "var(--color-muted)"}`, backgroundColor: alter.color ? `${alter.color}22` : "var(--color-muted)" }}>
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" />
          : <span className="text-[0.625rem] font-semibold">{(alter.name || "?").charAt(0).toUpperCase()}</span>}
      </div>
      <span className="flex-1 min-w-0 text-sm truncate">{label}</span>
      {/* Bar-only avatar: pick from (or upload into) this alter's own asset folder. */}
      {onPickAvatar && <button type="button" onClick={onPickAvatar} aria-label={`Bar avatar for ${label}`} title="Bar avatar (this bar only)"
        className={`w-7 h-7 flex items-center justify-center rounded-lg border ${avatarOverride ? "border-primary/60 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
        <Images className="w-3.5 h-3.5" />
      </button>}
      {avatarOverride && (
        <button type="button" onClick={onClearAvatar} aria-label={`Use ${label}'s profile avatar`} title="Back to the profile avatar"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-destructive">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <button type="button" onClick={onUp} disabled={first} aria-label="Move up"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground disabled:opacity-30">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onDown} disabled={last} aria-label="Move down"
        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground disabled:opacity-30">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function PinnedAltersConfigPanel({ parts = "all", sizes = false }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = pickPrimarySystemSettings(settingsList) || null;
  const config = (settings && settings.pinned_alters_config) || {};

  const [pinsOpen, setPinsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [avatarFor, setAvatarFor] = useState(null); // alter id

  // A fresh read before each write, so a quick second change (or the bar
  // editor open on another screen) never writes over the first.
  const persist = async (patch) => {
    try {
      const fresh = pickPrimarySystemSettings(await base44.entities.SystemSettings.list()) || settings;
      if (!fresh?.id) return;
      const current = (fresh.pinned_alters_config && typeof fresh.pinned_alters_config === "object") ? fresh.pinned_alters_config : {};
      await base44.entities.SystemSettings.update(fresh.id, { pinned_alters_config: { ...current, ...patch } });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { toast.error("Couldn't save pinned settings"); }
  };
  // One alter's bar picture, on a fresh read (an Image widget can set it too).
  const pickBarPicture = async (alterId, url) => {
    try {
      await setBarPicture(alterId, url);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { toast.error("Couldn't save pinned settings"); }
  };
  const setPinned = async (id, val) => {
    try {
      await setAlterFields(id, { is_pinned: val });
      refreshAlter(qc, id);
    } catch { toast.error("Couldn't update pin"); }
  };

  const live = alters.filter((a) => !a.is_archived);
  const pinnedSet = new Set(live.filter((a) => a.is_pinned).map((a) => a.id));
  const savedOrder = Array.isArray(config.order) ? config.order : [];
  const pinned = useMemo(() => {
    const idx = new Map(savedOrder.map((id, i) => [id, i]));
    return live.filter((a) => a.is_pinned).sort((a, b) => {
      const ia = idx.has(a.id) ? idx.get(a.id) : Infinity, ib = idx.has(b.id) ? idx.get(b.id) : Infinity;
      if (ia !== ib) return ia - ib;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [live, savedOrder]);
  const move = (i, dir) => {
    const ids = pinned.map((a) => a.id);
    const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    persist({ order: ids });
  };
  const candidates = live
    .filter((a) => `${formatAlter(a) || ""} ${a.name || ""} ${a.alias || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (pinnedSet.has(a.id) ? 0 : 1) - (pinnedSet.has(b.id) ? 0 : 1) || (a.name || "").localeCompare(b.name || ""));

  const labelMode = ["name", "alias", "off"].includes(config.labelMode) ? config.labelMode : "auto";
  const display = ["both", "avatars", "names"].includes(config.display) ? config.display : "both";
  const emphasis = ["grow", "shape", "ring", "none"].includes(config.frontingEmphasis) ? config.frontingEmphasis : "grow";
  const frontingScale = Number.isFinite(config.frontingScale) ? config.frontingScale : 133;
  const iconShape = typeof config.iconShape === "string" ? config.iconShape : "circle";
  const frontingShape = typeof config.frontingShape === "string" ? config.frontingShape : "square";
  const pinnedAvatars = (config.pinnedAvatars && typeof config.pinnedAvatars === "object") ? config.pinnedAvatars : {};
  const avatarAlter = avatarFor ? live.find((a) => a.id === avatarFor) : null;
  const showAvatars = display !== "names";
  const showNames = display !== "avatars";
  const setShown = (avatars, names) => {
    // At least one stays on — switching off the last is a no-op.
    if (!avatars && !names) return;
    persist({ display: avatars && names ? "both" : avatars ? "avatars" : "names" });
  };
  const all = parts !== "pins";

  return (
    <div>
      {/* Who is pinned, and in what order */}
      <Group title={`Pinned ${terms.alters}`} first>
        <Row label={pinsOpen ? `Pick ${terms.alters} to pin` : `${pinned.length} pinned`}
          hint={pinsOpen ? "Tap to pin or unpin" : (pinned.length > 1 ? "Arrows change the order" : undefined)}>
          <button type="button" onClick={() => { setPinsOpen((v) => !v); setSearch(""); }} aria-expanded={pinsOpen}
            className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
            {pinsOpen ? "Done" : "Add / remove"}
          </button>
        </Row>
        {pinsOpen ? (
          <div className="space-y-1.5 py-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`}
                className="w-full pl-8 pr-2 h-9 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 overscroll-contain">
              {candidates.length === 0
                ? <p className="text-xs text-muted-foreground text-center py-3">No matches.</p>
                : candidates.map((a) => <PinPickerRow key={a.id} alter={a} label={formatAlter(a)} pinned={pinnedSet.has(a.id)} onToggle={setPinned} />)}
            </div>
          </div>
        ) : pinned.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1.5">{`Nothing pinned yet — tap Add / remove, or press and hold an ${terms.alter} anywhere and pick Pin.`}</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto overscroll-contain pr-0.5 py-1.5">
            {pinned.map((a, i) => (
              <OrderRow key={a.id} alter={a} label={formatAlter(a)} avatarOverride={all ? pinnedAvatars[a.id] : undefined}
                first={i === 0} last={i === pinned.length - 1}
                onUp={() => move(i, -1)} onDown={() => move(i, 1)}
                onPickAvatar={all ? () => setAvatarFor(a.id) : null}
                onClearAvatar={() => pickBarPicture(a.id, "")} />
            ))}
          </div>
        )}
      </Group>

      {all && (
        <Group title="What each one shows">
          <SwitchRow label="Pictures" checked={showAvatars} onChange={(on) => setShown(on, showNames)} />
          <SwitchRow label="Names" checked={showNames} onChange={(on) => setShown(showAvatars, on)} />
          {showNames && (
            <ChoiceRow label="Name shown" value={labelMode === "off" ? "auto" : labelMode}
              onChange={(v) => persist({ labelMode: v })}
              options={[{ value: "auto", label: "App setting" }, { value: "name", label: "Name" }, { value: "alias", label: "Alias" }]} />
          )}
          {sizes && showAvatars && (
            <SliderRow label="Icon size" value={config.chipSize} fallback={48} min={14} max={88} step={2}
              onChange={(v) => persist({ chipSize: Math.round(v) })}
              onClear={() => persist({ chipSize: undefined })} />
          )}
          {showAvatars && (
            <StackedRow label="Icon shape">
              <ShapeRow value={iconShape} onChange={(v) => persist({ iconShape: v })} />
            </StackedRow>
          )}
        </Group>
      )}

      {all && (
        <Group title={`When ${terms.fronting}`}>
          <ChoiceRow label="Stands out by" value={emphasis} onChange={(v) => persist({ frontingEmphasis: v })}
            options={[{ value: "grow", label: "Bigger" }, { value: "shape", label: "Shape" }, { value: "ring", label: "Thick ring" }, { value: "none", label: "No change" }]} />
          {emphasis === "shape" && showAvatars && (
            <StackedRow label={`Shape while ${terms.fronting}`}>
              <ShapeRow value={frontingShape} onChange={(v) => persist({ frontingShape: v })} exclude={iconShape} />
            </StackedRow>
          )}
          {emphasis === "grow" && (
            <SliderRow label="How much bigger" value={frontingScale} fallback={133} min={100} max={200} step={5} unit="%"
              onChange={(v) => persist({ frontingScale: Math.round(v) })} />
          )}
          {/* Front levels — the catalogue the hold-rail uses, right here
              (one editor everywhere — Settings, the guide, and here). */}
          <Row label={`${terms.Front} levels`} hint="What holding a picture offers">
            <button type="button" onClick={() => setLevelsOpen((v) => !v)} aria-expanded={levelsOpen}
              className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ListOrdered className="w-3.5 h-3.5" /> {levelsOpen ? "Hide" : "Edit"}
            </button>
          </Row>
          {levelsOpen && <div className="py-2"><FrontLevelsSettings /></div>}
        </Group>
      )}

      {all && (
        <AssetPickerModal open={!!avatarFor} onClose={() => setAvatarFor(null)}
          ownerAlterId={avatarAlter?.id || null} ownerAlterName={avatarAlter?.name || ""} allowFolders
          onSelect={(url) => { if (avatarFor) pickBarPicture(avatarFor, url); setAvatarFor(null); }} />
      )}
    </div>
  );
}
