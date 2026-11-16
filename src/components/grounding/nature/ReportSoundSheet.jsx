// Nature sounds → "Report this sound": tell the app's creator about a
// startling noise (a dog barking, a siren…) in a recording, and roughly
// where it is, so the sound can get a heads-up note (STARTLE_NOTES in
// catalog.js). Like the bug reporter it needs no server: "Email the report"
// opens the mail app with everything filled in, to the same address bug
// reports go to, and "Copy" covers phones with no mail app.
//
// Only the sound, the spot, what was heard, the optional note and the app
// version are sent — nothing about the person or their data.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Chips, Row, StackedRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { NATURE_SOUNDS, natureSoundById, freesoundUrl } from "@/lib/natureSounds/catalog";
import { APP_VERSION } from "@/lib/appVersion";
import { FEEDBACK_EMAIL } from "@/components/feedback/FeedbackSurveyModal";
import { getNativePlatform, isDesktop, isNative } from "@/lib/platform";
import { fmtLength } from "./natureHooks";

const KINDS = [
  { value: "dog", label: "Dog barking" },
  { value: "animal", label: "Another animal" },
  { value: "siren", label: "Siren or alarm" },
  { value: "voices", label: "Shouting or voices" },
  { value: "bang", label: "A bang or crash" },
  { value: "other", label: "Something else" },
];

function platformName() {
  try {
    if (isDesktop()) return "Desktop";
    if (isNative()) return getNativePlatform() === "ios" ? "iOS" : "Android";
  } catch { /* fall through */ }
  return "Web";
}

// "12:34" or "1:02:03" or "75" → seconds; "" → null.
export function parseSpot(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const parts = t.split(":").map((x) => Number(x));
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function buildSoundReport({ sound, spot, kinds, note }) {
  const heard = KINDS.filter((k) => kinds.includes(k.value)).map((k) => k.label).join(", ");
  const lines = [
    `Sound: ${sound.title}${sound.place ? ` (${sound.place})` : ""}`,
    `Freesound: ${freesoundUrl(sound.id)} (id ${sound.id})`,
    `Where: ${spot == null ? "not sure" : `about ${fmtLength(spot)} in`}`,
    `Heard: ${heard || "not said"}`,
  ];
  if (note.trim()) lines.push("", note.trim());
  lines.push("", "---", `App version: ${APP_VERSION} (${platformName()})`);
  return lines.join("\n");
}

export default function ReportSoundSheet({ open, onClose, soundId, position }) {
  const [id, setId] = useState(soundId || "");
  const [spot, setSpot] = useState("");
  const [kinds, setKinds] = useState(["dog"]);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  // Each time it opens, start from what's playing and where it got to.
  useEffect(() => {
    if (!open) return;
    const builtIn = soundId && NATURE_SOUNDS.some((s) => s.id === soundId);
    setId(builtIn ? soundId : "");
    setSpot(builtIn && position > 0 ? fmtLength(position) : "");
    setKinds(["dog"]);
    setNote("");
    // Only when it opens: the position keeps moving while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sound = natureSoundById(id);
  const body = sound ? buildSoundReport({ sound, spot: parseSpot(spot), kinds, note }) : "";
  const subject = sound ? `Startling sound: ${sound.title}` : "";
  const mailUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${FEEDBACK_EMAIL}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`Copied. Paste it into an email to ${FEEDBACK_EMAIL}.`);
    } catch {
      toast.error("Couldn't copy on this device.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh] sm:max-h-[85vh]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="flex-shrink-0 text-left">
          <DialogTitle>Report a startling sound</DialogTitle>
          <DialogDescription>
            Tell us about a sudden noise in a recording, so it can get a heads-up note for everyone.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto overscroll-contain flex-1 -mx-1 px-1">
          <StackedRow label="Which sound">
            <SearchableSelect
              value={id}
              onChange={(v) => { setId(v); setSpot(""); }}
              options={NATURE_SOUNDS.map((s) => ({ id: s.id, label: s.title }))}
              placeholder="Pick the sound…"
              searchPlaceholder="Search sounds…"
            />
          </StackedRow>
          <Row label="About where" hint="Minutes:seconds into the sound. Leave it empty if you're not sure.">
            <input type="text" inputMode="numeric" value={spot} onChange={(e) => setSpot(e.target.value)}
              placeholder="12:30" aria-label="About where in the sound"
              className="w-24 h-9 rounded-lg border border-input bg-background px-2 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-ring" />
          </Row>
          <StackedRow label="What you heard">
            <Chips label="What you heard" multiple options={KINDS} value={kinds} onChange={setKinds} />
          </StackedRow>
          <StackedRow label="Anything else (optional)">
            {/* Emailed, never saved: no @mention popups in an email. ui-ok */}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="text-sm"
              placeholder="How loud, how long, anything that helps" />
          </StackedRow>
          <p className="text-xs text-muted-foreground pt-2">
            Sent to {FEEDBACK_EMAIL}, the same address bug reports go to. Only the sound, the spot, what you heard,
            your note and the app version ({APP_VERSION}) are included. Please don't add anything personal.
          </p>
        </div>

        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-2 pt-3 border-t border-border/50">
          {sound ? (
            <a href={mailUrl} className={buttonVariants({ className: "flex-1 gap-1.5" })}>
              <Mail className="w-4 h-4" /> Email the report
            </a>
          ) : (
            <Button disabled className="flex-1 gap-1.5"><Mail className="w-4 h-4" /> Email the report</Button>
          )}
          <Button variant="outline" onClick={copy} disabled={!sound} className="flex-1 gap-1.5">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
