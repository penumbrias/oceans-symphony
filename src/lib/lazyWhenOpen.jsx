// Load a heavy sheet or modal only when it is first opened (new house step
// 0.3). Until then nothing of it is downloaded or drawn. Once opened it stays
// mounted, exactly as before, so its own state (a half-filled check-in, an
// open picker) behaves the same as when it was imported up front.
import React, { useState } from "react";

export function lazyWhenOpen(load, isOpen) {
  const Lazy = React.lazy(load);
  function LazyWhenOpen(props) {
    const open = !!isOpen(props);
    const [ever, setEver] = useState(open);
    if (open && !ever) setEver(true);
    if (!ever && !open) return null;
    return (
      <React.Suspense fallback={null}>
        <Lazy {...props} />
      </React.Suspense>
    );
  }
  return LazyWhenOpen;
}
