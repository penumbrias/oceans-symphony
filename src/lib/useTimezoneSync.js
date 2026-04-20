import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { detectTimezone } from '@/lib/timezoneHelpers';

/**
 * Hook that auto-detects and syncs user's timezone on first load.
 * Runs silently in the background.
 */
export function useTimezoneSync() {
  useEffect(() => {
    const syncTimezone = async () => {
      try {
        const settings = await base44.entities.SystemSettings.list();
        const setting = settings?.[0];

        // If timezone not set, detect and save
        if (!setting?.timezone) {
          const detected = detectTimezone();
          if (setting) {
            await base44.entities.SystemSettings.update(setting.id, { timezone: detected });
          } else {
            // Create settings if doesn't exist
            await base44.entities.SystemSettings.create({ timezone: detected });
          }
        }
      } catch (err) {
        // Silently fail if sync doesn't work
        console.debug('[useTimezoneSync] Timezone sync skipped:', err.message);
      }
    };

    syncTimezone();
  }, []);
}