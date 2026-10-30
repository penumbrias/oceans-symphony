// The Privacy & Data Notice, as its own Settings page (v0.320.0). The
// text is the one the collapsible banner at the top of Settings carried.
import React from "react";
import WhatLeavesDevice from "@/components/shared/WhatLeavesDevice";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { useTerms } from "@/lib/useTerms";

export default function PrivacyNotice() {
  const terms = useTerms();
  return (
  <div className="space-y-3 text-sm text-muted-foreground">
    <div className="space-y-1">
      <p className="font-medium text-foreground">🔒 Local Storage</p>
      <p>Oceans Symphony is private by design: <strong>by default, your data stays on this device only</strong>. Nothing is uploaded or synced; there is no account. Records live in this browser's IndexedDB, and the only ways anything leaves are the opt-in items listed below. By default, those records are stored <strong>unencrypted</strong> — anyone with access to this unlocked device could read them. (Android's own cloud backup is disabled for this app, so they don't end up in a Google backup.) For an extra layer of security, enable password encryption under <em>Storage &amp; encryption</em>: this adds <strong>on-device encryption at rest</strong> (AES-256-GCM), where the data is encrypted with a key derived from your password and only decrypted in memory while the app is open. <strong>It is not end-to-end encrypted</strong> — the protection is between this device's storage and the running app, nothing more. <strong>If you lose your encryption password, the data cannot be recovered.</strong></p>
    </div>
    <div className="space-y-1">
      <p className="font-medium text-foreground">🌐 What can leave this device (all opt-in)</p>
      <WhatLeavesDevice />
    </div>
    <div className="space-y-1">
      <p className="font-medium text-foreground">💾 Backups</p>
      <p>Use Export under Data &amp; privacy to save your data as a file. Manual exports are <strong>plain files</strong> whatever your storage mode — store them somewhere safe. Automatic backups can be <strong>password-locked</strong> and given a plain file name (Export → Automatic backups). (The raw copy the recovery screen saves stays encrypted if your data was.) Automatic backups cover your active {terms.system} only and skip very large images; the health line there says when one was partial.</p>
    </div>
    <div className="space-y-1">
      <p className="font-medium text-foreground">🤖 Transparency</p>
      <p>Oceans Symphony is <strong>vibe-coded</strong> — built with AI assistance — and is in <strong>active development</strong>. It is a work in progress shared in good faith; bugs are likely. We do our best but cannot guarantee it is bug-free.</p>
    </div>
    <p className="text-amber-600 dark:text-amber-400 font-medium">
      🌊 Free and open source, shared by a DID system to fill a void in the community. Contact: pesturedrawing@gmail.com.{" "}
      <span onClick={() => openExternalUrl("https://github.com/penumbrias/oceans-symphony/releases")}
        className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
    </p>
  </div>
  );
}
