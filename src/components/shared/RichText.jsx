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
const NEEDS_RICH = /class="[^"]*(?:whisper|log-chip)/;

export default function RichText({ content, alters = [], terms = null, className = "" }) {
  const text = content || "";
  if (!NEEDS_RICH.test(text)) {
    return <span className={className} style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
  }
  return <span className={`wysiwyg-content ${className}`}>{renderBulletinContent(text, alters, terms)}</span>;
}
