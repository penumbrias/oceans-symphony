// Posting to one alter's own board (an AlterMessage on their profile).
// ONE copy: the profile's Board feed widget and the "New post" popup both
// render this, so the save path (postBoardMessage → the full authored-text
// grammar) can't drift between them.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { postBoardMessage, refreshBoard } from "@/lib/alterMessages";
import { isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";

export default function AlterBoardComposer({
  alterId, alters = [], onPosted,
  buttonClassName = "h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium",
  buttonStyle,
}) {
  const t = useTerms();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const post = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const msg = await postBoardMessage({ alterId, text, alters, terms: t });
      if (msg === null) return; // backed out of the whisper warning
      refreshBoard(qc, alterId);
      setText("");
      onPosted?.(msg);
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : "Couldn't post the message");
    } finally { setSaving(false); }
  };
  return (
    <div data-own-hold="" className="space-y-[0.4em]">
      <MentionTextarea toolbar value={text} onChange={setText} alters={alters} signposts
        placeholder="Post to this board… @ to mention, /w @name [secret] to whisper" className="min-h-[70px] text-sm" />
      <div className="flex justify-end">
        <button type="button" onClick={post} disabled={saving || !text.trim()}
          className={`${buttonClassName} disabled:opacity-40`} style={buttonStyle}>Post</button>
      </div>
    </div>
  );
}
