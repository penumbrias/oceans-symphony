import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTerms } from "@/lib/useTerms";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encryptContent, decryptContent } from "@/lib/encryption";
import { Lock, AlertCircle, Loader2, Folder, LayoutGrid, Type, Eye, Code, PenLine, ChevronDown } from "lucide-react";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { saveMentions } from "@/lib/mentionUtils";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import BlockEditor, { blocksToHTML, htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import WysiwygEditor from "@/components/shared/WysiwygEditor";

const getSavedFolders = () => {
  try { return JSON.parse(localStorage.getItem("os_journal_folders") || "[]"); }
  catch { return []; }
};

// Signpost parser lives in src/lib/signpostAuthors.js so it stays in
// sync with the same logic used by BulletinComposer + BulletinCommentThread.
import { parseSignpostAuthors, isSystemSignpost } from "@/lib/signpostAuthors";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import SystemAvatar from "@/components/shared/SystemAvatar";


export default function JournalEditorModal({
  isOpen, open, onClose, editingEntry, entry, alters,
  defaultFolder, currentAlterId,
}) {
  const terms = useTerms();
  const systemIdentity = useSystemIdentity();
  // Keywords that resolve `-foo` to the system-level sentinel. Always
  // includes the user's term for "system" and every individual word
  // (>=3 chars) of their system name, so `-system`, `-collective`, or
  // `-penumbrial` (for "Penumbrial Ecosystem") all work.
  const systemKeywords = useMemo(() => {
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
  const isOpenFinal = isOpen ?? open;
  const editingEntryFinal = editingEntry ?? entry;
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState(defaultFolder || null);
  const [editorMode, setEditorMode] = useState("plain");
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [decryptionPassword, setDecryptionPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState("");
  const [mentionNote, setMentionNote] = useState("");
  const [authorAlterId, setAuthorAlterId] = useState(null);
  const [coAuthorIds, setCoAuthorIds] = useState([]);
  const [showAuthorPicker, setShowAuthorPicker] = useState(false);
  const [authorSearch, setAuthorSearch] = useState("");
  const [signpostText, setSignpostText] = useState("");
  // Tracks whether the user has manually typed in the signpost field this
  // open. When false, picking an author from the dropdown auto-populates the
  // signpost with `-<alter-name>`. The first user keystroke flips it true so
  // we never clobber what they typed. Resets on modal open.
  const [signpostTouchedByUser, setSignpostTouchedByUser] = useState(false);
  // @-mention-style autocomplete for the signpost field. When the user is
  // mid-token (just typed a "-" or chars after one) we surface a popover
  // of matching alters they can click to insert.
  const [signpostMenuOpen, setSignpostMenuOpen] = useState(false);
  const [signpostQuery, setSignpostQuery] = useState("");
  const signpostInputRef = useRef(null);

  const taRef = useRef(null);
  const insert = useTextareaInsert(taRef, content, setContent);
  const folders = getSavedFolders();

  const previewBlocks = useMemo(() => htmlToBlocks(content), [content]);

  const altersById = useMemo(() => {
    const map = {};
    (alters || []).forEach(a => { map[a.id] = a; });
    return map;
  }, [alters]);

  // Parse -name/-alias patterns from the signpost field. We also pass
  // the user's customized term for "system" as a recognised keyword so
  // `-system` (or `-collective`, `-we`, whatever they set) resolves to
  // the system-level sentinel — used to attribute an entry to the
  // whole system rather than any specific alter, just like writing
  // with no fronter set.
  const signpostAuthors = useMemo(
    () => parseSignpostAuthors(signpostText, alters, systemKeywords),
    [signpostText, alters, systemKeywords]
  );

  // If signpost field has results those override the dropdown; else fall
  // back to manual selection. When the first signpost is the system
  // sentinel, treat the entry as unattributed (author_alter_id: null)
  // and ignore co-authors — "system" represents the absence of a
  // specific author.
  const signpostHeadIsSystem = isSystemSignpost(signpostAuthors[0]);
  const effectiveAuthorId = signpostHeadIsSystem
    ? null
    : (signpostAuthors[0]?.id ?? authorAlterId);
  const effectiveCoAuthorIds = signpostHeadIsSystem
    ? []
    : (signpostAuthors.length > 0
        ? signpostAuthors.slice(1).filter(a => !isSystemSignpost(a)).map(a => a.id)
        : coAuthorIds);

useEffect(() => {
    if (editingEntryFinal) {
      setTitle(editingEntryFinal.title || "");
      setIsEncrypted(editingEntryFinal.is_encrypted || false);
      setFolder(editingEntryFinal.folder || null);
      setAuthorAlterId(editingEntryFinal.author_alter_id || null);
      setCoAuthorIds(editingEntryFinal.co_author_alter_ids || []);
      if (editingEntryFinal.is_encrypted) {
        setShowPasswordField(true);
        setContent("");
      } else {
        setContent(editingEntryFinal.content || "");
        setShowPasswordField(false);
      }
    } else {
      setTitle("");
      setContent("");
      setMentionNote("");
      setIsEncrypted(false);
      setShowPasswordField(false);
      setFolder(defaultFolder || null);
      setEditorMode("plain");
      setAuthorAlterId(currentAlterId || null);
      setCoAuthorIds([]);
    }
    setEncryptionPassword("");
    setDecryptionPassword("");
    setDecryptionError("");
    setShowAuthorPicker(false);
    setAuthorSearch("");
    setSignpostText("");
    setSignpostMenuOpen(false);
    setSignpostQuery("");
    // Each open starts as "untouched" so the dropdown can auto-fill the
    // signpost. The auto-fill effect below will populate from the loaded
    // author once alters resolve.
    setSignpostTouchedByUser(false);
  }, [editingEntryFinal?.id, isOpenFinal]);

  // Auto-fill the signpost field from the dropdown author + co-authors when
  // the user hasn't manually typed in it. Picking an alter from "Written by"
  // should surface the same -name marker so the signpost-overrides-dropdown
  // precedence still ends up at the same alter (and the user sees a
  // consistent indicator). When the user types over it, the touched flag
  // flips and this effect bows out. When loading an existing multi-author
  // entry, ALL author markers must appear here — surfacing only the primary
  // dropped co-authors on re-save and caused the "edit shows previous
  // version" bug.
  useEffect(() => {
    if (!isOpenFinal) return;
    if (signpostTouchedByUser) return;
    const allIds = [authorAlterId, ...(coAuthorIds || [])].filter(Boolean);
    if (allIds.length === 0) {
      if (signpostText) setSignpostText("");
      return;
    }
    const markers = allIds
      .map(id => altersById[id])
      .filter(Boolean)
      .map(a => `-${(a.alias || a.name || "").trim()}`);
    const marker = markers.join(" ");
    if (marker && marker !== signpostText) setSignpostText(marker);
  }, [authorAlterId, coAuthorIds, altersById, isOpenFinal, signpostTouchedByUser]);

  // Backfill author when fronting data arrives after the modal is already open
  useEffect(() => {
    if (!isOpenFinal || editingEntryFinal || !currentAlterId) return;
    setAuthorAlterId((prev) => (prev == null ? currentAlterId : prev));
  }, [currentAlterId, isOpenFinal]);

  const handleDecrypt = async () => {
    setIsDecrypting(true);
    setDecryptionError("");
    try {
      const decrypted = await decryptContent(editingEntryFinal.content, decryptionPassword);
      setContent(decrypted);
      setShowPasswordField(false);
    } catch (error) {
      setDecryptionError(error.message);
    } finally {
      setIsDecrypting(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingEntryFinal) {
        return base44.entities.JournalEntry.update(editingEntryFinal.id, data);
      } else {
        return base44.entities.JournalEntry.create(data);
      }
    },
    onSuccess: async (savedEntry) => {
      if (mentionNote.trim() && alters?.length > 0) {
        await saveMentions({
          content: mentionNote,
          alters,
          sourceType: "journal",
          sourceId: savedEntry.id,
          sourceLabel: title || "Journal Entry",
          navigatePath: `/journals?id=${savedEntry.id}`,
          authorAlterId: authorAlterId || null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["journals"] });
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
      setMentionNote("");
      onClose();
    },
  });

  const handleSave = async () => {
    let finalContent = content;
    if (isEncrypted && encryptionPassword) {
      finalContent = await encryptContent(content, encryptionPassword);
    }
    saveMutation.mutate({
      title: title.trim() || new Date().toLocaleString(),
      content: finalContent,
      is_encrypted: isEncrypted,
      folder: folder || null,
      author_alter_id: effectiveAuthorId || null,
      co_author_alter_ids: effectiveCoAuthorIds,
    });
  };

  const authorAlter = altersById[authorAlterId] || null;
  const filteredAltersForAuthor = useMemo(
    () => (alters || []).filter(a => !authorSearch || a.name.toLowerCase().includes(authorSearch.toLowerCase())),
    [alters, authorSearch]
  );

  // Alters that match the current signpost autocomplete query, filtered to
  // active ones — archived alters shouldn't show up as suggestions even if
  // they're still in the alters array (consistent with BulletinComposer).
  const signpostSuggestions = useMemo(() => {
    const q = (signpostQuery || "").toLowerCase();
    // System sentinel matches when query is empty, or a prefix of any
    // recognised system keyword: the literal "system", the user's
    // customised term, or any word in their system name.
    const systemMatches = (() => {
      if (!q) return true;
      if ("system".startsWith(q)) return true;
      if (terms.system && terms.system.toLowerCase().startsWith(q)) return true;
      if (systemIdentity.name) {
        const tokens = systemIdentity.name.toLowerCase().split(/\s+/);
        if (tokens.some((t) => t.startsWith(q))) return true;
      }
      return false;
    })();
    const alterMatches = (alters || [])
      .filter(a => !a.is_archived)
      .filter(a =>
        !q ||
        a.name?.toLowerCase().includes(q) ||
        (a.alias && a.alias.toLowerCase().includes(q))
      );
    const list = [];
    if (systemMatches) {
      list.push({ id: "__system__", isSystem: true, name: systemIdentity.name });
    }
    return list.concat(alterMatches).slice(0, 8);
  }, [alters, signpostQuery, terms.system, systemIdentity.name]);

  const handleSignpostChange = (e) => {
    const val = e.target.value;
    if (!signpostTouchedByUser) setSignpostTouchedByUser(true);
    setSignpostText(val);
    // Detect a `-<chars>` token sitting at the caret. If the user is mid-
    // word (no space yet), surface the autocomplete; otherwise hide it.
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const m = before.match(/-([\w/]*)$/);
    if (m) {
      setSignpostQuery(m[1]);
      setSignpostMenuOpen(true);
    } else {
      setSignpostMenuOpen(false);
    }
  };

  const insertSignpostFromMenu = (alter) => {
    const input = signpostInputRef.current;
    const cursor = input?.selectionStart ?? signpostText.length;
    const before = signpostText.slice(0, cursor);
    const after = signpostText.slice(cursor);
    // For the system sentinel we always insert the literal word
    // "system" so the parser recognises it without depending on the
    // user's term casing. (The system keyword is term-aware on the
    // parsing side too, so either form round-trips.)
    const token = alter.isSystem ? "system" : (alter.alias || alter.name);
    const replaced = before.replace(/-([\w/]*)$/, `-${token} `);
    const next = replaced + after;
    if (!signpostTouchedByUser) setSignpostTouchedByUser(true);
    setSignpostText(next);
    setSignpostMenuOpen(false);
    setSignpostQuery("");
    requestAnimationFrame(() => {
      input?.focus();
      const pos = replaced.length;
      try { input?.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  };

  return (
    <Dialog open={isOpenFinal} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">

        {/* ── Fixed header: modal title + entry title + author ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-border/50 space-y-3">
          <DialogHeader>
            <DialogTitle>{editingEntryFinal ? "Edit Entry" : "New Journal Entry"}</DialogTitle>
          </DialogHeader>

          <Input placeholder="Entry title" value={title} onChange={(e) => setTitle(e.target.value)} />

          {/* Author — dropdown default + -name signpost field */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <PenLine className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground flex-shrink-0">Written by</span>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowAuthorPicker(v => !v); setAuthorSearch(""); }}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border/60 hover:border-border bg-background transition-colors"
                >
                  {(() => {
                    if (signpostHeadIsSystem) {
                      return (
                        <>
                          <SystemAvatar size="sm" />
                          <span className="max-w-[120px] truncate">{systemIdentity.name}</span>
                        </>
                      );
                    }
                    const a = altersById[effectiveAuthorId];
                    return a ? (
                      <>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }} />
                        <span className="max-w-[120px] truncate">{a.name}</span>
                      </>
                    ) : <span className="text-muted-foreground">No attribution</span>;
                  })()}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
                {showAuthorPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAuthorPicker(false)} />
                    <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl w-60 overflow-hidden">
                      <div className="px-3 py-2 border-b border-border/50">
                        <input autoFocus value={authorSearch} onChange={e => setAuthorSearch(e.target.value)}
                          placeholder={`Search ${terms.alters}...`}
                          className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground" />
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        <button type="button" onClick={() => { setAuthorAlterId(null); setShowAuthorPicker(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors ${!authorAlterId ? "text-primary font-medium" : "text-muted-foreground"}`}>
                          No attribution
                        </button>
                        {filteredAltersForAuthor.map(a => (
                          <button key={a.id} type="button" onClick={() => { setAuthorAlterId(a.id); setShowAuthorPicker(false); }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${authorAlterId === a.id ? "bg-primary/5 text-primary" : ""}`}>
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#94a3b8" }} />
                            <span className="flex-1 truncate">{a.name}</span>
                            {a.id === currentAlterId && <span className="text-[0.625rem] text-primary/70 flex-shrink-0">{terms.fronting}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="relative flex-1 min-w-[140px]">
                <input
                  ref={signpostInputRef}
                  value={signpostText}
                  onChange={handleSignpostChange}
                  onBlur={() => { setTimeout(() => setSignpostMenuOpen(false), 150); }}
                  placeholder="-name or -alias to sign"
                  className="w-full text-xs font-mono bg-transparent border border-border/40 rounded-lg px-2.5 py-1 focus:border-primary/50 outline-none placeholder:text-muted-foreground/40"
                />
                {signpostMenuOpen && signpostSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[0.625rem] uppercase tracking-wide text-muted-foreground font-medium border-b border-border/50">
                      Sign as…
                    </div>
                    {signpostSuggestions.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertSignpostFromMenu(a)}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-xs"
                      >
                        {a.isSystem ? (
                          <SystemAvatar size="sm" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#94a3b8" }} />
                        )}
                        <span className="flex-1 truncate">{a.isSystem ? systemIdentity.name : a.name}</span>
                        {a.isSystem
                          ? <span className="text-muted-foreground text-[0.625rem]">(no specific {terms.alter})</span>
                          : (a.alias && <span className="text-muted-foreground text-[0.625rem]">({a.alias})</span>)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {signpostAuthors.length > 0 && (
              <div className="flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                <span>Signing as:</span>
                {signpostAuthors.map((a, i) => (
                  <span key={a.id} className="flex items-center gap-1">
                    {isSystemSignpost(a) ? (
                      <SystemAvatar size="sm" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#94a3b8" }} />
                    )}
                    {isSystemSignpost(a) ? systemIdentity.name : a.name}
                    {i === 0 && signpostAuthors.length > 1 && <span className="opacity-50">(primary)</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">

          {/* Folder selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Folder</label>
            {(() => {
              const levels = [];
              const rootFolders = folders.filter(f => !f.includes("/"));
              levels.push({ parent: null, items: rootFolders, depth: 0 });
              if (folder) {
                const parts = folder.split("/");
                for (let i = 0; i < parts.length; i++) {
                  const parentPath = parts.slice(0, i + 1).join("/");
                  const childFolders = folders.filter(f => {
                    const fParts = f.split("/");
                    return fParts.length === i + 2 && f.startsWith(`${parentPath}/`);
                  });
                  if (childFolders.length > 0) {
                    levels.push({ parent: parentPath, items: childFolders, depth: i + 1 });
                  }
                }
              }
              const colors = ["border-primary/20", "border-blue-500/30", "border-purple-500/30", "border-pink-500/30", "border-amber-500/30"];
              return levels.map((level, li) => (
                <div key={li} className={`flex flex-wrap gap-1.5 ${li > 0 ? `pl-3 border-l-2 ml-1 ${colors[li] || colors[colors.length - 1]}` : ""}`}>
                  {li === 0 && (
                    <button type="button" onClick={() => setFolder(null)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${!folder ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                      None
                    </button>
                  )}
                  {level.items.map(f => (
                    <button key={f} type="button" onClick={() => setFolder(f)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                        folder === f ? "border-primary/40 bg-primary/10 text-primary" :
                        folder?.startsWith(`${f}/`) ? "border-primary/20 bg-primary/5 text-primary/70" :
                        "border-border text-muted-foreground hover:border-primary/30"
                      }`}>
                      {f.split("/").pop()}
                    </button>
                  ))}
                </div>
              ));
            })()}
          </div>

          {!editingEntryFinal && (
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
              <Checkbox checked={isEncrypted} onCheckedChange={setIsEncrypted} id="encrypt-toggle" />
              <label htmlFor="encrypt-toggle" className="flex items-center gap-2 cursor-pointer flex-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Make this entry private (encrypted)</span>
              </label>
            </div>
          )}

          {isEncrypted && !editingEntryFinal && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Encryption Password</label>
              <Input type="password" placeholder="Enter password to encrypt this entry"
                value={encryptionPassword} onChange={(e) => setEncryptionPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Store your password safely. You'll need it to read this entry.
              </p>
            </div>
          )}

          {editingEntryFinal?.is_encrypted && showPasswordField && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Entry Password</label>
              <div className="flex gap-2">
                <Input type="password" placeholder="Enter password to decrypt"
                  value={decryptionPassword} onChange={(e) => setDecryptionPassword(e.target.value)} />
                <Button onClick={handleDecrypt} disabled={isDecrypting || !decryptionPassword} size="sm">
                  {isDecrypting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isDecrypting ? "Decrypting..." : "Decrypt"}
                </Button>
              </div>
              {decryptionError && (
                <p className="text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {decryptionError}
                </p>
              )}
            </div>
          )}

          {(!editingEntryFinal?.is_encrypted || !showPasswordField) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Content</label>
                <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
                  <button type="button" onClick={() => setEditorMode("plain")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "plain" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Type className="w-3 h-3" /> Plain
                  </button>
                  <button type="button" onClick={() => setEditorMode("simple")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "simple" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Eye className="w-3 h-3" /> Simple
                  </button>
                  <button type="button" onClick={() => setEditorMode("blocks")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "blocks" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <LayoutGrid className="w-3 h-3" /> Blocks
                  </button>
                  <button type="button" onClick={() => setEditorMode("raw")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${editorMode === "raw" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Code className="w-3 h-3" /> Raw
                  </button>
                </div>
              </div>

              {editorMode === "plain" ? (
                <WysiwygEditor value={content} onChange={setContent} placeholder="Write your entry..." />
              ) : editorMode === "raw" ? (
                <div className="rounded-xl border border-input bg-background">
                  <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)}
                    placeholder="Write your entry... Use ~AlterName: to signpost sections."
                    className="w-full min-h-[200px] px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-y font-mono leading-relaxed rounded-t-xl"
                    spellCheck={false} />
                  <MiniToolbar onInsert={insert} />
                </div>
              ) : editorMode === "simple" ? (
                <SimplePreview
                  blocks={previewBlocks}
                  onBlockChange={(id, patch) => {
                    const updated = previewBlocks.map(b => b.id === id ? { ...b, ...patch } : b);
                    setContent(blocksToHTML(updated));
                  }}
                />
              ) : (
                <BlockEditor value={content} onChange={setContent} />
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Mention {terms.alters}</label>
            <p className="text-xs text-muted-foreground mb-1">Tag {terms.alters} to notify them of this entry</p>
            <MentionTextarea value={mentionNote} onChange={setMentionNote} alters={alters || []} placeholder={`Use @ to mention ${terms.alters}...`} className="h-16" />
          </div>
        </div>

        {/* ── Fixed footer ── */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-border/50">
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={(isEncrypted && !encryptionPassword && !editingEntryFinal) || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Entry
            </Button>
          </DialogFooter>
        </div>

      </DialogContent>
    </Dialog>
  );
}
