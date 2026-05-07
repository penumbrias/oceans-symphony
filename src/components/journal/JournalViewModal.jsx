import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { parseDate } from "@/lib/dateUtils";
import { decryptContent } from "@/lib/encryption";
import { Edit2, Lock, AlertCircle, Loader2, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";

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

export default function JournalViewModal({ open, onClose, entry, altersById, onEdit }) {
  const [decryptPassword, setDecryptPassword] = useState("");
  const [decryptedContent, setDecryptedContent] = useState(null);
  const [decryptError, setDecryptError] = useState("");
  const [decrypting, setDecrypting] = useState(false);
  const [resolvedHtml, setResolvedHtml] = useState(null);

  useEffect(() => {
    if (!open) { setResolvedHtml(null); return; }
    const content = decryptedContent ?? entry?.content;
    if (!content) { setResolvedHtml(null); return; }
    resolveLocalImagesInHtml(content).then(html => setResolvedHtml(processSignposts(html, altersById)));
  }, [open, entry?.content, decryptedContent, altersById]);

  if (!entry) return null;

  const isEncrypted = entry.is_encrypted && decryptedContent === null;
  const displayContent = resolvedHtml ?? decryptedContent ?? entry.content;
  const author = altersById?.[entry.author_alter_id];

  const handleDecrypt = async () => {
    setDecrypting(true);
    setDecryptError("");
    try {
      const result = await decryptContent(entry.content, decryptPassword);
      setDecryptedContent(result);
    } catch {
      setDecryptError("Incorrect password.");
    } finally {
      setDecrypting(false);
    }
  };

  const handleClose = () => {
    setDecryptPassword("");
    setDecryptedContent(null);
    setDecryptError("");
    setResolvedHtml(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold leading-tight">{entry.title}</DialogTitle>
              <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
                <span className="text-xs text-muted-foreground">
                  {format(parseDate(entry.created_date), "MMMM d, yyyy · h:mm a")}
                </span>
                {author && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    ·
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: author.color || "#94a3b8" }}
                    />
                    {author.name}
                  </span>
                )}
                {entry.co_author_alter_ids?.map(id => {
                  const a = altersById?.[id];
                  if (!a) return null;
                  return (
                    <span key={id} className="flex items-center gap-1 text-xs text-muted-foreground">
                      &
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: a.color || "#94a3b8" }}
                      />
                      {a.name}
                    </span>
                  );
                })}
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => { handleClose(); onEdit(entry); }}>
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
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
            <div className="prose prose-sm dark:prose-invert max-w-none py-2">
              {displayContent
                ? (/<[a-z][\s\S]*>/i.test(displayContent)
                    ? <div dangerouslySetInnerHTML={{ __html: displayContent }} />
                    : <ReactMarkdown>{displayContent}</ReactMarkdown>)
                : <p className="text-muted-foreground italic text-sm">No content.</p>
              }
            </div>
          )}
        </div>

        {entry.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border/50">
            {entry.tags.map(tag => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}