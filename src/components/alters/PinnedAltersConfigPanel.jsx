// The pinned-{alters} bar's WIDGET CONFIG (v0.190.0): everything about
// WHAT the bar shows, inline in the bar's options sheet — pins (add /
// remove, order), labels, what a chip shows, how a fronting chip stands
// out, per-alter bar avatars (saved into that alter's own asset folder),
// and a quick route to the front-level catalogue. Size and shape (bar
// height, icon size) live in UI & text with the rest of the look.
// Writes SystemSettings.pinned_alters_config — the same record the
// gallery reads and the classic Alters page's pinned dialog writes.
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
import { useFrontLevels, frontLevelLabel } from "@/lib/frontLevels";

function Pills({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`text-xs px-2.5 py-1 rounded-full border ${value === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

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

function Head({ children }) {
  return <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">{children}</label>;
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
      <button type="button" onClick={onPickAvatar} aria-label={`Bar avatar for ${label}`} title="Bar avatar (this bar only)"
        className={`w-7 h-7 flex items-center justify-center rounded-lg border ${avatarOverride ? "border-primary/60 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
        <Images className="w-3.5 h-3.5" />
      </button>
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

export default function PinnedAltersConfigPanel() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;
  const config = (settings && settings.pinned_alters_config) || {};

  const [pinsOpen, setPinsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [avatarFor, setAvatarFor] = useState(null); // alter id

  const persist = async (patch) => {
    if (!settings?.id) return;
    try {
      await base44.entities.SystemSettings.update(settings.id, { pinned_alters_config: { ...config, ...patch } });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { toast.error("Couldn't save pinned settings"); }
  };
  const setPinned = async (id, val) => {
    try {
      await base44.entities.Alter.update(id, { is_pinned: val });
      qc.invalidateQueries({ queryKey: ["alters"] });
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
    .filter((a) => (formatAlter(a) || a.name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (pinnedSet.has(a.id) ? 0 : 1) - (pinnedSet.has(b.id) ? 0 : 1) || (a.name || "").localeCompare(b.name || ""));

  const labelMode = ["name", "alias", "off"].includes(config.labelMode) ? config.labelMode : "auto";
  const display = ["both", "avatars", "names"].includes(config.display) ? config.display : "both";
  const emphasis = ["grow", "shape", "ring", "none"].includes(config.frontingEmphasis) ? config.frontingEmphasis : "grow";
  const frontingScale = Number.isFinite(config.frontingScale) ? config.frontingScale : 133;
  const iconShape = typeof config.iconShape === "string" ? config.iconShape : "circle";
  const frontingShape = typeof config.frontingShape === "string" ? config.frontingShape : "square";
  const pinnedAvatars = (config.pinnedAvatars && typeof config.pinnedAvatars === "object") ? config.pinnedAvatars : {};
  // Per-front-level chip styling: { [levelId]: { shape?, scale?, ringW? } }
  // — a specific level can carry its own shape / size / ring thickness,
  // over the general "when fronting" behaviour.
  const levelStyles = (config.levelStyles && typeof config.levelStyles === "object") ? config.levelStyles : {};
  const levelCfg = useFrontLevels();
  const [levelStyleOpen, setLevelStyleOpen] = useState(false);
  const setLevelStyle = (levelId, patch) => {
    const cur = levelStyles[levelId] || {};
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "") delete next[k];
    const all = { ...levelStyles };
    if (Object.keys(next).length) all[levelId] = next; else delete all[levelId];
    persist({ levelStyles: all });
  };
  const avatarAlter = avatarFor ? live.find((a) => a.id === avatarFor) : null;

  return (
    <div className="space-y-4">
      {/* Pins + order */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Head>{`Pinned ${terms.alters}`}</Head>
          <button type="button" onClick={() => setPinsOpen((v) => !v)} aria-expanded={pinsOpen}
            className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
            {pinsOpen ? "Done" : "Add / remove"}
          </button>
        </div>
        {pinsOpen ? (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`}
                className="w-full pl-8 pr-2 h-8 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 overscroll-contain">
              {candidates.length === 0
                ? <p className="text-xs text-muted-foreground text-center py-3">No matches.</p>
                : candidates.map((a) => <PinPickerRow key={a.id} alter={a} pinned={pinnedSet.has(a.id)} onToggle={setPinned} />)}
            </div>
          </div>
        ) : pinned.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing pinned yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto overscroll-contain pr-0.5">
            {pinned.map((a, i) => (
              <OrderRow key={a.id} alter={a} label={formatAlter(a)} avatarOverride={pinnedAvatars[a.id]}
                first={i === 0} last={i === pinned.length - 1}
                onUp={() => move(i, -1)} onDown={() => move(i, 1)}
                onPickAvatar={() => setAvatarFor(a.id)}
                onClearAvatar={() => { const next = { ...pinnedAvatars }; delete next[a.id]; persist({ pinnedAvatars: next }); }} />
            ))}
          </div>
        )}
      </div>

      <div>
        <Head>Display</Head>
        <div className="flex items-center gap-4">
          {[["avatars", "Avatars", display !== "names"], ["names", "Names", display !== "avatars"]].map(([id, label, on]) => (
            <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={on}
                onChange={(e) => {
                  // At least one stays on — unticking the last is a no-op.
                  const avatars = id === "avatars" ? e.target.checked : display !== "names";
                  const names = id === "names" ? e.target.checked : display !== "avatars";
                  if (!avatars && !names) return;
                  persist({ display: avatars && names ? "both" : avatars ? "avatars" : "names" });
                }}
                className="w-4 h-4 rounded" /> {label}
            </label>
          ))}
        </div>
      </div>
      {display !== "avatars" && (
        <div>
          <Head>Name shown</Head>
          <Pills value={labelMode === "off" ? "auto" : labelMode} onChange={(v) => persist({ labelMode: v })}
            options={[["auto", "App setting"], ["name", "Name"], ["alias", "Alias"]]} />
        </div>
      )}
      {display !== "names" && (
        <div>
          <Head>Icon shape</Head>
          <ShapeRow value={iconShape} onChange={(v) => persist({ iconShape: v })} />
        </div>
      )}
      <div>
        <Head>{`When ${terms.fronting}`}</Head>
        <Pills value={emphasis} onChange={(v) => persist({ frontingEmphasis: v })}
          options={[["grow", "Bigger"], ["shape", "Different shape"], ["ring", "Thick ring"], ["none", "No change"]]} />
        {emphasis === "shape" && display !== "names" && (
          <div className="mt-2">
            <ShapeRow value={frontingShape} onChange={(v) => persist({ frontingShape: v })} exclude={iconShape} />
          </div>
        )}
        {emphasis === "grow" && (
          <label className="block mt-2 text-xs text-muted-foreground">
            <span className="flex items-center justify-between"><span>How much bigger</span><span className="tabular-nums">{frontingScale}%</span></span>
            <input type="range" min={100} max={200} step={5} value={frontingScale}
              onChange={(e) => persist({ frontingScale: Number(e.target.value) })} className="w-full accent-primary" />
          </label>
        )}
      </div>

      {/* Per-level styling: a level can override shape / size / ring. */}
      {levelCfg?.enabled && levelCfg.levels.length > 0 && display !== "names" && (
        <div>
          <button type="button" onClick={() => setLevelStyleOpen((v) => !v)} aria-expanded={levelStyleOpen}
            className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border border-border/40 text-muted-foreground hover:text-foreground">
            <span>{`Per-${terms.front}-level styling`}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${levelStyleOpen ? "rotate-180" : ""}`} />
          </button>
          {levelStyleOpen && (
            <div className="mt-1.5 space-y-2.5 max-h-72 overflow-y-auto overscroll-contain pr-0.5">
              {levelCfg.levels.map((lv) => {
                const ls = levelStyles[lv.id] || {};
                return (
                  <div key={lv.id} className="rounded-lg border border-border/40 p-2 space-y-1.5">
                    <p className="text-xs font-medium">{frontLevelLabel(lv, terms)}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <button type="button" aria-pressed={!ls.shape} title="Same shape as the bar"
                        onClick={() => setLevelStyle(lv.id, { shape: "" })}
                        className={`text-[0.6875rem] px-2 py-1 rounded-full border ${!ls.shape ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>—</button>
                      {AVATAR_SHAPES.map((sh) => {
                        const layers = shapeLayerStyles(sh.id);
                        const on = ls.shape === sh.id;
                        return (
                          <button key={sh.id} type="button" aria-pressed={on} aria-label={sh.label} title={sh.label}
                            onClick={() => setLevelStyle(lv.id, { shape: sh.id })}
                            className={`w-7 h-7 rounded-md border flex items-center justify-center ${on ? "border-primary/60 bg-primary/10" : "border-border/50"}`}>
                            <span className="w-4 h-4 block" style={{ background: on ? "var(--color-primary)" : "var(--color-text-secondary)", ...layers.inner }} />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[0.6875rem] text-muted-foreground w-8">Size</span>
                      {[["", "—"], [100, "100%"], [115, "115%"], [133, "133%"], [155, "155%"]].map(([v, lab]) => (
                        <button key={lab} type="button" aria-pressed={(ls.scale ?? "") === v}
                          onClick={() => setLevelStyle(lv.id, { scale: v })}
                          className={`text-[0.6875rem] px-2 py-1 rounded-full border ${(ls.scale ?? "") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>{lab}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[0.6875rem] text-muted-foreground w-8">Ring</span>
                      {[["", "—"], [2, "2px"], [3, "3px"], [4, "4px"], [6, "6px"]].map(([v, lab]) => (
                        <button key={lab} type="button" aria-pressed={(ls.ringW ?? "") === v}
                          onClick={() => setLevelStyle(lv.id, { ringW: v })}
                          className={`text-[0.6875rem] px-2 py-1 rounded-full border ${(ls.ringW ?? "") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>{lab}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Front levels — the catalogue the hold-rail uses, right here. */}
      <div>
        <button type="button" onClick={() => setLevelsOpen((v) => !v)} aria-expanded={levelsOpen}
          className="w-full flex items-center justify-between text-sm px-3 h-9 rounded-lg border border-border/50 hover:bg-muted/30">
          <span className="flex items-center gap-2"><ListOrdered className="w-4 h-4" /> {terms.Front} levels</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${levelsOpen ? "rotate-180" : ""}`} />
        </button>
        {levelsOpen && <div className="mt-2"><FrontLevelsSettings /></div>}
      </div>

      <AssetPickerModal open={!!avatarFor} onClose={() => setAvatarFor(null)}
        ownerAlterId={avatarAlter?.id || null} ownerAlterName={avatarAlter?.name || ""} allowFolders
        onSelect={(url) => { if (avatarFor) persist({ pinnedAvatars: { ...pinnedAvatars, [avatarFor]: url } }); setAvatarFor(null); }} />
    </div>
  );
}
