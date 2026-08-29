import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { ConfirmRoot } from "@/components/shared/ConfirmDialog"
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import AppLayout from '@/components/layout/AppLayout';
import Privacy from '@/pages/Privacy';
import Dashboard from '@/pages/Dashboard';
import { Navigate } from 'react-router-dom';
import Settings from '@/pages/Settings';

// Route-level code splitting (v0.184.0). Every page except the landing
// (Dashboard), Settings (reached from every header) and Privacy is loaded
// on first navigation — the single entry chunk had every page eagerly and
// cost low-end phones 1–2 s of parse before first paint. The Suspense
// fallback below sits INSIDE AppLayout so header/nav stay put while a
// page chunk arrives (no full-screen flash).
const Home = lazy(() => import('@/pages/Home'));
const AlterProfile = lazy(() => import('@/pages/AlterProfile'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const ContactProfile = lazy(() => import('@/pages/ContactProfile'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Journals = lazy(() => import('@/pages/Journals'));
const DailyTasks = lazy(() => import('@/pages/DailyTasks'));
const GroupsManager = lazy(() => import('@/pages/GroupsManager'));
const GroupProfile = lazy(() => import('@/pages/GroupProfile'));
const LocationProfile = lazy(() => import('@/pages/LocationProfile'));
const AssetsLibrary = lazy(() => import('@/pages/AssetsLibrary'));
const SystemCheckIn = lazy(() => import('@/pages/SystemCheckIn'));
const ActivityTracker = lazy(() => import('@/pages/ActivityTracker'));
const SleepTracker = lazy(() => import('@/pages/SleepTracker'));
const ToDoList = lazy(() => import('@/pages/ToDoList'));
const Timeline = lazy(() => import('@/pages/Timeline'));
const SystemMapPage = lazy(() => import('@/pages/SystemMap'));
const NewPresencesPage = lazy(() => import('@/pages/NewPresences'));
const Grounding = lazy(() => import('@/pages/Grounding'));
const SafetyPlan = lazy(() => import('@/pages/SafetyPlan'));
const BulletinPage = lazy(() => import('@/pages/BulletinPage'));
const BulletinsPage = lazy(() => import('@/pages/BulletinsPage'));
const HelpMeUnblend = lazy(() => import('@/pages/HelpMeUnblend'));
const GetToKnowMe = lazy(() => import('@/pages/GetToKnowMe'));
const Chat = lazy(() => import('@/pages/Chat'));
const UnblendQuestionsManager = lazy(() => import('@/pages/UnblendQuestionsManager'));
const ManageCheckIn = lazy(() => import('@/pages/ManageCheckIn'));
const TherapyReport = lazy(() => import('@/pages/TherapyReport'));
const Reminders = lazy(() => import('@/pages/Reminders'));
const Polls = lazy(() => import('@/pages/Polls'));
const CheckInLog = lazy(() => import('@/pages/CheckInLog'));
const SystemHistory = lazy(() => import('@/pages/SystemHistory'));
const LocationHistory = lazy(() => import('@/pages/LocationHistory'));
const FriendsPage = lazy(() => import('@/pages/Friends'));
const PlannerPage = lazy(() => import('@/pages/Planner'));


import { setEncryptionEnabled, setEncSalt, getSessionPassword, clearSessionPassword } from '@/lib/storageMode';
import StorageModeSetup from '@/components/onboarding/StorageModeSetup';
import AccessibilityFab from '@/components/accessibility/AccessibilityFab';

// First run: the welcome intro and the storage-setup screen are now a single
// combined screen (StorageModeSetup renders the welcome copy above the storage
// choice in "setup" mode).
import { initAccessibility } from '@/lib/useAccessibility';

// Apply saved accessibility settings before first render
initAccessibility();
// …and again if the on-device preferences mirror restores keys that a
// localStorage wipe took (fires from initLocalDb once the DB is readable).
// ThemeContext listens for its own re-read event from the same restore.
if (typeof window !== "undefined") {
  window.addEventListener("symphony-local-settings-restored", () => { try { initAccessibility(); } catch { /* non-fatal */ } });
}
import {
  isDbInitialized,
  initLocalDb,
  migrateBase64AvatarsToLocal,
  migrateLocalImageUrlScheme,
  peekStoredData,
  EncryptedDataWithoutKeyError,
} from '@/lib/localDb';
import { requestPersistentStorage, runAutoBackupIfDue } from '@/lib/autoBackup';
import { refreshCustomFontFaces } from '@/lib/customFontFaces';
import { reconcileDistressStore } from '@/lib/emotionDistress';
import { initSystemsRegistry } from '@/lib/systems';
import { scanForOrphanedData, isEffectivelyEmpty } from '@/lib/dataRecovery';
import { initNativeShell, subscribeToNativeTap, pendingNativeTap, subscribeToNativeRoute, pendingNativeRoute } from '@/lib/nativeBootstrap';
import { useNativeReminderSync } from '@/lib/nativeReminderScheduler';
import { useServerReminderSync } from '@/lib/serverReminderSync';
import { usePlanReminderSync } from '@/lib/planReminderScheduler';
import { useNativeQuickActionsSync } from '@/lib/nativeQuickActions';
import { useFriendsFrontChangeNotifications } from '@/lib/useFriendsFrontNotifications';
import { useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import { recordCrash } from '@/lib/lastCrash';
import { restorePreviewIfActive, isPreviewActive } from '@/lib/previewMode';
import { cleanupBrokenSessionsOnce } from '@/lib/frontingUtils';
import { cleanupLegacyCardEntryOnce } from '@/lib/dailyTaskSystem';
import { base44 } from '@/api/base44Client';
import { useTimezoneSync } from '@/lib/useTimezoneSync';
import UnlockScreen from '@/components/onboarding/UnlockScreen';
import RecoveryScreen from '@/components/onboarding/RecoveryScreen';
import OrphanRecoveryScreen from '@/components/onboarding/OrphanRecoveryScreen';
import GroceryListPanel from '@/components/grocery/GroceryListPanel';
import { CornerModeApplier } from '@/lib/useCornerMode';

// Shown while a lazily-loaded page chunk downloads. Sits in the page slot
// (inside AppLayout's <Outlet/> position via Suspense above Routes), so
// only the content area shows it.
function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" aria-label="Loading page" />
    </div>
  );
}

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
  const location = useLocation();
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
      <ErrorBoundary
        resetKeys={[location.pathname]}
        // Stash the trace so the bug-report form can carry it. By the time
        // someone opens that form they've navigated away and the details
        // behind "Show error details" are gone, so reports arrived with no
        // way to locate the crash.
        onError={(error, info) => recordCrash(error, info, location.pathname)}
        fallback={(error, reset) => (
          <div className="fixed inset-0 z-[100] bg-background overflow-y-auto flex items-center justify-center p-5">
            <div className="max-w-md w-full text-center space-y-4">
              <div className="text-4xl">🌊</div>
              <h1 className="text-lg font-semibold">Something went wrong on this screen</h1>
              <p className="text-sm text-muted-foreground">
                Your data is safe — it's all stored on your device. This is just a display hiccup. Try going back to the home screen, or reload the app.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { reset(); navigate("/"); }}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium"
                >
                  Go to home screen
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="w-full py-2.5 rounded-xl border border-border text-foreground"
                >
                  Reload the app
                </button>
              </div>
              <details className="text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer">Show error details (for a bug report)</summary>
                <pre className="mt-2 text-[0.625rem] whitespace-pre-wrap break-words bg-muted/40 rounded-lg p-2 max-h-48 overflow-y-auto text-muted-foreground">
                  {String(error?.stack || error?.message || error)}
                </pre>
              </details>
            </div>
          </div>
        )}
      >
      <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/Dashboard" element={<Navigate to="/" replace />} />
        <Route path="/Home" element={<Home />} />
        <Route path="/alter/:id" element={<AlterProfile />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactProfile />} />
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
        <Route path="/presences" element={<NewPresencesPage />} />
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
        {/* New planner — lives alongside the old tracker until it replaces it. */}
        <Route path="/planner" element={<PlannerPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
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
  // Data blobs found under a non-active key when the active slot was empty —
  // populated in the 'recover-orphan' boot branch (see dataRecovery.js).
  const [orphanCandidates, setOrphanCandidates] = useState([]);
  // True when recovery was offered over a system that EXISTS but is empty
  // (rather than a missing slot). Declining there must carry on into that
  // system, NOT into setup — setup refuses to run over an existing slot and
  // would bounce the user round the same screen forever.
  const [orphanOverEmpty, setOrphanOverEmpty] = useState(false);
  // Set when the user has declined recovery this session, so the empty-slot
  // scan doesn't re-offer it on the very next pass through boot.
  const orphanDeclined = useRef(false);

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

      // Resolve which system (data slot) is active BEFORE any storage read, so
      // peek/init read the active system's blob. For existing users this is
      // "System 1" → the legacy key, i.e. exactly the data they already have.
      // Non-fatal: on failure localDb keeps its default (legacy) key.
      try { await initSystemsRegistry(); } catch { /* non-fatal — defaults to legacy key */ }

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
        // The ACTIVE system slot is empty — but before treating this as a
        // brand-new user, scan the whole IndexedDB scope for a real data blob
        // under another key (a mis-pointed / drifted registry can leave a user
        // with hundreds of alters staring at the empty Welcome screen while
        // every byte is still on the device). If we find data, offer recovery
        // instead of setup. Non-fatal: a scan failure just proceeds to firstrun.
        let orphans = [];
        try { orphans = await scanForOrphanedData(); } catch { orphans = []; }
        if (cancelled) return;
        if (orphans.length > 0) {
          setOrphanCandidates(orphans);
          setSetupState('recover-orphan');
          return;
        }
        setSetupState('firstrun');
        return;
      }

      if (peek.corrupted) {
        setRecoveryReason({ kind: 'corrupted' });
        setSetupState('recovery');
        return;
      }

      // The slot EXISTS but holds nothing the user made — a wiped or drifted
      // active system. `peek.exists` was true, so the scan above was skipped,
      // and this is exactly where a "my whole system got wiped, I can't get it
      // back" user landed: an empty app that thinks it's fine, with their real
      // blob still sitting under another key in the same database. Scan for
      // UNREGISTERED data (a sibling system's blob is excluded, so a genuinely
      // empty second system is left alone) and offer it back.
      //
      // Plaintext only: an encrypted blob can't be inspected without the key,
      // and the encrypted branch below owns that case.
      if (!peek.encrypted && !orphanDeclined.current) {
        let emptyActive = false;
        try { emptyActive = isEffectivelyEmpty(JSON.parse(peek.raw)); } catch { emptyActive = false; }
        if (emptyActive) {
          let orphans = [];
          try { orphans = await scanForOrphanedData(); } catch { orphans = []; }
          if (cancelled) return;
          if (orphans.length > 0) {
            setOrphanCandidates(orphans);
            setOrphanOverEmpty(true);
            setSetupState('recover-orphan');
            return;
          }
        }
      }

      if (peek.encrypted) {
        // Restore localStorage flags so the rest of the app and the
        // unlock screen behave consistently — these were the bits that
        // Android cleaners had wiped, sending users into the firstrun
        // wipe path.
        setEncryptionEnabled(true);
        if (peek.salt) setEncSalt(peek.salt);
        // One password for the whole app: if we already unlocked earlier this
        // app session, reuse it so switching between encrypted systems doesn't
        // re-prompt. A wrong/stale session password falls through to the
        // unlock screen.
        const sessionPw = getSessionPassword();
        if (sessionPw) {
          try {
            await initLocalDb(sessionPw);
            await restorePreviewIfActive();
            if (cancelled) return;
            if (!isPreviewActive()) {
              cleanupBrokenSessionsOnce(base44.entities);
              cleanupLegacyCardEntryOnce(base44.entities);
            }
            setSetupState(null);
            return;
          } catch {
            clearSessionPassword();
          }
        }
        if (cancelled) return;
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
      // Best-effort; may pop in a beat after first paint, same as the
      // extra Google Fonts <link> loader.
      refreshCustomFontFaces().catch(() => {});
      // Sync the distress-emotion set between localStorage (fast cache) and
      // SystemSettings (backed-up copy) — adopts a restored backup's set on
      // a fresh device, migrates pre-B2 device-local customisations up.
      reconcileDistressStore().catch(() => {});
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

  if (setupState === 'recover-orphan') {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <OrphanRecoveryScreen
            candidates={orphanCandidates}
            overExistingSystem={orphanOverEmpty}
            onSetupNew={() => {
              setOrphanCandidates([]);
              if (orphanOverEmpty) {
                // There IS a system here, it's just empty — carry on into it
                // instead of into setup, which would refuse to overwrite it.
                orphanDeclined.current = true;
                setOrphanOverEmpty(false);
                setSetupState('booting');
              } else {
                setSetupState('firstrun');
              }
            }}
          />
          <AccessibilityFab zIndex={110} />
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  if (setupState === 'firstrun') {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <StorageModeSetup mode="setup" onComplete={() => setSetupState(null)} />
          {/* Accessibility quick-access available from the very first screen,
              before Settings is reachable. Writes localStorage-backed prefs
              that apply instantly. zIndex must clear the welcome overlay
              (the StorageModeSetup backdrop is z-100) so it isn't covered. */}
          <AccessibilityFab zIndex={110} />
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
          <SonnerToaster richColors closeButton />
          <ConfirmRoot />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App
