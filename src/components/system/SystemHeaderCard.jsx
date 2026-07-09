import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";

// The system's identity header at the top of the alters directory (/Home):
// avatar, name, and a collapsible rich bio. The banner image itself is now
// a full-bleed backdrop rendered by AppLayout (SystemBanner) sitting behind
// this, so the name/avatar overlay it — hence the soft text-shadow on the
// name for legibility over the image. Degrades to just the name when
// nothing is configured.
export default function SystemHeaderCard({ settings, action = null }) {
  const t = useTerms();
  const name = settings?.system_name || `Your ${t.System}`;
  const bio = settings?.system_bio || settings?.system_description || "";
  const avatar = useResolvedAvatarUrl(settings?.system_avatar_url);
  const [showBio, setShowBio] = useState(false);

  const bioBlocks = bio ? htmlToBlocks(bio) : [];
  const hasBio = bioBlocks.length > 0;

  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {avatar && (
            <img
              src={avatar}
              alt=""
              draggable={false}
              className="w-12 h-12 rounded-full object-cover border border-white/40 shadow flex-shrink-0"
            />
          )}
          <h1
            className="font-display text-3xl font-semibold text-foreground truncate"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.45)" }}
          >
            {name}
          </h1>
        </div>
        {action}
      </div>

      {hasBio && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowBio((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
          >
            {showBio ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showBio ? "Hide" : "About this"} {t.system}
          </button>
          {showBio && (
            <div className="mt-2 bg-muted/20 rounded-xl p-4 border border-border/40">
              <SimplePreview blocks={bioBlocks} onBlockChange={() => {}} readOnly={true} scopeId="system-bio" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
