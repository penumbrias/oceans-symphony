import { useState, useEffect } from 'react';
import { resolveImageUrl, swServesLocalImages } from '@/lib/imageUrlResolver';

export function useResolvedAvatarUrl(avatarUrl) {
  const [resolvedUrl, setResolvedUrl] = useState(() => {
    // /local-image/ URLs need no async resolution when a SW controls the
    // page. Without one (iOS native — WKWebView has no SW), fall through
    // to the async IDB path below or the <img> hits a 404.
    if (avatarUrl?.startsWith('/local-image/') && swServesLocalImages()) return avatarUrl;
    return null;
  });

  useEffect(() => {
    if (!avatarUrl) { setResolvedUrl(null); return; }

    // Fast path: SW serves these — no IDB roundtrip needed
    if (avatarUrl.startsWith('/local-image/') && swServesLocalImages()) {
      setResolvedUrl(avatarUrl);
      return;
    }

    let cancelled = false;
    resolveImageUrl(avatarUrl)
      .then((url) => { if (!cancelled) setResolvedUrl(url); })
      .catch(() => { if (!cancelled) setResolvedUrl(null); });
    return () => { cancelled = true; };
  }, [avatarUrl]);

  return resolvedUrl;
}
