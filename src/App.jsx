import { Toaster } from "@/components/ui/toaster"
import { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
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
import StorageModeSetup from '@/components/onboarding/StorageModeSetup';
import Reminders from '@/pages/Reminders';
import { isFirstRun, isLocalMode, isEncryptionEnabled } from '@/lib/storageMode';
import { isDbInitialized, initLocalDb } from '@/lib/localDb';
import { useTimezoneSync } from '@/lib/useTimezoneSync';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  useTimezoneSync();

  // Show loading screen while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm font-medium">Loading Symphony...</p>
        </div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
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
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  const [setupState, setSetupState] = useState(() => {
    if (isFirstRun()) return 'first_run';
    if (isLocalMode() && isEncryptionEnabled() && !isDbInitialized()) return 'unlock';
    if (isLocalMode() && !isDbInitialized()) {
      // Auto-init unencrypted local db
      initLocalDb(null).catch(() => {});
    }
    return null;
  });



  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClientInstance}>
        <AuthProvider>
          <Router>
            {setupState ? (
              <StorageModeSetup mode={setupState} onComplete={() => {
                setSetupState(null);
                window.location.href = "/";
              }} />
            ) : (
              <AuthenticatedApp />
            )}
          </Router>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App