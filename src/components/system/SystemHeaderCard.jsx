import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import SimplePreview from "@/components/shared/SimplePreview";
import { htmlToBlocks } from "@/components/shared/BlockEditor";

// The system's own profile header, shown at the top of the alters
// directory (/Home). Mirrors an alter profile: optional banner image,
// avatar, name, short description (tagline), and a collapsible rich bio.
// Everything is optional — with nothing configured it degrades to just
// the name, exactly like the old header. The `action` slot holds the
// "Add {alter}" button so it sits inside the header (over the banner
// when one is set).
export default function SystemHeaderCard({ settings, action = null }) {
  const t = useTerms();
  const name = settings?.system_name || `Your ${t.System}`;
  const description = settings?.system_description || "";
  const bio = settings?.system_bio || "";
  const avatar = useResolvedAvatarUrl(settings?.system_avatar_url);
  const banner = useResolvedAvatarUrl(settings?.system_banner_url);
  const [showBio, setShowBio] = useState(false);

  const bioBlocks = bio ? htmlToBlocks(bio) : [];
  const hasBio = bioBlocks.length > 0;

  const bioToggle = hasBio ? (
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
          <SimplePreview blocks={bioBlocks} onBlockChange={() => {}} readOnly={true} />
        </div>
      )}
    </div>
  ) : null;

  if (banner) {
    return (
      <div className="mb-4">
        <div className="relative rounded-2xl overflow-hidden border border-border/50">
          <div className="aspect-[3/1] w-full">
            <img src={banner} alt="" className="w-full h-full object-cover" draggable={false} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
          {action && <div className="absolute top-3 right-3 z-10">{action}</div>}
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end gap-3">
            {avatar && (
              <img src={avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white/70 flex-shrink-0" draggable={false} />
            )}
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold text-white drop-shadow truncate">{name}</h1>
              {description && <p className="text-sm text-white/85 drop-shadow line-clamp-2">{description}</p>}
            </div>
          </div>
        </div>
        {bioToggle}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {avatar && (
            <img src={avatar} alt="" className="w-12 h-12 rounded-full object-cover border border-border/50 flex-shrink-0" draggable={false} />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold text-foreground truncate">{name}</h1>
            {description && <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {bioToggle}
    </div>
  );
}
