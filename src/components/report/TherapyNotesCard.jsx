import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isReservedCommandWord } from "@/lib/logCommands";
import {
  getTherapyKeyword, setTherapyKeyword, sanitizeTherapyKeyword, isPendingTherapyNote,
  DEFAULT_THERAPY_KEYWORD, THERAPY_KEYWORD_EVENT, THERAPY_NOTES_EVENT,
} from "@/lib/therapyCommand";

// The user's current ~therapy word, kept live across the app.
export function useTherapyKeyword() {
  const [kw, setKw] = useState(getTherapyKeyword);
  useEffect(() => {
    const on = () => setKw(getTherapyKeyword());
    window.addEventListener(THERAPY_KEYWORD_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(THERAPY_KEYWORD_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return kw;
}

function fmt(ts) {
  try { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}

// Top of the Therapy Report page: what ~therapy has captured for the next
// report, and the setting for which word triggers it.
export default function TherapyNotesCard({ notes = [] }) {
  const queryClient = useQueryClient();
  const keyword = useTherapyKeyword();
  const [draft, setDraft] = useState(keyword);
  const [open, setOpen] = useState(false);

  useEffect(() => { setDraft(keyword); }, [keyword]);
  useEffect(() => {
    const on = () => queryClient.invalidateQueries({ queryKey: ["therapyNotes"] });
    window.addEventListener(THERAPY_NOTES_EVENT, on);
    return () => window.removeEventListener(THERAPY_NOTES_EVENT, on);
  }, [queryClient]);

  const pending = notes
    .filter(isPendingTherapyNote)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const clean = sanitizeTherapyKeyword(draft);
  const reserved = clean && isReservedCommandWord(clean);
  const changed = clean !== keyword;

  const save = () => {
    if (!clean) { toast.error("Type a word for the command"); return; }
    if (reserved) { toast.error(`~${clean} is already a built-in command`); return; }
    const saved = setTherapyKeyword(clean);
    toast.success(`Now type ~${saved} to save something for therapy`);
  };

  return (
    <div data-tour="therapy-notes" className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">🛋️ To bring up</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Type <span className="font-mono text-foreground">~{keyword}</span> followed by anything, in any note, chat, journal or status, and it goes into your next report.
          </p>
        </div>
        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {pending.length} waiting
        </span>
      </div>

      {pending.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? "Hide" : "Show"} what's waiting
          </button>
          {open && (
            <ul className="mt-2 rounded-lg border border-border/60 divide-y divide-border/40 max-h-60 overflow-y-auto">
              {pending.map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {fmt(n.timestamp)}{n.source ? ` · ${n.source}` : ""}
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{n.note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="therapy-keyword" className="text-xs text-muted-foreground flex-shrink-0">Command word</label>
        <div className="relative flex-1 max-w-[12rem]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">~</span>
          <Input
            id="therapy-keyword"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && changed) save(); }}
            placeholder={DEFAULT_THERAPY_KEYWORD}
            className="h-8 pl-6 text-sm"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {changed && (
          <Button size="sm" className="h-8" onClick={save} disabled={!clean || reserved}>Save</Button>
        )}
      </div>
      {reserved && (
        <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">~{clean} is already a built-in command. Pick another word.</p>
      )}
    </div>
  );
}
