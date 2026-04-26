import { useState, useEffect } from 'react';
import { resolveImageUrl } from '@/lib/imageUrlResolver';

export function useResolvedAvatarUrl(avatarUrl) {
  const [resolvedUrl, setResolvedUrl] = useState(() => {
    // /local-image/ URLs are served by the SW — no async resolution needed
    if (avatarUrl?.startsWith('/local-image/')) return avatarUrl;
    return null;
  });

  useEffect(() => {
    if (!avatarUrl) { setResolvedUrl(null); return; }

    // Fast path: SW handles these synchronously
    if (avatarUrl.startsWith('/local-image/')) {
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
