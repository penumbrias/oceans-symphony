import React, { useState, useRef, useMemo } from "react";
import useFormDraft from "@/hooks/useFormDraft";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Pin, BarChart2, X, Plus, AtSign, Sparkles, Type, ImagePlus, Loader2, Lock, Check } from "lucide-react";
import { toast } from "sonner";
import { saveMentions, saveAuthoredLog, extractMentionedIds } from "@/lib/mentionUtils";
import { applyWhisper, whisperSpan } from "@/lib/whisperUtils";
import { applyLogCommands } from "@/lib/logCommands";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { parseAndStripSignposts, parseSignpostAuthors, parseSignpostDirectives, foldSignpostAuthors, isSystemSignpost, SYSTEM_SENTINEL_ID } from "@/lib/signpostAuthors";
import { useTerms } from "@/lib/useTerms";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import MentionTextarea from "@/components/shared/MentionTextarea";
import AuthorChipsEditable from "@/components/shared/AuthorChipsEditable";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { AssetButton } from "@/components/shared/AssetPickerModal";

const QUICK_EMOJIS = ["😊", "❤️", "⚠️", "📌", "🔔", "👍", "💜", "🌙"];

// Authors retained from the last post — the default for the next bulletin when
// no one is fronting and nothing's been signposted yet.
const LAST_AUTHORS_KEY = "symphony_last_bulletin_authors_v1";
// First-load expanded state for the signpost help note (dismissible).
const SIGNPOST_HELP_KEY = "symphony_signpost_help_dismissed_v1";
function readLastAuthorIds() {
  try { const v = JSON.parse(localStorage.getItem(LAST_AUTHORS_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// `-system` (or the user's custom term, or the first word of their
// system name) resolves to the system-level sentinel — bulletin gets
// attributed to the system as a whole, no specific alter.
function parseSignposts(content, alters, systemKeywords) {
  const { authors, cleanText } = parseAndStripSignposts(content, alters, systemKeywords);
  return { authors, cleanContent: cleanText };
}

export default function BulletinComposer({ alters, authorAlterId, frontingAlterIds = [], onClose, initialContent = "", groupId = null }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const systemIdentity = useSystemIdentity();
  // Build the recognised system keywords from the user's preferences:
  // their term for "system" (e.g. "collective"), plus the first token
  // of their system name (e.g. "penumbrial" for "Penumbrial Ecosystem")
  // so `-penumbrial` works as a signpost. We also keep the literal
  // word "system" as a fallback via the parser's own default.
  const systemKeywords = React.useMemo(() => {
    const out = [];
    if (terms.system) out.push(terms.system);
    if (systemIdentity.name) {
      systemIdentity.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .forEach((w) => out.push(w));
    }
    return out;
  }, [terms.system, systemIdentity.name]);
  const formatAlter = useAlterLabel();
  const [content, setContent] = useState(initialContent);
  // Authors the user has explicitly removed from this post (delete-only — you
  // add authors by signposting in the text). Keyed by alter id.
  const [removedAuthorIds, setRemovedAuthorIds] = useState(() => new Set());
  // Explicit whisper: a reliable alternative to typing "/w" — toggle on, pick
  // recipients, and the whole post becomes a tap-to-reveal whisper only they
  // can read. (Inline "/w @name …" still works when this is off.)
  const [whisperOn, setWhisperOn] = useState(false);
  const [whisperTo, setWhisperTo] = useState(() => new Set());
  const [whisperSearch, setWhisperSearch] = useState("");
  const [pinned, setPinned] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // synchronous re-entry guard vs duplicate posts
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // "Fancy" mode adds a formatting toolbar + image/GIF upload over the SAME
  // text box — the @mention/-signpost typing + parsing below is completely
  // unchanged either way. Persisted so the last choice sticks.
  const [richMode, setRichMode] = useState(() => {
    try { return localStorage.getItem("symphony_bulletin_rich_mode") === "1"; } catch { return false; }
  });
  const setMode = (rich) => {
    setRichMode(rich);
    try { localStorage.setItem("symphony_bulletin_rich_mode", rich ? "1" : "0"); } catch {}
  };
  // Insert HTML around the current textarea selection (toolbar buttons +
  // image upload go through this). Plain setContent — does NOT run mention
  // detection, which is correct: inserting formatting shouldn't pop the
  // mention/signpost menus.
  const insertHtml = useTextareaInsert(textareaRef, content, setContent);

  // ── Draft autosave — a half-written post (incl. poll fields + whisper
  // recipients) survives navigating away and comes back on the next visit.
  const draftSnapshot = useMemo(() => ({
    content,
    pinned,
    showPoll,
    pollQuestion,
    pollOptions,
    whisperOn,
    whisperTo: [...whisperTo],
    removedAuthorIds: [...removedAuthorIds],
  }), [content, pinned, showPoll, pollQuestion, pollOptions, whisperOn, whisperTo, removedAuthorIds]);
  const { clearDraft } = useFormDraft("symphony_draft_bulletin_new_v1", draftSnapshot, {
    // Don't draft when composing started from a prefilled template/share.
    active: !initialContent,
    isEmpty: (s) =>
      !(s.content || "").replace(/<[^>]*>/g, "").trim() &&
      !s.pollQuestion?.trim() &&
      !(s.pollOptions || []).some((o) => o?.trim()),
    onRestore: (d) => {
      if (typeof d.content === "string") setContent(d.content);
      if (typeof d.pinned === "boolean") setPinned(d.pinned);
      if (typeof d.showPoll === "boolean") setShowPoll(d.showPoll);
      if (typeof d.pollQuestion === "string") setPollQuestion(d.pollQuestion);
      if (Array.isArray(d.pollOptions) && d.pollOptions.length) setPollOptions(d.pollOptions);
      if (typeof d.whisperOn === "boolean") setWhisperOn(d.whisperOn);
      if (Array.isArray(d.whisperTo)) setWhisperTo(new Set(d.whisperTo));
      if (Array.isArray(d.removedAuthorIds)) setRemovedAuthorIds(new Set(d.removedAuthorIds));
    },
  });

  const handleComposerImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That doesn't look like an image."); return; }
    setUploadingImage(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 800, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
      let url = dataUrl;
      if (isLocalMode()) {
        const id = `bulletinimg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(id, dataUrl);
        url = createLocalImageUrl(id);
      }
      insertHtml(`<img src="${url}" alt="" />`, "");
      toast.success(isGif ? "GIF added!" : "Image added!");
    } catch (err) {
      toast.error(err?.message || "Couldn't add that image.");
    } finally {
      setUploadingImage(false);
    }
  };
  // First-compose discoverability hint for the Pin / Poll buttons. Stored
  // in localStorage so it only shows once per device.
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem("symphony_bulletin_compose_hint_seen") !== "1"; }
    catch { return true; }
  });
  const dismissHint = () => {
    setShowHint(false);
    try { localStorage.setItem("symphony_bulletin_compose_hint_seen", "1"); } catch {}
  };

  // Fix cursor position: when opened with initialContent, move cursor to end
  React.useEffect(() => {
    if (initialContent && textareaRef.current) {
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      textareaRef.current.focus();
    }
  }, []);

  // Mention/signpost autocomplete is handled inside <MentionTextarea/>
  // (shared component). Save-path attribution below still uses the
  // boundary-aware matcher from mentionUtils (so "@Sam" no longer matches
  // inside "@Samantha").

  // Authors retained from the last post — the default base when no one is
  // fronting and nothing has been signposted yet.
  const [lastAuthorIds, setLastAuthorIds] = useState(readLastAuthorIds);
  // Dismissible "how signposts work" note — expanded on first ever load.
  const [showSignpostHelp, setShowSignpostHelp] = useState(() => {
    try { return !localStorage.getItem(SIGNPOST_HELP_KEY); } catch { return true; }
  });
  const dismissSignpostHelp = () => {
    setShowSignpostHelp(false);
    try { localStorage.setItem(SIGNPOST_HELP_KEY, "1"); } catch { /* quota/disabled */ }
  };

  // Live authorship from the text's signpost DIRECTIVES, decided at the
  // MESSAGE level so multiple names in one post all stick:
  //   • base = current fronters; else the authors retained from the last post;
  //     else the system as a whole (-[system]).
  //   • If ANY signpost uses "+", it's ADDITIVE: authors = base (fronters) PLUS
  //     every signposted name — e.g. fronting w,e + "+t -j -l" → w,e,t,j,l.
  //   • If NO "+" is present (all "-"), it REPLACES: authors = exactly the
  //     signposted names, ignoring the front — e.g. "-x -y -z" → x,y,z.
  //   • A bare emoji-alias in the text ADDS its alter (no +/- needed).
  // removedAuthorIds (chip × / Clear all) is the final subtract.
  const directives = React.useMemo(
    () => parseSignpostDirectives(content, alters, systemKeywords),
    [content, alters, systemKeywords]
  );
  // Emoji-alias authors (no dash) — always additive. The full parse minus the
  // ids already named by a +/- directive (and minus the system sentinel).
  const emojiAuthorIds = React.useMemo(() => {
    const named = new Set(directives.flatMap((d) => d.alters.map((a) => a.id)));
    return parseSignpostAuthors(content, alters, systemKeywords)
      .filter((a) => !isSystemSignpost(a) && !named.has(a.id))
      .map((a) => a.id);
  }, [content, directives, alters, systemKeywords]);

  const displayAuthors = React.useMemo(() => {
    const byId = (id) => alters.find((a) => a.id === id);
    const fronters = frontingAlterIds.map(byId).filter(Boolean);
    const retained = lastAuthorIds.map(byId).filter(Boolean);
    const base = fronters.length ? fronters : retained;
    // Shared fold: "-x -y -z" → x,y,z; "+t -j -l" over front w,e → w,e,t,j,l.
    const folded = foldSignpostAuthors(content, alters, { systemKeywords, base });
    const withFallback = folded.length ? folded : [{ id: SYSTEM_SENTINEL_ID, isSystem: true }];
    const seen = new Set();
    const out = withFallback.filter((a) => !removedAuthorIds.has(a.id) && (seen.has(a.id) ? false : (seen.add(a.id), true)));
    return out.length ? out : [{ id: SYSTEM_SENTINEL_ID, isSystem: true }];
  }, [content, alters, systemKeywords, frontingAlterIds, lastAuthorIds, removedAuthorIds]);
  const removeAuthor = (id) => setRemovedAuthorIds((s) => new Set(s).add(id));
  const clearAllAuthors = () => {
    // Hide every currently-shown author. removedAuthorIds wins over both the
    // accumulated signposts and the fronter fallback, so nothing re-appears
    // even though the -markers may still be in the text.
    const ids = displayAuthors.map((a) => a.id);
    setRemovedAuthorIds((s) => { const n = new Set(s); ids.forEach((id) => n.add(id)); return n; });
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    if (savingRef.current) return; // re-entry guard (see savingRef above)
    savingRef.current = true;
    setSaving(true);
    try {
    // Execute any inline ~commands first — each becomes a chip in the post.
    const contentWithChips = (await applyLogCommands(content, { isRich: true })).content;
    // Parse signpost authorship from the ORIGINAL text FIRST, so the whisper
    // wrapping below can't be mangled by signpost stripping (the dash matcher
    // would otherwise chew on the whisper span's data-whisper-for attribute).
    // Strip signposts from the body for the saved content. Authorship comes
    // from the folded displayAuthors below — exactly what the preview shows.
    const { cleanContent: signpostClean } = parseSignposts(contentWithChips, alters, systemKeywords);

    // Whisper. The explicit toggle is the reliable path — it produces a
    // guaranteed-correct whisper span addressed to the chosen recipients,
    // bypassing the fragile "/w" regex (which still works as a fallback when
    // the toggle is off).
    let cleanContent = signpostClean;
    let whisperRecipientIds = [];
    let isWhisper = false;
    if (whisperOn && whisperTo.size > 0) {
      const names = [...whisperTo]
        .map((id) => { const a = alters.find((x) => x.id === id); return a ? (a.alias || a.name) : null; })
        .filter(Boolean);
      cleanContent = whisperSpan(signpostClean, names);
      whisperRecipientIds = [...whisperTo];
      isWhisper = true;
    } else {
      const w = applyWhisper(signpostClean, alters, { rich: true, surfaceLabel: "bulletin" });
      if (w === null) return; // user backed out of the whole-blur warning (finally resets saving)
      cleanContent = w.content;
      whisperRecipientIds = w.recipientIds || [];
      isWhisper = !!w.isWhisper;
    }
    // Authorship = exactly what the preview chips show (folded directives over
    // fronters / retained / system, minus removed). The system sentinel alone
    // means "attributed to the system as a whole" (no specific alter).
    let finalAuthorIds = [...new Set(displayAuthors.filter((a) => !isSystemSignpost(a)).map((a) => a.id))];
    let attributeToSystem = finalAuthorIds.length === 0;
    // Defensive live-fetch: if we'd fall back to System ONLY because the
    // fronting prop hadn't hydrated yet (no signpost / emoji author in the
    // text), pull the active fronters so a post right after load isn't
    // mis-attributed to the system.
    if (attributeToSystem && directives.length === 0 && emojiAuthorIds.length === 0) {
      try {
        const active = await base44.entities.FrontingSession.filter({ is_active: true });
        const liveIds = [...new Set(active
          .map((s) => s.alter_id || s.primary_alter_id)
          .filter(Boolean)
          .filter((id) => !removedAuthorIds.has(id)))];
        if (liveIds.length > 0) { finalAuthorIds = liveIds; attributeToSystem = false; }
      } catch { /* fall through */ }
    }
    // Dedup author ids — a stale/duplicate fronting session must not store the
    // same author twice (the "Kane, Kane" glitch carrying into saved posts).
    finalAuthorIds = [...new Set(finalAuthorIds)];
    // For a whisper, notify ONLY the chosen recipients — any @mentions inside
    // the hidden body must not leak the secret to non-recipients.
    const mentionedIds = isWhisper
      ? [...new Set(whisperRecipientIds)]
      : [...new Set([...extractMentionedIds(cleanContent, alters), ...whisperRecipientIds])];

    const data = {
      author_alter_id: attributeToSystem ? null : (finalAuthorIds[0] || authorAlterId || null),
      author_alter_ids: finalAuthorIds,
      content: cleanContent,
      mentioned_alter_ids: mentionedIds,
      // A whisper embeds an HTML span, so force rich rendering even from
      // Simple mode so it renders the hidden bar rather than raw tags.
      is_rich: richMode || isWhisper,
      group_id: groupId || null,
      is_pinned: pinned,
      reactions: {},
      read_by_alter_ids: attributeToSystem
        ? []
        : (finalAuthorIds.length > 0 ? finalAuthorIds : (authorAlterId ? [authorAlterId] : [])),
    };

    if (showPoll && pollQuestion.trim()) {
      // Create the linked Poll entity FIRST so the bulletin can store its
      // id. Both the bulletin's poll block and the standalone Polls page
      // read/write the same Poll record, so voting is unified.
      const filledOptions = pollOptions.filter((o) => o.trim());
      const votes = {};
      filledOptions.forEach((_, idx) => { votes[String(idx)] = []; });
      // Inherit the user's last-used voting mode (alter vs anonymous
      // tally count) from the same localStorage key the Polls page
      // CreatePollModal writes. Same default contract: missing/0 = alter
      // mode, "1" = tally mode. Per-poll override is still possible from
      // the poll's detail view.
      let tallyDefault = false;
      try { tallyDefault = localStorage.getItem("symphony_polls_default_tally_mode") === "1"; }
      catch { /* localStorage might be off; default to alter mode */ }
      const createdPoll = await base44.entities.Poll.create({
        question: pollQuestion.trim(),
        options: filledOptions,
        votes,
        is_closed: false,
        tally_mode: tallyDefault,
        // New polls posted to the Bulletin Board auto-pin themselves to
        // the board so the question is hard to miss; the user can unpin
        // anytime from either surface. A group/subsystem board's polls
        // stay within that board (the bulletin is group-scoped) rather
        // than pinning to the system dashboard.
        pinned_to_dashboard: !groupId,
        // In tally mode there's no per-alter accounting — leave the
        // creator alter null even if a fronter is set.
        created_by_alter_id: tallyDefault ? null : (finalAuthorIds[0] || authorAlterId || null),
        // Back-ref filled in after the bulletin exists.
      });
      data.poll_id = createdPoll.id;
      // Auto-pin the bulletin so its poll block surfaces in the
      // BulletinBoard's Pinned section without the user having to long-
      // press → Pin afterwards.
      data.is_pinned = true;
      // Keep an inline copy in the legacy shape (label+votes) so any
      // surface that still reads `bulletin.poll` (older builds, exports,
      // …) keeps showing the question and options. The render path
      // prefers the Poll entity for vote state — the inline copy is only
      // a label fallback and is NOT kept in sync after creation.
      data.poll = {
        question: pollQuestion.trim(),
        options: filledOptions.map((label) => ({ label, votes: [] })),
      };
    }

    const bulletin = await base44.entities.Bulletin.create(data);
    // Close the loop on the Poll → Bulletin back-ref now that we have an id.
    if (data.poll_id) {
      try { await base44.entities.Poll.update(data.poll_id, { bulletin_id: bulletin.id }); }
      catch { /* non-fatal — the bulletin already references the poll */ }
      qc.invalidateQueries({ queryKey: ["polls"] });
    }
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    // Retain these authors as the default for the NEXT post (used when no one
    // is fronting and nothing's been signposted yet). Empty = the system.
    try { localStorage.setItem(LAST_AUTHORS_KEY, JSON.stringify(finalAuthorIds)); } catch { /* quota/disabled */ }
    // Public @mention notifications — skipped for whispers (the body is hidden;
    // only the chosen recipients are notified, via the loop below).
    if (!isWhisper) {
      await saveMentions({
        content: cleanContent,
        alters,
        sourceType: "bulletin",
        sourceId: bulletin.id,
        sourceLabel: "Bulletin Board",
        navigatePath: `/bulletin/${bulletin.id}`,
        authorAlterId: finalAuthorIds[0] || authorAlterId || null,
      });
    }
    // Whisper recipients are peeled off the body (so saveMentions can't see
    // them) — notify them explicitly so the whisper reaches its target.
    for (const rid of whisperRecipientIds) {
      try {
        await base44.entities.MentionLog.create({
          mentioned_alter_id: rid,
          author_alter_id: finalAuthorIds[0] || authorAlterId || null,
          log_type: "mention",
          source_type: "bulletin",
          source_id: bulletin.id,
          source_label: "Bulletin Board (whisper)",
          source_date: new Date().toISOString(),
          preview_text: "🔒 private whisper",
          navigate_path: `/bulletin/${bulletin.id}`,
        });
      } catch { /* notification best-effort */ }
    }
    // Log authored entry for each author's board
    for (const authorId of finalAuthorIds) {
      await saveAuthoredLog({
        authorAlterId: authorId,
        sourceType: "bulletin",
        sourceId: bulletin.id,
        sourceLabel: "Bulletin Board",
        navigatePath: `/bulletin/${bulletin.id}`,
        previewText: cleanContent,
      });
    }
    toast.success("Bulletin posted!");
    clearDraft(); // posted — never "restore" it again
    onClose?.();
    } catch (e) {
      toast.error(e?.message || "Failed to post bulletin");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">New Bulletin</p>
        {onClose && (
          <button onClick={onClose} aria-label="Close composer" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 mb-2">
        <button type="button" onClick={() => setMode(false)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${!richMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
          <Type className="w-3.5 h-3.5" /> Simple
        </button>
        <button type="button" onClick={() => setMode(true)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${richMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
          <Sparkles className="w-3.5 h-3.5" /> Fancy
        </button>
      </div>

      <MentionTextarea
        ref={textareaRef}
        value={content}
        onChange={setContent}
        alters={alters}
        signposts
        systemName={systemIdentity.name}
        placeholder="Write a message… @ to mention, -name to sign, /w @name [secret] to whisper"
        className="min-h-[80px] text-sm resize-none"
        autoFocus
      />

      {richMode && (
        <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
          <div className="flex items-center gap-1 px-1.5 py-1 bg-muted/10">
            <button type="button" title="Insert image / GIF" disabled={uploadingImage}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
              className="h-6 px-1.5 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50">
              {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Image / GIF
            </button>
            <AssetButton onPick={(url) => insertHtml(`<img src="${url}" alt="" />`, "")} className="h-6 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0" title="Insert from assets" />
            <span className="text-[0.625rem] text-muted-foreground/70 ml-1">Select text, then tap a style. @mentions and -signposts still work.</span>
          </div>
          <MiniToolbar onInsert={insertHtml} />
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleComposerImage} />
        </div>
      )}

      <AuthorChipsEditable authors={displayAuthors} onRemove={removeAuthor} onClearAll={clearAllAuthors} label="Signed by" />

      {showSignpostHelp ? (
        <div className="mt-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2 text-[0.6875rem] text-muted-foreground leading-relaxed relative">
          <button type="button" onClick={dismissSignpostHelp} aria-label="Dismiss" className="absolute top-1.5 right-1.5 text-muted-foreground/60 hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
          <p className="text-foreground font-medium mb-0.5">Signing your posts</p>
          <p>
            Whoever's {terms.fronting} is the author by default (if there is no active {terms.front}, your {terms.system} name and avatar from the settings menu is used, unless you have recently signposted, in which case the author will default to them).
          </p>
          <p className="mt-1.5">
            Type <span className="font-mono text-foreground">-{terms.alter}</span> to set the author (anywhere in the bulletin post), overwriting current {terms.front}. List several (<span className="font-mono text-foreground">-x -y -z</span>), or start signposting with <span className="font-mono text-foreground">+{terms.alter}</span>, and that {terms.alter} and any subsequent signposts will be added to the current {terms.front} instead of replacing.
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => setShowSignpostHelp(true)} className="mt-1 text-[0.625rem] text-muted-foreground/70 hover:text-foreground">
          How signing works
        </button>
      )}

      <div className="flex gap-1 mt-2 flex-wrap">
        {QUICK_EMOJIS.map(e => (
          <button key={e} onClick={() => setContent(c => c + e)} className="text-base hover:scale-125 transition-transform">{e}</button>
        ))}
      </div>

      {showPoll && (
        <div className="mt-3 border border-border/50 rounded-xl p-3 bg-muted/20 space-y-2">
          <Input placeholder="Poll question…" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} className="text-sm" />
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder={`Option ${i + 1}`} value={opt}
                onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }}
                className="text-sm" />
              {pollOptions.length > 2 && (
                <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}><X className="w-4 h-4 text-muted-foreground" /></button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button onClick={() => setPollOptions([...pollOptions, ""])} className="flex items-center gap-1 text-xs text-primary">
              <Plus className="w-3 h-3" /> Add option
            </button>
          )}
        </div>
      )}

      {showHint && (
        <div className="mt-3 flex items-start gap-2 text-xs px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-foreground">
          <span className="text-base leading-none mt-px">💡</span>
          <p className="flex-1 leading-relaxed">
            Tip: tap <b>Poll</b> to attach a vote, <b>Pin</b> to keep the post at the top, or <b>Mention</b> to tag an alter.
          </p>
          <button onClick={dismissHint} aria-label="Dismiss hint" className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mt-3">
        <div className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground/80 mb-1.5">Add to post</div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setPinned(p => !p); dismissHint(); }}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${pinned ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
              <Pin className="w-3.5 h-3.5" /> Pin
            </button>
            <button onClick={() => { setShowPoll(p => !p); dismissHint(); }}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${showPoll ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
              <BarChart2 className="w-3.5 h-3.5" /> Poll
            </button>
            <button onClick={() => { setContent(c => c + "@"); textareaRef.current?.focus(); dismissHint(); }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-all">
              <AtSign className="w-3.5 h-3.5" /> Mention
            </button>
            <button onClick={() => { setWhisperOn(v => !v); dismissHint(); }}
              aria-pressed={whisperOn}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${whisperOn ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
              <Lock className="w-3.5 h-3.5" /> Whisper
            </button>
          </div>
          <Button onClick={() => { dismissHint(); handlePost(); }} disabled={saving || !content.trim()} size="sm" className="bg-primary">
            <Send className="w-3 h-3 mr-1" /> Post
          </Button>
        </div>

        {whisperOn && (
          <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <p className="text-xs font-medium text-primary flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Whisper — only the {terms.alters} you pick can read this post
            </p>
            {whisperTo.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {[...whisperTo].map((id) => {
                  const a = alters.find((x) => x.id === id);
                  if (!a) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full border border-border/60 bg-card text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#6366f1" }} />
                      <span className="truncate max-w-[7rem]">{formatAlter(a)}</span>
                      <button type="button" aria-label={`Remove ${formatAlter(a)}`} onClick={() => setWhisperTo((s) => { const n = new Set(s); n.delete(id); return n; })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            )}
            <input
              value={whisperSearch}
              onChange={(e) => setWhisperSearch(e.target.value)}
              placeholder={`Search ${terms.alters}…`}
              className="w-full h-8 px-2.5 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="max-h-40 overflow-y-auto overscroll-contain space-y-0.5">
              {alters
                .filter((a) => !a.is_archived)
                .filter((a) => { const q = whisperSearch.toLowerCase(); return !q || a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q); })
                .slice(0, 50)
                .map((a) => {
                  const on = whisperTo.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWhisperTo((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors min-h-[36px] ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}
                    >
                      <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: a.color || "#6366f1" }}>
                        {on && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="flex-1 truncate">{formatAlter(a)}</span>
                    </button>
                  );
                })}
            </div>
            {whisperTo.size === 0 && (
              <p className="text-[0.625rem] text-amber-600 dark:text-amber-400">Pick at least one recipient — otherwise this posts as a normal bulletin.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}