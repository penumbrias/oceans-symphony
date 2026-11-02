import { useState } from "react";
import { Plus, Play, Pause, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Group, LinkRow } from "@/components/shared/SettingRows";
import { Input } from "@/components/ui/input";
import { playNature, toggleNature } from "@/lib/natureSounds/naturePlayer";
import { renameMySound, removeMySound, addMySoundsFromAssets } from "@/lib/natureSounds/ownSounds";
import { useMySounds, useNatureState, fmtLength } from "./natureHooks";
import AddMySoundPage from "./AddMySoundPage";

// Nature sounds → Your sounds: the recordings a person added, with rename
// and remove. Removing only takes a sound off this list; the file stays in
// Assets (and Undo puts it straight back).

function OwnRow({ sound, current, playing, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sound.title);
  const save = async () => {
    setEditing(false);
    if (name.trim() && name.trim() !== sound.title) {
      try { await renameMySound(sound, name); onChanged(); } catch { toast.error("Couldn't rename it."); setName(sound.title); }
    } else setName(sound.title);
  };
  const remove = async () => {
    try {
      await removeMySound(sound);
      onChanged();
      toast(`Took "${sound.title}" off your sounds. The file is still in Assets.`, {
        action: { label: "Undo", onClick: () => addMySoundsFromAssets([{ id: sound.assetId, image_url: sound.url, kind: "audio", duration_seconds: sound.seconds }]).then(onChanged) },
      });
    } catch { toast.error("Couldn't remove it."); }
  };
  return (
    <div className="flex items-center gap-1 border-b border-border/30 last:border-b-0">
      {editing ? (
        <form className="flex-1 min-w-0 flex items-center gap-1 py-1.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={save} maxLength={120}
            aria-label="Sound name" className="h-9 text-sm" />
          <button type="submit" aria-label="Save name" className="h-11 w-11 inline-flex items-center justify-center rounded-full text-primary hover:bg-muted">
            <Check className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <>
          <button type="button" onClick={() => (current ? toggleNature() : playNature(sound.id))}
            aria-current={current ? "true" : undefined}
            className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-[52px] py-1.5 rounded-md hover:bg-muted/30 -ml-1 pl-1">
            <span className={`w-6 flex-shrink-0 flex justify-center ${current ? "text-primary" : "text-muted-foreground/60"}`}>
              {current && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`text-sm block truncate ${current ? "text-primary font-medium" : "text-foreground"}`}>{sound.title}</span>
              <span className="text-[0.6875rem] text-muted-foreground block truncate">{sound.seconds ? fmtLength(sound.seconds) : "Length unknown"}</span>
            </span>
          </button>
          <button type="button" onClick={() => setEditing(true)} aria-label={`Rename ${sound.title}`}
            className="h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
            <Pencil className="w-4 h-4" />
          </button>
          <button type="button" onClick={remove} aria-label={`Remove ${sound.title} from your sounds`}
            className="h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

export default function MySoundsPage({ onBack }) {
  const qc = useQueryClient();
  const sounds = useMySounds();
  const player = useNatureState();
  const [adding, setAdding] = useState(false);
  const changed = () => qc.invalidateQueries({ queryKey: ["imageAssets"] });

  if (adding) return <AddMySoundPage onBack={() => setAdding(false)} onAdded={() => setAdding(false)} />;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back to Nature sounds
        </button>
        <h2 className="text-lg font-semibold text-foreground">Your sounds</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Recordings you add play here with the others, under the Yours tag. They work offline.
        </p>
      </div>
      <div className="px-1">
        <Group title="Add" first>
          <LinkRow label="Add a sound" hint="From this device or your Assets" icon={Plus} onClick={() => setAdding(true)} />
        </Group>
        <Group title={`Sounds · ${sounds.length}`}>
          {sounds.map((s) => (
            <OwnRow key={s.id} sound={s} current={player.id === s.id} playing={player.playing} onChanged={changed} />
          ))}
          {!sounds.length && <p className="text-xs text-muted-foreground py-6 text-center">No sounds of your own yet.</p>}
        </Group>
      </div>
    </div>
  );
}
