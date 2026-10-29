import React from "react";
import { renderBulletinContent } from "@/lib/renderBulletinContent";

// Display helper for the plain-text note surfaces (task / check-in / activity
// / alter notes / status). These historically render their content as plain
// text. To let a whisper ("/w @name [secret]" → an inline `.whisper` span) or
// an inline "~command" quick-log chip (`.log-chip` span) show correctly there,
// we render through the shared rich renderer — but ONLY when the content
// actually contains one of those spans. Plain notes without them render exactly
// as before (plain text, newlines kept), so nothing about existing entries
// changes.
//
// Since v0.311.0 these boxes carry the shared formatting toolbar, so text the
// toolbar formatted (its tags, or a ||censor bar||) renders rich too. The
// tag test only matches the tags the toolbar writes, so a plain note that
// happens to hold "<3" or "a < b" still renders as plain text.
const NEEDS_RICH = /class="[^"]*(?:whisper|log-chip)|<(?:b|strong|i|em|u|s|strike|span|div|p|h[1-3]|ul|ol|li|blockquote|code|sup|sub|hr|br|a|img)\b[^>]*>|\|\|[^|]+?\|\|/i;

export default function RichText({ content, alters = [], terms = null, className = "" }) {
  const text = content || "";
  if (!NEEDS_RICH.test(text)) {
    return <span className={className} style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
  }
  // Written in a plain box, so its line breaks are real newlines — keep them.
  return <span className={`wysiwyg-content ${className}`} style={{ whiteSpace: "pre-wrap" }}>{renderBulletinContent(text, alters, terms)}</span>;
}
