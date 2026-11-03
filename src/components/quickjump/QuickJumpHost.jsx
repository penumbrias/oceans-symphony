// Mounted once in AppLayout. Three jobs for the quick jump
// (src/lib/quickJump.js):
//   - shows the full-screen picture when the jump's target is a picture
//   - keeps the gate: with "Lock behind it" on, moving off the page the
//     jump opened locks the app
//   - remembers the page the person was on before Settings, so the
//     settings page can offer "the page you were just on"
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import {
  readGate, clearGate, pathOnly, lockNow, lockActive, rememberLastPage,
} from "@/lib/quickJump";

function JumpPicture({ url, onClose }) {
  const resolved = useResolvedAvatarUrl(url);
  return (
    <div className="fixed inset-0 z-[10000] bg-black flex items-center justify-center"
      style={{ pointerEvents: "auto", touchAction: "manipulation" }}>
      {resolved && <img src={resolved} alt="" className="w-full h-full object-cover" />}
      <button type="button" onClick={onClose} aria-label="Close"
        className="absolute right-3 w-9 h-9 rounded-full bg-black/30 text-white/70 hover:text-white flex items-center justify-center"
        style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function QuickJumpHost() {
  const location = useLocation();
  const [picture, setPicture] = useState(null);

  useEffect(() => {
    const open = (e) => { if (e?.detail?.url) setPicture(e.detail.url); };
    window.addEventListener("os-quick-jump-image", open);
    return () => window.removeEventListener("os-quick-jump-image", open);
  }, []);

  useEffect(() => {
    rememberLastPage(location);
    const gate = readGate();
    if (!gate) return;
    if (!lockActive()) { clearGate(); return; }
    if (pathOnly(location.pathname) !== pathOnly(gate)) lockNow();
  }, [location.pathname, location.search]);

  if (!picture) return null;
  return (
    <JumpPicture url={picture} onClose={() => {
      if (lockActive()) { lockNow(); return; }
      setPicture(null);
    }} />
  );
}
