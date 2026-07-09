// Ready-made profile (bio) templates — the "pick a page design, then fill in
// the blanks" library behind the Templates button in BioEditor.
//
// TWO kinds, mirroring how people actually build these pages:
// - BIO_TEMPLATES  — full-page designs (replace or append the whole bio).
// - BIO_MODULES    — small stackable SECTIONS (a header, an about block, a
//                    likes/dislikes grid, a divider…) that get APPENDED below
//                    whatever is already there, so a profile is assembled
//                    module by module. Each has a `category` for filtering.
//
// This module is LAZY-LOADED (dynamic import in BioTemplatePicker.jsx) so the
// template HTML lives in its own chunk and never bloats the main bundle.
//
// Authoring rules (learned from previewWiki.js + the bio render pipeline):
// - ONE LINE of HTML per template/module. htmlToBlocks() splits un-wrapped
//   bios on newline-before-<div>, so newlines are collapsed at build time to
//   keep each entry a single editable block.
// - Fillable fields are <span data-edit>…</span> with PLAIN TEXT inside —
//   SimplePreview's tap-to-edit modal swaps the span's textContent, so nested
//   tags inside a data-edit span would be lost on first edit.
// - Theme-aware entries use hsl(var(--primary)) / var(--border) etc. so they
//   recolour with the user's theme (modules default to theme-aware so a stack
//   of them looks coherent). Aesthetic entries COMMIT to a palette and bring
//   their own background so they read correctly on any app theme.
// - Animations use <style> + @keyframes — scopeBioStyles() renames keyframes
//   per profile and scopes every selector, so templates can't leak CSS.
// - ||spoiler|| markers work (spoilersToHtml runs in the renderer).
// - No external URLs (offline-first), no scripts (stripped anyway).

const one = (s) => s.replace(/\s*\n\s*/g, " ").trim();

// Shared micro-styles
const LABEL = 'font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:hsl(var(--primary));';

// ── Modules — stackable sections ────────────────────────────────────────────
export const BIO_MODULES = [
  {
    id: "mod-minimal-header",
    name: "Minimalist header",
    category: "Header",
    html: one(`
      <div style="padding:6px 2px 2px;">
        <div style="font-size:30px;font-weight:800;letter-spacing:0.01em;line-height:1.1;"><span data-edit>ALTER NAME</span></div>
        <div style="font-size:13px;color:hsl(var(--muted-foreground));margin-top:3px;"><span data-edit>pronouns</span> · <span data-edit>role</span> · <span data-edit>age</span></div>
        <hr style="border:none;border-top:1px solid hsl(var(--border));margin:12px 0 4px;">
      </div>
    `),
  },
  {
    id: "mod-glowing-header",
    name: "Glowing header",
    category: "Header",
    html: one(`
      <div style="text-align:center;padding:14px 2px 8px;">
        <style>@keyframes tpl-glow{0%,100%{text-shadow:0 0 8px hsl(var(--primary)/0.7),0 0 26px hsl(var(--primary)/0.35)}50%{text-shadow:0 0 16px hsl(var(--primary)/0.95),0 0 44px hsl(var(--primary)/0.5)}}</style>
        <div style="font-size:12px;letter-spacing:0.35em;text-transform:uppercase;color:hsl(var(--muted-foreground));margin-bottom:4px;">✦ <span data-edit>system name</span> ✦</div>
        <div style="font-size:30px;font-weight:900;color:hsl(var(--primary));animation:tpl-glow 2.6s ease-in-out infinite;"><span data-edit>ALTER NAME</span></div>
        <div style="font-size:13px;color:hsl(var(--muted-foreground));margin-top:4px;"><span data-edit>pronouns · role</span></div>
      </div>
    `),
  },
  {
    id: "mod-about-minimal",
    name: "Minimal about",
    category: "About",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="${LABEL}margin-bottom:6px;">About</div>
        <p style="line-height:1.75;margin:0;"><span data-edit>Write something about this alter here — who they are, what they carry, what they mean to the system.</span></p>
      </div>
    `),
  },
  {
    id: "mod-about-terminal",
    name: "Terminal about",
    category: "About",
    html: one(`
      <div style="background:#0d1117;border:1px solid #1f2937;border-radius:10px;padding:14px;font-family:'Cascadia Code','Fira Code',monospace;font-size:13px;color:#4ade80;line-height:1.8;margin:8px 0;">
        <div><span style="color:#22d3ee;">$</span> cat about.txt</div>
        <div style="color:#a7f3d0;"><span data-edit>info: protector — keeps watch when things feel unsafe. write anything here.</span></div>
      </div>
    `),
  },
  {
    id: "mod-about-typewriter",
    name: "Typewriter about",
    category: "About",
    html: one(`
      <div style="padding:8px 2px;font-family:'Courier New',monospace;">
        <style>@keyframes tpl-type{from{max-width:0}to{max-width:100%}}@keyframes tpl-caret{0%,100%{border-color:transparent}50%{border-color:currentColor}}</style>
        <div style="overflow:hidden;white-space:nowrap;border-right:2px solid;display:inline-block;max-width:100%;animation:tpl-type 2.8s steps(34) 0.3s both,tpl-caret 0.9s step-end infinite;font-weight:700;"><span data-edit>who this alter is, typed out slowly…</span></div>
        <p style="line-height:1.8;margin:8px 0 0;"><span data-edit>Then the rest of the story, in regular ink. Where they came from, what they protect, what they'd rather be doing.</span></p>
      </div>
    `),
  },
  {
    id: "mod-likes-pills",
    name: "Likes & dislikes pills",
    category: "Likes/Dislikes",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          <span style="background:hsl(var(--primary)/0.12);border:1px solid hsl(var(--primary)/0.4);color:hsl(var(--primary));border-radius:99px;padding:3px 10px;font-size:12px;">+ <span data-edit>thing</span></span>
          <span style="background:hsl(var(--primary)/0.12);border:1px solid hsl(var(--primary)/0.4);color:hsl(var(--primary));border-radius:99px;padding:3px 10px;font-size:12px;">+ <span data-edit>thing</span></span>
          <span style="background:hsl(var(--primary)/0.12);border:1px solid hsl(var(--primary)/0.4);color:hsl(var(--primary));border-radius:99px;padding:3px 10px;font-size:12px;">+ <span data-edit>thing</span></span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span style="background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.45);color:#ef4444;border-radius:99px;padding:3px 10px;font-size:12px;">− <span data-edit>thing</span></span>
          <span style="background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.45);color:#ef4444;border-radius:99px;padding:3px 10px;font-size:12px;">− <span data-edit>thing</span></span>
        </div>
      </div>
    `),
  },
  {
    id: "mod-likes-boxes",
    name: "Likes & dislikes boxes",
    category: "Likes/Dislikes",
    html: one(`
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 2px;">
        <div style="flex:1 1 45%;min-width:140px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.35);border-radius:12px;padding:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#22c55e;margin-bottom:6px;">Likes ♡</div>
          <div style="line-height:1.9;font-size:14px;"><span data-edit>thing one</span><br><span data-edit>thing two</span><br><span data-edit>thing three</span></div>
        </div>
        <div style="flex:1 1 45%;min-width:140px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:12px;padding:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ef4444;margin-bottom:6px;">Dislikes ✕</div>
          <div style="line-height:1.9;font-size:14px;"><span data-edit>thing one</span><br><span data-edit>thing two</span><br><span data-edit>thing three</span></div>
        </div>
      </div>
    `),
  },
  {
    id: "mod-relationships",
    name: "Relationships list",
    category: "Relationships",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="${LABEL}margin-bottom:8px;">Relationships</div>
        <div style="border:1px solid hsl(var(--border));border-radius:12px;padding:10px 12px;margin-bottom:6px;"><span style="color:hsl(var(--primary));">💜</span> <strong><span data-edit>alter name</span></strong><div style="font-size:12px;color:hsl(var(--muted-foreground));margin-top:2px;"><span data-edit>how they relate — protective, tangled, complicated</span></div></div>
        <div style="border:1px solid hsl(var(--border));border-radius:12px;padding:10px 12px;margin-bottom:6px;"><span style="color:hsl(var(--primary));">💙</span> <strong><span data-edit>alter name</span></strong><div style="font-size:12px;color:hsl(var(--muted-foreground));margin-top:2px;"><span data-edit>how they relate</span></div></div>
        <div style="border:1px solid hsl(var(--border));border-radius:12px;padding:10px 12px;"><span style="color:hsl(var(--primary));">🩷</span> <strong><span data-edit>alter name</span></strong><div style="font-size:12px;color:hsl(var(--muted-foreground));margin-top:2px;"><span data-edit>how they relate</span></div></div>
      </div>
    `),
  },
  {
    id: "mod-roles-badges",
    name: "Role badges",
    category: "Role/Specialties",
    html: one(`
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;padding:8px 2px;">
        <div style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-radius:10px;padding:8px 14px;text-align:center;"><div style="font-size:9px;font-weight:700;letter-spacing:0.14em;opacity:0.85;">PRIMARY ROLE</div><div style="font-weight:800;letter-spacing:0.05em;"><span data-edit>PROTECTOR</span></div></div>
        <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:8px 14px;text-align:center;"><div style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:hsl(var(--muted-foreground));">ALSO</div><div style="font-weight:700;"><span data-edit>caretaker</span></div></div>
        <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:8px 14px;text-align:center;"><div style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:hsl(var(--muted-foreground));">ALSO</div><div style="font-weight:700;"><span data-edit>gatekeeper</span></div></div>
      </div>
    `),
  },
  {
    id: "mod-skills",
    name: "Skill bars",
    category: "Role/Specialties",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="${LABEL}margin-bottom:8px;">Specialties</div>
        <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;"><span style="width:96px;flex-shrink:0;"><span data-edit>skill name</span></span><span style="flex:1;height:8px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:85%;background:hsl(var(--primary));border-radius:99px;"></span></span></div>
        <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;"><span style="width:96px;flex-shrink:0;"><span data-edit>skill name</span></span><span style="flex:1;height:8px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:60%;background:hsl(var(--primary)/0.75);border-radius:99px;"></span></span></div>
        <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;"><span style="width:96px;flex-shrink:0;"><span data-edit>skill name</span></span><span style="flex:1;height:8px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:35%;background:hsl(var(--primary)/0.5);border-radius:99px;"></span></span></div>
      </div>
    `),
  },
  {
    id: "mod-triggers-needs",
    name: "Triggers & needs",
    category: "Triggers/Safety",
    html: one(`
      <div style="border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.05);border-radius:12px;padding:12px 14px;margin:8px 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ef4444;margin-bottom:6px;">⚠ Triggers & needs</div>
        <div style="line-height:1.9;font-size:14px;">
          <div>✕ <span data-edit>trigger or thing to avoid</span></div>
          <div>✕ <span data-edit>trigger or thing to avoid</span></div>
          <div style="margin-top:6px;">✔ <span data-edit>what helps when struggling</span></div>
          <div>✔ <span data-edit>what helps when struggling</span></div>
        </div>
      </div>
    `),
  },
  {
    id: "mod-how-to-interact",
    name: "How to interact",
    category: "Triggers/Safety",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="${LABEL}margin-bottom:8px;">How to interact</div>
        <div style="line-height:2;font-size:14px;">
          <div><span style="color:#22c55e;font-weight:700;">DO</span> — <span data-edit>something that is welcome or appreciated</span></div>
          <div><span style="color:#22c55e;font-weight:700;">DO</span> — <span data-edit>something that is welcome or appreciated</span></div>
          <div><span style="color:#ef4444;font-weight:700;">DON'T</span> — <span data-edit>something that is not okay</span></div>
          <div><span style="color:#ef4444;font-weight:700;">DON'T</span> — <span data-edit>something that is not okay</span></div>
        </div>
      </div>
    `),
  },
  {
    id: "mod-quote",
    name: "Quote",
    category: "Mood/Vibe",
    html: one(`
      <div style="text-align:center;padding:16px 10px;">
        <div style="font-size:26px;color:hsl(var(--primary));line-height:0.5;">❝</div>
        <p style="font-size:16px;font-style:italic;line-height:1.7;margin:8px 0 6px;"><span data-edit>a quote that feels like this alter — something they'd say or something said about them</span></p>
        <div style="font-size:12px;color:hsl(var(--muted-foreground));">— <span data-edit>attributed to</span></div>
      </div>
    `),
  },
  {
    id: "mod-emotional-stats",
    name: "Emotional stats",
    category: "Stats",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="${LABEL}margin-bottom:8px;">Emotional stats</div>
        <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;"><span style="width:88px;flex-shrink:0;"><span data-edit>empathy</span></span><span style="flex:1;height:8px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:90%;background:#ec4899;border-radius:99px;"></span></span></div>
        <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;"><span style="width:88px;flex-shrink:0;"><span data-edit>patience</span></span><span style="flex:1;height:8px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:55%;background:#38bdf8;border-radius:99px;"></span></span></div>
        <div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px;"><span style="width:88px;flex-shrink:0;"><span data-edit>chaos</span></span><span style="flex:1;height:8px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:70%;background:#f59e0b;border-radius:99px;"></span></span></div>
      </div>
    `),
  },
  {
    id: "mod-timeline",
    name: "Timeline",
    category: "Origin/History",
    html: one(`
      <div style="padding:8px 2px;">
        <div style="${LABEL}margin-bottom:8px;">Timeline</div>
        <div style="border-left:2px solid hsl(var(--primary)/0.4);padding-left:14px;">
          <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:hsl(var(--primary));"><span data-edit>year / age / era</span></div><div style="line-height:1.6;font-size:14px;"><span data-edit>something that happened — origin point, first appearance</span></div></div>
          <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:hsl(var(--primary));"><span data-edit>year / era</span></div><div style="line-height:1.6;font-size:14px;"><span data-edit>something that changed — a shift, a moment</span></div></div>
          <div><div style="font-size:11px;font-weight:700;color:hsl(var(--primary));">now</div><div style="line-height:1.6;font-size:14px;"><span data-edit>where they are today — current state</span></div></div>
        </div>
      </div>
    `),
  },
  {
    id: "mod-weather",
    name: "Inner weather panel",
    category: "Special",
    html: one(`
      <div style="background:linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--primary)/0.04));border:1px solid hsl(var(--primary)/0.3);border-radius:14px;padding:14px;margin:8px 0;">
        <div style="${LABEL}margin-bottom:6px;">Current conditions</div>
        <div style="font-size:18px;font-weight:700;">🌤 <span data-edit>mostly okay</span></div>
        <div style="font-size:12px;color:hsl(var(--muted-foreground));margin-top:2px;"><span data-edit>feels like: tired but not in danger</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
          <span style="border:1px solid hsl(var(--border));border-radius:99px;padding:2px 10px;font-size:12px;">🌫 <span data-edit>foggy</span></span>
          <span style="border:1px solid hsl(var(--border));border-radius:99px;padding:2px 10px;font-size:12px;">🌦 <span data-edit>clearing</span></span>
          <span style="border:1px solid hsl(var(--border));border-radius:99px;padding:2px 10px;font-size:12px;">🕯 <span data-edit>peaceful</span></span>
        </div>
      </div>
    `),
  },
  {
    id: "mod-divider-diamond",
    name: "Diamond divider",
    category: "Divider",
    html: one(`
      <div style="display:flex;align-items:center;gap:10px;padding:12px 2px;"><span style="flex:1;height:1px;background:hsl(var(--border));"></span><span style="color:hsl(var(--primary));font-size:12px;">◆</span><span style="flex:1;height:1px;background:hsl(var(--border));"></span></div>
    `),
  },
  {
    id: "mod-divider-wave",
    name: "Wavy divider",
    category: "Divider",
    html: one(`
      <div style="padding:6px 0;line-height:0;"><svg viewBox="0 0 400 18" preserveAspectRatio="none" style="width:100%;height:14px;display:block;"><path d="M0 9 Q 25 0, 50 9 T 100 9 T 150 9 T 200 9 T 250 9 T 300 9 T 350 9 T 400 9" fill="none" stroke="hsl(var(--primary))" stroke-opacity="0.5" stroke-width="2"/></svg></div>
    `),
  },
];

// ── Full-page templates ─────────────────────────────────────────────────────
export const BIO_TEMPLATES = [
  {
    id: "clean-lines",
    name: "Clean lines",
    vibe: "Minimal",
    blurb: "Quiet type-first layout that recolours with your theme.",
    html: one(`
      <div style="padding:4px 2px;">
        <div style="font-size:28px;font-weight:300;letter-spacing:0.06em;"><span data-edit>Name</span></div>
        <div style="font-size:13px;color:hsl(var(--muted-foreground));margin-top:2px;"><span data-edit>she/her</span> · <span data-edit>role in the system</span></div>
        <hr style="border:none;border-top:1px solid hsl(var(--border));margin:14px 0;">
        <div style="${LABEL}">About</div>
        <p style="margin:6px 0 14px;line-height:1.7;"><span data-edit>A few sentences about who I am, how I tend to show up, and what I care about.</span></p>
        <div style="${LABEL}">Likes</div>
        <p style="margin:6px 0 14px;line-height:1.7;"><span data-edit>Rain sounds, strong tea, long walks, quiet company.</span></p>
        <div style="${LABEL}">Please don't</div>
        <p style="margin:6px 0 0;line-height:1.7;"><span data-edit>Raise your voice, spring surprises, touch without asking.</span></p>
      </div>
    `),
  },
  {
    id: "info-cards",
    name: "Info cards",
    vibe: "Tidy",
    blurb: "At-a-glance stat cards over a longer about section.",
    html: one(`
      <div style="padding:2px;">
        <div style="font-size:24px;font-weight:800;margin-bottom:10px;"><span data-edit>Name</span> <span style="font-weight:400;font-size:14px;color:hsl(var(--muted-foreground));">· <span data-edit>alias</span></span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
          <div style="flex:1 1 40%;min-width:120px;background:hsl(var(--primary)/0.08);border:1px solid hsl(var(--primary)/0.25);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:hsl(var(--primary));">Pronouns</div><div style="font-weight:600;margin-top:2px;"><span data-edit>they/them</span></div></div>
          <div style="flex:1 1 40%;min-width:120px;background:hsl(var(--primary)/0.08);border:1px solid hsl(var(--primary)/0.25);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:hsl(var(--primary));">Role</div><div style="font-weight:600;margin-top:2px;"><span data-edit>Caretaker</span></div></div>
          <div style="flex:1 1 40%;min-width:120px;background:hsl(var(--primary)/0.08);border:1px solid hsl(var(--primary)/0.25);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:hsl(var(--primary));">Age</div><div style="font-weight:600;margin-top:2px;"><span data-edit>adult</span></div></div>
          <div style="flex:1 1 40%;min-width:120px;background:hsl(var(--primary)/0.08);border:1px solid hsl(var(--primary)/0.25);border-radius:12px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:hsl(var(--primary));">Vibe</div><div style="font-weight:600;margin-top:2px;"><span data-edit>calm · steady</span></div></div>
        </div>
        <p style="line-height:1.7;margin:0 0 10px;"><span data-edit>Longer introduction goes here — history, what fronting feels like, what helps.</span></p>
        <p style="font-size:13px;color:hsl(var(--muted-foreground));border-left:3px solid hsl(var(--primary));padding-left:10px;margin:0;"><span data-edit>"A short quote or motto that feels like me."</span></p>
      </div>
    `),
  },
  {
    id: "gradient-hero",
    name: "Gradient hero",
    vibe: "Bold",
    blurb: "Big theme-tinted banner with sections beneath.",
    html: one(`
      <div>
        <div style="background:linear-gradient(135deg,hsl(var(--primary)/0.85),hsl(var(--primary)/0.25));border-radius:16px;padding:26px 20px;color:white;text-shadow:0 1px 3px rgba(0,0,0,0.35);">
          <div style="font-size:30px;font-weight:800;line-height:1.1;"><span data-edit>Name</span></div>
          <div style="font-size:14px;opacity:0.95;margin-top:4px;"><span data-edit>pronouns · role · a few words that fit</span></div>
        </div>
        <div style="padding:16px 4px 0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="width:8px;height:8px;border-radius:99px;background:hsl(var(--primary));display:inline-block;"></span><span style="font-weight:700;">Who I am</span></div>
          <p style="line-height:1.7;margin:0 0 14px;"><span data-edit>Introduce yourself here — as much or as little as feels right.</span></p>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="width:8px;height:8px;border-radius:99px;background:hsl(var(--primary));display:inline-block;"></span><span style="font-weight:700;">Comforts</span></div>
          <p style="line-height:1.7;margin:0 0 14px;"><span data-edit>Weighted blanket, certain playlists, being near water.</span></p>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="width:8px;height:8px;border-radius:99px;background:hsl(var(--primary));display:inline-block;"></span><span style="font-weight:700;">Good to know</span></div>
          <p style="line-height:1.7;margin:0;"><span data-edit>Anything the rest of the system or trusted people should know.</span></p>
        </div>
      </div>
    `),
  },
  {
    id: "character-sheet",
    name: "Character sheet",
    vibe: "Playful",
    blurb: "RPG-style stat plate with bars, inventory, and a quest log.",
    html: one(`
      <div style="border:2px solid hsl(var(--border));border-radius:14px;padding:4px;">
        <div style="border:1px solid hsl(var(--border));border-radius:10px;padding:16px;">
          <div style="text-align:center;border-bottom:2px double hsl(var(--border));padding-bottom:10px;margin-bottom:12px;">
            <div style="font-size:24px;font-weight:800;letter-spacing:0.04em;"><span data-edit>NAME</span></div>
            <div style="font-family:monospace;font-size:12px;color:hsl(var(--muted-foreground));">Lv.&nbsp;<span data-edit>??</span> · <span data-edit>class: Protector</span> · <span data-edit>they/them</span></div>
          </div>
          <div style="font-family:monospace;font-size:13px;">
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;"><span style="width:74px;"><span data-edit>PATIENCE</span></span><span style="flex:1;height:10px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:80%;background:hsl(var(--primary));border-radius:99px;"></span></span></div>
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;"><span style="width:74px;"><span data-edit>CHAOS</span></span><span style="flex:1;height:10px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:35%;background:hsl(var(--primary));border-radius:99px;"></span></span></div>
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;"><span style="width:74px;"><span data-edit>SNARK</span></span><span style="flex:1;height:10px;background:hsl(var(--muted));border-radius:99px;overflow:hidden;display:inline-block;"><span style="display:block;height:100%;width:60%;background:hsl(var(--primary));border-radius:99px;"></span></span></div>
          </div>
          <div style="margin-top:12px;font-weight:700;font-size:13px;">🎒 Inventory</div>
          <p style="margin:4px 0 10px;line-height:1.7;font-size:14px;"><span data-edit>headphones · sketchbook · emergency chocolate · one (1) emotional support hoodie</span></p>
          <div style="font-weight:700;font-size:13px;">⚔️ Current quest</div>
          <p style="margin:4px 0 0;line-height:1.7;font-size:14px;"><span data-edit>Survive the week. Side quest: drink water.</span></p>
        </div>
      </div>
    `),
  },
  {
    id: "terminal",
    name: "Terminal",
    vibe: "Aesthetic",
    blurb: "Green-on-black console with a blinking cursor.",
    html: one(`
      <div style="background:#0d1117;border:1px solid #1f2937;border-radius:12px;padding:16px;font-family:'Cascadia Code','Fira Code',monospace;font-size:13px;color:#4ade80;line-height:1.8;">
        <style>@keyframes tpl-blink{0%,49%{opacity:1}50%,100%{opacity:0}}</style>
        <div style="color:#6b7280;">── session start ──</div>
        <div><span style="color:#22d3ee;">$</span> whoami</div>
        <div><span data-edit>name</span> <span style="color:#6b7280;">(<span data-edit>any pronouns</span>)</span></div>
        <div><span style="color:#22d3ee;">$</span> cat role.txt</div>
        <div><span data-edit>guardian process — keeps the system stable under load</span></div>
        <div><span style="color:#22d3ee;">$</span> cat notes.md</div>
        <div style="color:#a7f3d0;"><span data-edit>Write anything here. Multiple lines are fine — this is your space.</span></div>
        <div><span style="color:#22d3ee;">$</span> uptime</div>
        <div><span data-edit>here since ????</span> · fronts <span data-edit>sometimes</span></div>
        <div><span style="color:#22d3ee;">$</span>&nbsp;<span style="display:inline-block;width:8px;height:15px;background:#4ade80;vertical-align:text-bottom;animation:tpl-blink 1.1s steps(1) infinite;"></span></div>
      </div>
    `),
  },
  {
    id: "neon",
    name: "Neon glow",
    vibe: "Animated",
    blurb: "Dark card, drifting cyan–magenta gradient, pulsing frame.",
    html: one(`
      <div style="background:#0b0b14;border-radius:16px;padding:22px 18px;animation:tpl-neon-pulse 3s ease-in-out infinite;">
        <style>
          @keyframes tpl-neon-slide{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
          @keyframes tpl-neon-pulse{0%,100%{box-shadow:0 0 10px rgba(34,211,238,0.35),inset 0 0 24px rgba(217,70,239,0.08)}50%{box-shadow:0 0 26px rgba(217,70,239,0.45),inset 0 0 24px rgba(34,211,238,0.10)}}
        </style>
        <div style="font-size:30px;font-weight:900;letter-spacing:0.03em;background:linear-gradient(90deg,#22d3ee,#d946ef,#22d3ee);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:tpl-neon-slide 5s ease infinite;"><span data-edit>NAME</span></div>
        <div style="color:#94a3b8;font-size:13px;margin-top:2px;letter-spacing:0.14em;text-transform:uppercase;"><span data-edit>pronouns</span> // <span data-edit>role</span></div>
        <div style="height:1px;background:linear-gradient(90deg,transparent,#22d3ee,#d946ef,transparent);margin:14px 0;"></div>
        <p style="color:#e2e8f0;line-height:1.75;margin:0 0 12px;"><span data-edit>Loud on the outside, careful on the inside. Write your intro here.</span></p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span style="border:1px solid #22d3ee;color:#22d3ee;border-radius:99px;padding:3px 10px;font-size:12px;"><span data-edit>tag one</span></span>
          <span style="border:1px solid #d946ef;color:#d946ef;border-radius:99px;padding:3px 10px;font-size:12px;"><span data-edit>tag two</span></span>
          <span style="border:1px solid #818cf8;color:#818cf8;border-radius:99px;padding:3px 10px;font-size:12px;"><span data-edit>tag three</span></span>
        </div>
      </div>
    `),
  },
  {
    id: "soft-journal",
    name: "Soft journal",
    vibe: "Cosy",
    blurb: "Warm paper page with pastel sticky-note sections.",
    html: one(`
      <div style="background:#fdf6ee;color:#4a3b32;border-radius:16px;padding:20px 18px;border:1px solid #ead9c6;">
        <div style="font-size:26px;font-weight:700;font-family:Georgia,'Times New Roman',serif;"><span data-edit>Name</span> <span style="font-size:16px;">🌿</span></div>
        <div style="font-size:13px;color:#8a7361;margin-top:2px;font-style:italic;"><span data-edit>pronouns · little/middle/adult · anything else</span></div>
        <div style="background:#fff3d6;border:1px dashed #d9b98a;border-radius:4px 14px 4px 14px;padding:12px 14px;margin:14px 0 10px;transform:rotate(-0.5deg);">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#a3865e;">about me</div>
          <p style="margin:4px 0 0;line-height:1.7;"><span data-edit>Soft introduction here — whatever you'd write on the first page of a journal.</span></p>
        </div>
        <div style="background:#e8f4e4;border:1px dashed #a9c9a0;border-radius:14px 4px 14px 4px;padding:12px 14px;margin:0 0 10px;transform:rotate(0.4deg);">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6d9060;">happy things</div>
          <p style="margin:4px 0 0;line-height:1.7;">🧸 <span data-edit>plushies</span> · 🍓 <span data-edit>sweet snacks</span> · 🎨 <span data-edit>drawing</span> · ☁️ <span data-edit>naps</span></p>
        </div>
        <div style="background:#fbe4e4;border:1px dashed #d9a1a1;border-radius:4px 14px 4px 14px;padding:12px 14px;transform:rotate(-0.3deg);">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#b06a6a;">please be gentle about</div>
          <p style="margin:4px 0 0;line-height:1.7;"><span data-edit>Loud noises, being rushed, talking about the past without warning.</span></p>
        </div>
      </div>
    `),
  },
  {
    id: "night-sky",
    name: "Night sky",
    vibe: "Animated",
    blurb: "Twinkling stars over a deep-blue night, with a hidden secret line.",
    html: one(`
      <div style="position:relative;overflow:hidden;background:linear-gradient(180deg,#0b1026 0%,#1a2151 70%,#2b2a5e 100%);border-radius:16px;padding:26px 20px;color:#e6e9ff;">
        <style>
          @keyframes tpl-twinkle{0%,100%{opacity:0.25;transform:scale(0.8)}50%{opacity:1;transform:scale(1.15)}}
          @keyframes tpl-drift{0%{transform:translateY(0)}50%{transform:translateY(-4px)}100%{transform:translateY(0)}}
        </style>
        <span style="position:absolute;top:14px;left:12%;width:3px;height:3px;border-radius:99px;background:#fff;animation:tpl-twinkle 2.4s ease-in-out infinite;"></span>
        <span style="position:absolute;top:30px;left:78%;width:2px;height:2px;border-radius:99px;background:#cdd6ff;animation:tpl-twinkle 3.1s ease-in-out 0.6s infinite;"></span>
        <span style="position:absolute;top:56px;left:40%;width:2px;height:2px;border-radius:99px;background:#fff;animation:tpl-twinkle 2.8s ease-in-out 1.1s infinite;"></span>
        <span style="position:absolute;top:20px;left:55%;width:3px;height:3px;border-radius:99px;background:#ffe9c9;animation:tpl-twinkle 3.6s ease-in-out 0.3s infinite;"></span>
        <span style="position:absolute;bottom:26px;left:20%;width:2px;height:2px;border-radius:99px;background:#cdd6ff;animation:tpl-twinkle 2.2s ease-in-out 0.9s infinite;"></span>
        <span style="position:absolute;bottom:40px;right:12%;width:3px;height:3px;border-radius:99px;background:#fff;animation:tpl-twinkle 3.3s ease-in-out 1.4s infinite;"></span>
        <div style="animation:tpl-drift 6s ease-in-out infinite;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;">🌙 <span data-edit>Name</span></div>
          <div style="font-size:13px;color:#aab3e8;margin-top:2px;letter-spacing:0.08em;"><span data-edit>pronouns · night-shift keeper of the system</span></div>
        </div>
        <p style="line-height:1.8;margin:16px 0 10px;color:#dfe4ff;"><span data-edit>I come out when things go quiet. Write your story here — the sky has room for all of it.</span></p>
        <p style="line-height:1.8;margin:0;font-size:14px;color:#aab3e8;">A secret, for those who tap: ||<span data-edit>write something hidden here</span>||</p>
      </div>
    `),
  },
];

export const MODULE_CATEGORIES = [...new Set(BIO_MODULES.map((m) => m.category))];
