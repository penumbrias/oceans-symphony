import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import AppLayout from '@/components/layout/AppLayout';
import Privacy from '@/pages/Privacy';
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import { Navigate } from 'react-router-dom';
import AlterProfile from '@/pages/AlterProfile';
import Settings from '@/pages/Settings';

import Analytics from '@/pages/Analytics';
import Journals from '@/pages/Journals';
import DiaryCards from '@/pages/DiaryCards';
import DailyTasks from '@/pages/DailyTasks.jsx';
import GroupsManager from '@/pages/GroupsManager';
import GroupProfile from '@/pages/GroupProfile';
import LocationProfile from '@/pages/LocationProfile';
import AssetsLibrary from '@/pages/AssetsLibrary';
import SystemCheckIn from '@/pages/SystemCheckIn';
import ActivityTracker from '@/pages/ActivityTracker';
import SleepTracker from '@/pages/SleepTracker';
import ToDoList from '@/pages/ToDoList';
import Timeline from '@/pages/Timeline.jsx';

import SystemMapPage from '@/pages/SystemMap';
import Grounding from '@/pages/Grounding';
import SafetyPlan from '@/pages/SafetyPlan';
import BulletinPage from '@/pages/BulletinPage';
import BulletinsPage from '@/pages/BulletinsPage';
import HelpMeUnblend from '@/pages/HelpMeUnblend';
import GetToKnowMe from '@/pages/GetToKnowMe';
import Chat from '@/pages/Chat';
import UnblendQuestionsManager from '@/pages/UnblendQuestionsManager';
import ManageCheckIn from '@/pages/ManageCheckIn';
import TherapyReport from '@/pages/TherapyReport';
import Reminders from '@/pages/Reminders';
import Polls from '@/pages/Polls.jsx';
import CheckInLog from '@/pages/CheckInLog';
import SystemHistory from '@/pages/SystemHistory';
import LocationHistory from '@/pages/LocationHistory';
import FriendsPage from '@/pages/Friends';
import { setEncryptionEnabled, setEncSalt } from '@/lib/storageMode';
import StorageModeSetup from '@/components/onboarding/StorageModeSetup';
import AccessibilityFab from '@/components/accessibility/AccessibilityFab';

// First run: the welcome intro and the storage-setup screen are now a single
// combined screen (StorageModeSetup renders the welcome copy above the storage
// choice in "setup" mode).
import { initAccessibility } from '@/lib/useAccessibility';

// Apply saved accessibility settings before first render
initAccessibility();
import {
  isDbInitialized,
  initLocalDb,
  migrateBase64AvatarsToLocal,
  migrateLocalImageUrlScheme,
  peekStoredData,
  EncryptedDataWithoutKeyError,
} from '@/lib/localDb';
import { requestPersistentStorage, runAutoBackupIfDue } from '@/lib/autoBackup';
import { initNativeShell, subscribeToNativeTap, pendingNativeTap, subscribeToNativeRoute, pendingNativeRoute } from '@/lib/nativeBootstrap';
import { useNativeReminderSync } from '@/lib/nativeReminderScheduler';
import { useServerReminderSync } from '@/lib/serverReminderSync';
import { usePlanReminderSync } from '@/lib/planReminderScheduler';
import { useNativeQuickActionsSync } from '@/lib/nativeQuickActions';
import { useFriendsFrontChangeNotifications } from '@/lib/useFriendsFrontNotifications';
import { useNavigate } from 'react-router-dom';
import { restorePreviewIfActive, isPreviewActive } from '@/lib/previewMode';
import { cleanupBrokenSessionsOnce } from '@/lib/frontingUtils';
import { cleanupLegacyCardEntryOnce } from '@/lib/dailyTaskSystem';
import { base44 } from '@/api/base44Client';
import { useTimezoneSync } from '@/lib/useTimezoneSync';
import UnlockScreen from '@/components/onboarding/UnlockScreen';
import RecoveryScreen from '@/components/onboarding/RecoveryScreen';
import GroceryListPanel from '@/components/grocery/GroceryListPanel';
import { CornerModeApplier } from '@/lib/useCornerMode';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();
  useTimezoneSync();
  // Re-syncs the native pre-scheduled reminder queue whenever reminders
  // or settings change. No-op on web/TWA.
  useNativeReminderSync();
  // Mirrors upcoming Activity plans onto the OS notification queue
  // (native) or a best-effort setTimeout queue (web) so the user gets
  // an alert before each plan starts. Guarded by the user-facing
  // "Remind me before upcoming plans" toggle in Settings → Reminders.
  usePlanReminderSync();
  // Mirrors the user's QuickAction list onto the OS launcher's
  // long-press shortcut menu via ShortcutManager. No-op on web/TWA.
  useNativeQuickActionsSync();
  // (TwaToNativeMigrationModal moved into the onboarding flow —
  // src/components/onboarding/StorageModeSetup.jsx → FirstRunSetup
  // — so it shows at the right moment for users coming from a
  // Play auto-update, not after they've already completed setup.)
  // Native-only fallback for friend-front-change push notifications —
  // the Web Push pipeline doesn't reach a Capacitor WebView, so we
  // poll client-side and fire LocalNotifications on change. No-op
  // on web/TWA (Web Push handles it there).
  useFriendsFrontChangeNotifications();
  // Mirror upcoming reminder fire-times to the relay so a per-minute cron
  // can push them via FCM / Web Push even when the app is fully closed /
  // swiped away (OS alarms get cancelled on force-stop). Runs on all
  // platforms; no-ops without a Friends identity + push enabled.
  useServerReminderSync();
  // When the user taps a native OS notification we route to the
  // reminders inbox; the actual ReminderInstance was already recorded
  // by the bootstrap listener.
  const navigate = useNavigate();
  useEffect(() => {
    const consume = () => {
      if (!pendingNativeTap.reminderId) return;
      pendingNativeTap.reminderId = null;
      pendingNativeTap.scheduledFor = null;
      navigate('/reminders');
    };
    consume();
    return subscribeToNativeTap(consume);
  }, [navigate]);

  // When the user taps an OS launcher shortcut while the app is warm
  // (already running), nativeBootstrap captures the appUrlOpen event
  // and stashes the in-app route here. Drain on subscribe so a tap
  // that landed before the listener mounted still navigates.
  useEffect(() => {
    const consume = () => {
      const target = pendingNativeRoute.target;
      if (!target) return;
      pendingNativeRoute.target = null;
      navigate(target);
    };
    consume();
    return subscribeToNativeRoute(consume);
  }, [navigate]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm font-medium">Loading Symphony...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CornerModeApplier />
      <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/Dashboard" element={<Navigate to="/" replace />} />
        <Route path="/Home" element={<Home />} />
        <Route path="/alter/:id" element={<AlterProfile />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="/analytics" element={<Analytics />} />
        <Route path="/journals" element={<Journals />} />
        {/* /diary (Daily Log) is deprecated — redirect to the Check-In Log */}
        <Route path="/diary" element={<Navigate to="/checkin-log" replace />} />
        <Route path="/tasks" element={<DailyTasks />} />
        <Route path="/todo" element={<ToDoList />} />
        <Route path="/groups" element={<GroupsManager />} />
        <Route path="/group/:id" element={<GroupProfile />} />
        <Route path="/location/:id" element={<LocationProfile />} />
        <Route path="/assets" element={<AssetsLibrary />} />
        <Route path="/system-checkin" element={<SystemCheckIn />} />
        <Route path="/activities" element={<ActivityTracker />} />
        <Route path="/sleep" element={<SleepTracker />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/system-map" element={<SystemMapPage />} />
        <Route path="/bulletin/:id" element={<BulletinPage />} />
        <Route path="/bulletins" element={<BulletinsPage />} />
        <Route path="/unblend" element={<HelpMeUnblend />} />
        <Route path="/get-to-know-me" element={<GetToKnowMe />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/unblend/questions" element={<UnblendQuestionsManager />} />
        <Route path="/manage-checkin" element={<ManageCheckIn />} />
        <Route path="/grounding" element={<Grounding />} />
        <Route path="/safety-plan" element={<SafetyPlan />} />
        <Route path="/therapy-report" element={<TherapyReport />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/polls" element={<Polls />} />
        <Route path="/checkin-log" element={<CheckInLog />} />
        <Route path="/system-history" element={<SystemHistory />} />
        <Route path="/location-history" element={<LocationHistory />} />
        <Route path="/friends" element={<FriendsPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};


function App() {
  // Privacy page is always accessible — bypass all setup/unlock state.
  // QueryClientProvider is required because <Privacy> uses useTerms() → useQuery().
  if (window.location.pathname === '/privacy') {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <Routes>
              <Route path="/privacy" element={<Privacy />} />
            </Routes>
          </Router>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  // Boot states:
  //   'booting'  → initial: peek storage, decide route
  //   'firstrun' → no data anywhere; show setup
  //   'unlock'   → encrypted data exists; prompt for password
  //   'recovery' → data exists but unreadable (corrupted, IDB error,
  //                missing salt, etc.) → show RecoveryScreen instead of
  //                silently wiping or treating the user as new
  //   null       → DB ready
  const [setupState, setSetupState] = useState('booting');
  const [recoveryReason, setRecoveryReason] = useState(null);

  // Boot sequence: persist storage FIRST (so the browser stops marking us
  // for eviction before any further work), then peek at IndexedDB to
  // decide whether the user is new, needs unlock, needs recovery, or has
  // plain data ready to load. NEVER trust localStorage alone to decide
  // "first run" — Android cleaners can wipe it while IDB survives, and
  // re-running setup against existing IDB data was the path that wiped
  // user data overnight.
  useEffect(() => {
    if (setupState !== 'booting') return;
    let cancelled = false;
    (async () => {
      // No-op on web/TWA. On native, pushes the WebView below the status
      // bar so the app header doesn't overlap the system clock/icons.
      try { await initNativeShell(); } catch { /* non-fatal */ }

      // Best-effort, but call it before anything that depends on storage.
      try { await requestPersistentStorage(); } catch { /* non-fatal */ }

      let peek;
      try {
        peek = await peekStoredData();
      } catch (e) {
        if (cancelled) return;
        setRecoveryReason({ kind: 'read_error', error: e });
        setSetupState('recovery');
        return;
      }
      if (cancelled) return;

      if (!peek.exists) {
        setSetupState('firstrun');
        return;
      }

      if (peek.corrupted) {
        setRecoveryReason({ kind: 'corrupted' });
        setSetupState('recovery');
        return;
      }

      if (peek.encrypted) {
        // Restore localStorage flags so the rest of the app and the
        // unlock screen behave consistently — these were the bits that
        // Android cleaners had wiped, sending users into the firstrun
        // wipe path.
        setEncryptionEnabled(true);
        if (peek.salt) setEncSalt(peek.salt);
        setSetupState('unlock');
        return;
      }

      // Plain data exists — load it.
      try {
        await initLocalDb(null);
        await restorePreviewIfActive();
        if (cancelled) return;
        if (!isPreviewActive()) {
          cleanupBrokenSessionsOnce(base44.entities);
          cleanupLegacyCardEntryOnce(base44.entities);
        }
        setSetupState(null);
      } catch (e) {
        if (cancelled) return;
        // Surface init failures instead of swallowing them and letting
        // the app render against a half-initialised DB.
        if (e instanceof EncryptedDataWithoutKeyError) {
          setEncryptionEnabled(true);
          setSetupState('unlock');
        } else {
          setRecoveryReason({ kind: 'init_failed', error: e });
          setSetupState('recovery');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setupState]);

  useEffect(() => {
    if (setupState === null && isDbInitialized()) {
      migrateBase64AvatarsToLocal().catch(() => {});
      // Rewrite legacy local-image:// URLs to /local-image/ so the SW can serve them
      migrateLocalImageUrlScheme().catch(() => {});
      // Skip auto-backup while preview mode is active — preview's
      // in-memory snapshot is not the user's real data, exporting it
      // would overwrite their last real backup file with junk.
      if (!isPreviewActive()) {
        runAutoBackupIfDue().catch(() => {});
      }
    }
  }, [setupState]);

  if (setupState === 'booting') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (setupState === 'firstrun') {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <StorageModeSetup mode="setup" onComplete={() => setSetupState(null)} />
          {/* Accessibility quick-access available from the very first screen,
              before Settings is reachable. Writes localStorage-backed prefs
              that apply instantly. */}
          <AccessibilityFab />
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  if (setupState === 'unlock') {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <UnlockScreen
            onUnlock={() => setSetupState(null)}
            onNeedRecovery={(reason) => {
              setRecoveryReason(reason || { kind: 'unlock_failed' });
              setSetupState('recovery');
            }}
          />
          {/* Mount the panel here so the user can pop their always-
              unlocked grocery lists without going through the unlock
              challenge. lockedMode hides every encrypted list.
              GroceryListPanel uses react-query — so it (and any future
              tenant of these early-boot branches) needs the provider
              wrapped here, not just on the main-app return below. */}
          <GroceryListPanel lockedMode />
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  if (setupState === 'recovery') {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <RecoveryScreen
            reason={recoveryReason}
            onResolved={() => {
              setRecoveryReason(null);
              setSetupState('booting');
            }}
          />
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClientInstance}>
        <AuthProvider>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster richColors closeButton />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App
