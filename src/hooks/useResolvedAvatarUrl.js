import { useState, useEffect } from 'react';
import { resolveImageUrl } from '@/lib/imageUrlResolver';

/**
 * Hook to resolve avatar URLs (local or external)
 * Returns the resolved image source (data URL or external URL)
 */
export function useResolvedAvatarUrl(avatarUrl) {
  const [resolvedUrl, setResolvedUrl] = useState(null);

  useEffect(() => {
    if (!avatarUrl) {
      setResolvedUrl(null);
      return;
    }

    resolveImageUrl(avatarUrl).then(url => {
      setResolvedUrl(url);
    }).catch(() => {
      setResolvedUrl(null);
    });
  }, [avatarUrl]);

  return resolvedUrl;
}