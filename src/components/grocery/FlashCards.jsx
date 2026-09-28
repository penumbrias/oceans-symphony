// Flash-card decks — a list type in the grocery/notes panel. Each card is a
// list item: `name` is the front, `back` the back, and either side can
// carry one image (`front_image` / `back_image`, local-image:// URLs).
// Study mode walks a shuffled queue: tap to flip, "Again" sends the card
// to the back of the queue, "Got it" retires it for this round.
//
// Same neutral wording and palette as the rest of the panel — it doubles
// as the privacy cover, so nothing here may read like Oceans Symphony.

import React, { useMemo, useRef, useState } from "react";
import { Plus, X, Image as ImageIcon, Camera, Pencil, RotateCcw, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/components/shared/ConfirmDialog";
import { saveLocalImage, deleteLocalImage, createLocalImageUrl, getLocalImageId } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function deleteCardImages(item) {
  for (const url of [item?.front_image, item?.back_image]) {
    try { const id = url && getLocalImageId(url); if (id) await deleteLocalImage(id); } catch { /* non-fatal */ }
  }
}

function CardImage({ url, className = "" }) {
  const resolved = useResolvedAvatarUrl(url || "");
  if (!url) return null;
  return resolved
    ? <img src={resolved} alt="" className={`object-contain rounded-lg ${className}`} />
    : <span className={`inline-block rounded-lg bg-neutral-100 dark:bg-neutral-800 ${className}`} />;
}

// One side of the card editor: text + optional image.
function SideEditor({ label, text, onText, image, onImage, canAttach, autoFocus }) {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    try {
      const id = `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await saveLocalImage(id, file, file.type);
      onImage(createLocalImageUrl(id));
    } catch (e) {
      toast.error(e?.message || "Couldn't add the photo");
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        {canAttach && !image && (
          <span className="flex items-center gap-0.5">
            <button type="button" onClick={() => camRef.current?.click()} aria-label={`Take a photo for the ${label.toLowerCase()}`}
              className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <Camera className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={`Add a photo to the ${label.toLowerCase()}`}
              className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <ImageIcon className="w-4 h-4" />
            </button>
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        autoFocus={autoFocus}
        rows={2}
        className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-base resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />
      {image && (
        <span className="relative inline-block">
          <CardImage url={image} className="h-20 w-auto max-w-[10rem]" />
          <button type="button" onClick={() => onImage("")} aria-label="Remove photo"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900/80 text-white flex items-center justify-center">
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
    </div>
  );
}

// Add / edit sheet. `card` null = new card.
function CardEditor({ card, canAttach, onSave, onDelete, onClose }) {
  const [front, setFront] = useState(card?.name || "");
  const [back, setBack] = useState(card?.back || "");
  const [frontImage, setFrontImage] = useState(card?.front_image || "");
  const [backImage, setBackImage] = useState(card?.back_image || "");
  // Images picked in this session but not kept — cleaned up on close so a
  // cancelled edit leaves nothing behind.
  const added = useRef(new Set());
  const trackImage = (setter, prev) => (url) => {
    if (url) added.current.add(url);
    else if (prev && added.current.has(prev)) { added.current.delete(prev); deleteCardImages({ front_image: prev }); }
    setter(url);
  };
  const discardUnsaved = () => {
    for (const url of added.current) deleteCardImages({ front_image: url });
    added.current.clear();
  };
  const canSave = !!(front.trim() || frontImage) && !!(back.trim() || backImage);

  const save = async () => {
    if (!canSave) return;
    const patch = { name: front.trim() || "🖼", back: back.trim(), front_image: frontImage || "", back_image: backImage || "" };
    // Replaced images on an existing card: drop the old files.
    const replaced = card ? [card.front_image, card.back_image].filter((u) => u && u !== patch.front_image && u !== patch.back_image) : [];
    added.current.clear();
    await onSave(patch);
    for (const url of replaced) deleteCardImages({ front_image: url });
  };

  return (
    <div className="absolute inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/40 animate-in fade-in duration-150">
      <div className="w-full max-w-md max-h-[90%] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xl space-y-4">
        <h2 className="text-base font-semibold">{card ? "Edit card" : "New card"}</h2>
        <SideEditor label="Front" text={front} onText={setFront} image={frontImage}
          onImage={trackImage(setFrontImage, frontImage)} canAttach={canAttach} autoFocus={!card} />
        <SideEditor label="Back" text={back} onText={setBack} image={backImage}
          onImage={trackImage(setBackImage, backImage)} canAttach={canAttach} />
        <div className="flex items-center gap-2">
          {card && (
            <button type="button" onClick={onDelete} aria-label="Delete card"
              className="p-2.5 rounded-lg text-neutral-500 hover:text-red-500 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={() => { discardUnsaved(); onClose(); }}
            className="flex-1 px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!canSave}
            className="flex-1 px-3 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm disabled:opacity-50">
            {card ? "Save" : "Add card"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardFace({ text, image }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center w-full">
      {image && <CardImage url={image} className="max-h-48 max-w-full" />}
      {text && text !== "🖼" && <p className="text-xl font-medium leading-snug break-words whitespace-pre-wrap">{text}</p>}
    </div>
  );
}

function StudyView({ cards, onExit }) {
  const [queue, setQueue] = useState(() => shuffle(cards.map((c) => c.id)));
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const byId = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);
  const total = cards.length;
  const current = byId[queue[0]];

  const restart = () => { setQueue(shuffle(cards.map((c) => c.id))); setDone(0); setFlipped(false); };
  const again = () => { setQueue((q) => [...q.slice(1), q[0]]); setFlipped(false); };
  const gotIt = () => { setQueue((q) => q.slice(1)); setDone((n) => n + 1); setFlipped(false); };

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[50vh] text-center">
        <p className="text-4xl" aria-hidden>🎉</p>
        <p className="text-base font-medium">All {total} cards done</p>
        <div className="flex gap-2">
          <button type="button" onClick={restart}
            className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" /> Study again
          </button>
          <button type="button" onClick={onExit}
            className="px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm">
            Back to cards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-h-[50vh]">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <button type="button" onClick={onExit} className="flex items-center gap-1 hover:text-neutral-900 dark:hover:text-neutral-100">
          <X className="w-3.5 h-3.5" /> Stop
        </button>
        <span role="status">{done} / {total}</span>
        <button type="button" onClick={restart} aria-label="Shuffle and start over" className="p-1 hover:text-neutral-900 dark:hover:text-neutral-100">
          <Shuffle className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show the front" : "Show the back"}
        className={`flex-1 min-h-[16rem] rounded-2xl border-2 p-6 flex items-center justify-center transition-colors ${
          flipped
            ? "border-emerald-500/60 bg-emerald-500/5"
            : "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60"
        }`}
      >
        {flipped
          ? <CardFace text={current.back} image={current.back_image} />
          : <CardFace text={current.name} image={current.front_image} />}
      </button>
      {flipped ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={again}
            className="py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium">
            Again
          </button>
          <button type="button" onClick={gotIt}
            className="py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium">
            Got it
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-neutral-400">Tap the card to flip</p>
      )}
    </div>
  );
}

export default function FlashCards({ cards = [], canAttach = false, onAdd, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(null); // null | "new" | card
  const [studying, setStudying] = useState(false);

  if (studying && cards.length > 0) {
    return <StudyView cards={cards} onExit={() => setStudying(false)} />;
  }

  const remove = async (card) => {
    if (!(await confirm("Delete this card?"))) return;
    await onRemove(card);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setStudying(true)} disabled={cards.length === 0}
          className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
          Study {cards.length > 0 ? `(${cards.length})` : ""}
        </button>
        <button type="button" onClick={() => setEditing("new")}
          className="px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Card
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-neutral-500 italic mt-8 text-center">No cards yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {cards.map((card) => (
            <li key={card.id}>
              <button type="button" onClick={() => setEditing(card)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 text-left">
                {card.front_image && <CardImage url={card.front_image} className="w-10 h-10 object-cover flex-shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{card.name === "🖼" ? "" : card.name}</span>
                  <span className="block text-xs text-neutral-500 truncate">{card.back || (card.back_image ? "🖼" : "")}</span>
                </span>
                <Pencil className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CardEditor
          key={editing === "new" ? "new" : editing.id}
          card={editing === "new" ? null : editing}
          canAttach={canAttach}
          onClose={() => setEditing(null)}
          onDelete={() => remove(editing)}
          onSave={async (patch) => {
            if (editing === "new") await onAdd(patch); else await onUpdate(editing, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
