import { Toaster } from "@/components/ui/toaster"
import { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import AppLayout from '@/components/layout/AppLayout';
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
import SystemCheckIn from '@/pages/SystemCheckIn';
import ActivityTracker from '@/pages/ActivityTracker';
import SleepTracker from '@/pages/SleepTracker';
import ToDoList from '@/pages/ToDoList';
import Timeline from '@/pages/Timeline.jsx';

import SystemMapPage from '@/pages/SystemMap';
import Grounding from '@/pages/Grounding';
import SafetyPlan from '@/pages/SafetyPlan';
import BulletinPage from '@/pages/BulletinPage';
import ManageCheckIn from '@/pages/ManageCheckIn';
import TherapyReport from '@/pages/TherapyReport';
import Reminders from '@/pages/Reminders';
import Polls from '@/pages/Polls.jsx';
import CheckInLog from '@/pages/CheckInLog';
import { isEncryptionEnabled } from '@/lib/storageMode';
import { initAccessibility } from '@/lib/useAccessibility';

// Apply saved accessibility settings before first render
initAccessibility();
import { isDbInitialized, initLocalDb, migrateBase64AvatarsToLocal, migrateLocalImageUrlScheme } from '@/lib/localDb';
import { useTimezoneSync } from '@/lib/useTimezoneSync';
import UnlockScreen from '@/components/onboarding/UnlockScreen';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();
  useTimezoneSync();

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
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/Dashboard" element={<Navigate to="/" replace />} />
        <Route path="/Home" element={<Home />} />
        <Route path="/alter/:id" element={<AlterProfile />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="/analytics" element={<Analytics />} />
        <Route path="/journals" element={<Journals />} />
        <Route path="/diary" element={<DiaryCards />} />
        <Route path="/tasks" element={<DailyTasks />} />
        <Route path="/todo" element={<ToDoList />} />
        <Route path="/groups" element={<GroupsManager />} />
        <Route path="/system-checkin" element={<SystemCheckIn />} />
        <Route path="/activities" element={<ActivityTracker />} />
        <Route path="/sleep" element={<SleepTracker />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/system-map" element={<SystemMapPage />} />
        <Route path="/bulletin/:id" element={<BulletinPage />} />
        <Route path="/manage-checkin" element={<ManageCheckIn />} />
        <Route path="/grounding" element={<Grounding />} />
        <Route path="/safety-plan" element={<SafetyPlan />} />
        <Route path="/therapy-report" element={<TherapyReport />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/polls" element={<Polls />} />
        <Route path="/checkin-log" element={<CheckInLog />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  // 'loading' while IndexedDB initializes, 'unlock' if encryption is set, null when ready
  const [setupState, setSetupState] = useState(() => {
    if (isEncryptionEnabled() && !isDbInitialized()) return 'unlock';
    return 'loading';
  });

  useEffect(() => {
    if (setupState === 'loading') {
      initLocalDb(null)
        .then(() => setSetupState(null))
        .catch(() => setSetupState(null));
    }
  }, [setupState]);

  useEffect(() => {
    if (setupState === null && isDbInitialized()) {
      migrateBase64AvatarsToLocal().catch(() => {});
      // Rewrite legacy local-image:// URLs to /local-image/ so the SW can serve them
      migrateLocalImageUrlScheme().catch(() => {});
    }
  }, [setupState]);

  if (setupState === 'loading') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (setupState === 'unlock') {
    return (
      <ThemeProvider>
        <UnlockScreen onUnlock={() => setSetupState(null)} />
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
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App
