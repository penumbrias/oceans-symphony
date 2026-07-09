import React, { forwardRef, useRef, useCallback } from "react";

// Lightweight syntax-highlighted code editor for the Raw-HTML bio mode.
//
// No external dependency (the app is offline-first, no CDN). It's the classic
// "highlight overlay" technique: a transparent <textarea> sits over a coloured
// <pre>, both sharing identical typography so the caret lines up with the
// highlighted text. The textarea is the source of truth — the colour layer is
// purely cosmetic, so even if the tokenizer mis-colours an edge case the text
// stays fully editable and visible.

// HTML-escape so the code renders as literal text (and so our token <span>s are
// the only real tags in the highlighted layer).
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Best-effort HTML tokenizer. Escapes first, then wraps tags / attributes /
// strings / comments in coloured spans WITHOUT changing any visible character,
// so the coloured <pre> stays character-aligned with the textarea.
function highlightHtml(code) {
  if (!code) return "";
  let out = esc(code);
  // Comments first.
  out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tk-com">$1</span>');
  // Tags: <tag ...attrs...> and closing </tag>. Requires a letter after the
  // opening bracket so it never swallows comments (which start with "!").
  out = out.replace(
    /(&lt;\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?&gt;)/g,
    (m, open, name, attrs, close) => {
      const a = attrs.replace(
        /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)(\s*=\s*)("[^"]*"|'[^']*')/g,
        (mm, an, eq, av) => `<span class="tk-attr">${an}</span>${eq}<span class="tk-str">${av}</span>`
      );
      return `<span class="tk-punct">${open}</span><span class="tk-tag">${name}</span>${a}<span class="tk-punct">${close}</span>`;
    }
  );
  return out;
}

// Token colours use Tailwind -600-ish saturated mid-tones so they read on both
// the light and dark editor backgrounds without needing per-theme palettes.
const TOKEN_CSS = `
.os-code-hl .tk-tag{color:#e11d48;}
.os-code-hl .tk-attr{color:#d97706;}
.os-code-hl .tk-str{color:#059669;}
.os-code-hl .tk-com{color:#94a3b8;font-style:italic;}
.os-code-hl .tk-punct{color:#6b7280;}
.os-code-hl textarea::selection{background:hsl(var(--primary)/0.3);}
`;

// Shared typography — MUST be identical on the <pre> and <textarea> or the
// colours drift from the caret.
const TYPO = "px-3 py-2.5 text-sm font-mono leading-relaxed";
const WRAP_STYLE = { whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word", tabSize: 2 };

const CodeEditor = forwardRef(function CodeEditor({ value = "", onChange, placeholder, minHeight = 200 }, ref) {
  const preRef = useRef(null);

  // Keep the highlight layer scrolled in lockstep with the textarea.
  const syncScroll = useCallback((e) => {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = e.target.scrollTop;
    pre.scrollLeft = e.target.scrollLeft;
  }, []);

  return (
    <div className="os-code-hl relative">
      <style>{TOKEN_CSS}</style>
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`absolute inset-0 m-0 overflow-hidden pointer-events-none ${TYPO}`}
        style={WRAP_STYLE}
      >
        <code dangerouslySetInnerHTML={{ __html: highlightHtml(value) + "\n" }} />
      </pre>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`relative w-full block bg-transparent resize-y focus:outline-none rounded-t-xl ${TYPO}`}
        style={{ ...WRAP_STYLE, minHeight, color: "transparent", caretColor: "hsl(var(--foreground))" }}
      />
    </div>
  );
});

export default CodeEditor;
