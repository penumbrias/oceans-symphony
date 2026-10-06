import { useState, useEffect } from 'react';
import { resolveImageUrl, peekResolvedImageUrl } from '@/lib/imageUrlResolver';
import { isLocalImageUrl, getLocalImageId } from '@/lib/localImageStorage';

// When a picture stored on this device can't be read yet (IDB busy or
// closed right after the app opens, a picture still being put back from
// the app's own saved copy), try again on this schedule instead of
// leaving the spot blank until the app restarts (v0.251.2).
const RETRY_DELAYS_MS = [1000, 3000, 8000, 20000];

export function useResolvedAvatarUrl(avatarUrl) {
  const [resolvedUrl, setResolvedUrl] = useState(() => peekResolvedImageUrl(avatarUrl) || null);

  useEffect(() => {
    if (!avatarUrl) { setResolvedUrl(null); return; }

    const cached = peekResolvedImageUrl(avatarUrl);
    if (cached) { setResolvedUrl(cached); return; }

    let cancelled = false;
    let gotIt = false;
    let retryTimer = null;
    let attempt = 0;
    const isLocal = typeof avatarUrl === 'string' && isLocalImageUrl(avatarUrl);

    const run = () => resolveImageUrl(avatarUrl)
      .then((url) => {
        if (cancelled) return;
        setResolvedUrl(url);
        gotIt = !!url;
        if (!url && isLocal) scheduleRetry();
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedUrl(null);
        if (isLocal) scheduleRetry();
      });

    function scheduleRetry() {
      if (retryTimer || attempt >= RETRY_DELAYS_MS.length) return;
      retryTimer = setTimeout(() => { retryTimer = null; run(); }, RETRY_DELAYS_MS[attempt++]);
    }

    run();

    // A local picture that drew a blank tries again when it lands on the
    // device and when the app comes back to the foreground.
    const imageId = isLocal ? getLocalImageId(avatarUrl) : null;
    const onSaved = (e) => { if (!gotIt && e?.detail?.id === imageId) run(); };
    const onVisible = () => { if (!gotIt && document.visibilityState === 'visible') run(); };
    if (isLocal) {
      window.addEventListener('symphony-local-image-saved', onSaved);
      document.addEventListener('visibilitychange', onVisible);
    }

    // folder:// sources that change on their own (hourly / daily / weekday
    // / fronter) re-resolve every minute and when the front changes.
    let timer = null;
    const live = typeof avatarUrl === 'string' && avatarUrl.startsWith('folder://') && /mode=(hourly|daily|weekday|fronter)/.test(avatarUrl);
    if (live) {
      timer = setInterval(run, 60000);
      window.addEventListener('symphony-front-changed', run);
    }
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (timer) clearInterval(timer);
      if (live) window.removeEventListener('symphony-front-changed', run);
      if (isLocal) {
        window.removeEventListener('symphony-local-image-saved', onSaved);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [avatarUrl]);

  return resolvedUrl;
}
