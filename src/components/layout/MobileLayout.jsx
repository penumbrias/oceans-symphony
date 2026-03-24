import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Users, Sparkles, BookOpen, CheckSquare, BarChart3, Settings } from 'lucide-react';
import { useTerms } from '@/lib/useTerms';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const TABS = [
  { id: 'home', icon: Users, label: 'System', path: '/Home' },
  { id: 'activities', icon: Sparkles, label: 'Check-In', path: '/system-checkin' },
  { id: 'journals', icon: BookOpen, label: 'Journals', path: '/journals' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { id: 'settings', icon: Settings, label: 'Settings', path: '/settings' },
];

// Map routes to tab IDs
const getTabFromRoute = (pathname) => {
  if (pathname === '/Home' || pathname.startsWith('/alter')) return 'home';
  if (pathname.startsWith('/system-checkin')) return 'activities';
  if (pathname.startsWith('/journals')) return 'journals';
  if (pathname.startsWith('/tasks') || pathname.startsWith('/todo')) return 'tasks';
  if (pathname.startsWith('/analytics') || pathname.startsWith('/cofronting') || pathname.startsWith('/diary')) return 'analytics';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'home';
};

export default function MobileLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const currentTab = getTabFromRoute(location.pathname);
  const [prevTab, setPrevTab] = useState(currentTab);

  const handleTabChange = (tabId, path) => {
    setPrevTab(currentTab);
    navigate(path);
  };

  const isForward = TABS.findIndex(t => t.id === currentTab) > TABS.findIndex(t => t.id === prevTab);

  return (
    <div className="flex flex-col min-h-screen bg-background" style={{ paddingTop: 'var(--safe-area-inset-top)', paddingBottom: 'var(--safe-area-inset-bottom)' }}>
      {/* Main content with transitions */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: isForward ? 100 : -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isForward ? -100 : 100 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="h-full overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto px-4 py-6">
              <Outlet />
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom tab navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 border-t border-border/50 bg-background/80 backdrop-blur-xl"
        style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id, tab.path)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 py-3 transition-colors',
                  'min-h-[56px]',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}