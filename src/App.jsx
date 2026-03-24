import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import MobileLayout from '@/components/layout/MobileLayout';
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import { Navigate } from 'react-router-dom';
import AlterProfile from '@/pages/AlterProfile';
import Settings from '@/pages/Settings';
import Analytics from '@/pages/Analytics';
import Journals from '@/pages/Journals';
import DiaryCards from '@/pages/DiaryCards';
import DailyTasks from '@/pages/DailyTasks';
import GroupsManager from '@/pages/GroupsManager';
import SystemCheckIn from '@/pages/SystemCheckIn';
import ActivityTracker from '@/pages/ActivityTracker';
import SleepTracker from '@/pages/SleepTracker';
import ToDoList from '@/pages/ToDoList';
import Timeline from '@/pages/Timeline.jsx';
import CoFrontingAnalytics from '@/pages/CoFrontingAnalytics';
import SystemMapPage from '@/pages/SystemMap';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<MobileLayout />}>
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
        <Route path="/cofronting-analytics" element={<CoFrontingAnalytics />} />
        <Route path="/system-map" element={<SystemMapPage />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App