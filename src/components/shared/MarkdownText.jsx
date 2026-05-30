import React from "react";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";

// Shared free-text markdown renderer. Mirrors JournalViewModal's
// approach so formatting behaves consistently across the app:
//   - Legacy values that contain raw HTML are sanitised with DOMPurify
//     and rendered as HTML (back-compat for anything that stored HTML).
//   - Everything else renders as Markdown via react-markdown, which is
//     safe by default (it does NOT pass raw HTML through unless you add
//     rehype-raw, which we don't).
//
// Used for `text`-type custom fields and other free-text surfaces that
// should support light formatting (bold, italics, lists, links). The
// `prose` classes give readable typography in both light and dark mode.
export default function MarkdownText({ children, className = "" }) {
  const content = typeof children === "string" ? children : "";
  if (!content) return null;
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none break-words ${className}`}>
      {hasHtml
        ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
        : <ReactMarkdown>{content}</ReactMarkdown>}
    </div>
  );
}
