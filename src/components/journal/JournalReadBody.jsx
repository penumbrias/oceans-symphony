import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decryptContent, encryptContent, isLegacyEncryptedContent } from "@/lib/encryption";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, AlertCircle, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";

// The body of a journal entry as it is read: the password box for a locked
// entry, then the content (pictures resolved, signposts and @mentions drawn).
// ONE copy — the view modal and the pixel reading pane both render it, so
// unlocking, the weak-lock upgrade and the mention links behave the same.
// Decrypt state lives here; mount it with key={entry.id} so a new entry
// always starts locked again.

function processSignposts(html, altersById) {
  if (!html || !altersById) return html;
  let result = html;
  Object.values(altersById).forEach(alter => {
    if (!alter?.name) return;
    const escaped = alter.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const color = /^#[0-9a-fA-F]{3,8}$/.test(alter.color) ? alter.color : "#94a3b8";
    const displayName = alter.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    result = result.replace(
      new RegExp(`~${escaped}\\s*:`, "gi"),
      `<span style="display:inline-block;background:${color}22;color:${color};border:1px solid ${color}55;border-radius:4px;padding:1px 8px;font-size:0.72rem;font-weight:700;margin:0 2px 0 0;letter-spacing:0.02em;">~ ${displayName}:</span>`
    );
  });
  return result;
}

// Linkify @mentions in journal content so tapping one opens the alter's
// profile (the AppLayout delegated click handler routes `data-internal-link`
// anchors through React Router). Mirrors the bulletin/chat mention chip.
//
// Guarded two ways: (1) only runs when the content is already HTML — injecting
// anchors into a plain-markdown entry would flip it to HTML rendering and make
// its markdown render literally, so markdown entries keep plain @text; (2) the
// `[^\w@>]` boundary + `(?![\w])` lookahead avoid matching mid-word, inside
// emails (name@host), or re-linking an already-inserted anchor (which is
// preceded by `>`). Tokens are sorted longest-first so "@Anna" wins over "@Ann".
function processMentions(html, altersById) {
  if (!html || !altersById) return html;
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const entries = [];
  Object.values(altersById).forEach(alter => {
    if (!alter?.id) return;
    [alter.name, alter.alias].forEach(tok => {
      if (tok && typeof tok === "string" && tok.trim()) entries.push({ token: tok.trim(), alter });
    });
  });
  entries.sort((a, b) => b.token.length - a.token.length);
  let result = html;
  for (const { token, alter } of entries) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const color = /^#[0-9a-fA-F]{3,8}$/.test(alter.color) ? alter.color : "#8b5cf6";
    const display = token.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const re = new RegExp(`(^|[^\\w@>])@${escaped}(?![\\w])`, "g");
    result = result.replace(
      re,
      `$1<a href="/alter/${alter.id}" data-internal-link="/alter/${alter.id}" class="mention-link" style="color:${color};font-weight:600;text-decoration:none;">@${display}</a>`
    );
  }
  return result;
}

async function resolveLocalImagesInHtml(html) {
  if (!html || !html.includes("local-image://")) return html;
  const { resolveImageUrl } = await import("@/lib/imageUrlResolver");
  const matches = [...new Set([...html.matchAll(/src="(local-image:\/\/[^"]+)"/g)].map(m => m[1]))];
  if (!matches.length) return html;
  const resolved = await Promise.all(matches.map(url => resolveImageUrl(url).catch(() => null)));
  let result = html;
  matches.forEach((url, i) => {
    if (resolved[i]) result = result.replaceAll(`src="${url}"`, `src="${resolved[i]}"`);
  });
  return result;
}

export default function JournalReadBody({ entry, altersById, className = "prose prose-sm dark:prose-invert max-w-none py-2" }) {
  const queryClient = useQueryClient();
  const [decryptPassword, setDecryptPassword] = useState("");
  const [decryptedContent, setDecryptedContent] = useState(null);
  const [decryptError, setDecryptError] = useState("");
  const [decrypting, setDecrypting] = useState(false);
  const [resolvedHtml, setResolvedHtml] = useState(null);

  useEffect(() => {
    let live = true;
    const content = decryptedContent ?? entry?.content;
    if (!content) { setResolvedHtml(null); return undefined; }
    resolveLocalImagesInHtml(content).then(html => { if (live) setResolvedHtml(processMentions(processSignposts(html, altersById), altersById)); });
    return () => { live = false; };
  }, [entry?.content, decryptedContent, altersById]);

  if (!entry) return null;
  const displayContent = resolvedHtml ?? decryptedContent ?? entry.content;

  const handleDecrypt = async () => {
    setDecrypting(true);
    setDecryptError("");
    try {
      const result = await decryptContent(entry.content, decryptPassword);
      setDecryptedContent(result);
      // Transparent upgrade: an entry locked with the old weak scheme is
      // re-encrypted with the strong one the moment it opens successfully
      // (same password, same content — nothing the user sees changes).
      if (isLegacyEncryptedContent(entry.content)) {
        try {
          const upgraded = await encryptContent(result, decryptPassword);
          await base44.entities.JournalEntry.update(entry.id, { content: upgraded });
          queryClient?.invalidateQueries({ queryKey: ["journalEntries"] });
        } catch { /* best-effort — the entry still opens; it upgrades next time */ }
      }
    } catch {
      setDecryptError("Incorrect password.");
    } finally {
      setDecrypting(false);
    }
  };

  return (
    <>
      {entry.is_encrypted && decryptedContent === null ? (
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="w-4 h-4" />
            <span className="text-sm">This entry is encrypted. Enter the password to read it.</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Entry password..."
              value={decryptPassword}
              onChange={e => setDecryptPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && decryptPassword && handleDecrypt()}
            />
            <Button onClick={handleDecrypt} disabled={!decryptPassword || decrypting}>
              {decrypting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Unlock
            </Button>
          </div>
          {decryptError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {decryptError}
            </p>
          )}
        </div>
      ) : (
        <div className={className}>
          {displayContent
            ? (/<[a-z][\s\S]*>/i.test(displayContent)
                ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayContent) }} />
                : <ReactMarkdown>{displayContent}</ReactMarkdown>)
            : <p className="text-muted-foreground italic text-sm">No content.</p>
          }
        </div>
      )}
    </>
  );
}
