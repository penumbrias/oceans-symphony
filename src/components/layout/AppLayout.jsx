import React, { useRef, useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Users, Sparkles, ClipboardList, BookOpen, CheckSquare, Home, Settings, ChevronLeft } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { cn } from "@/lib/utils";

const TAB_ROOTS = ["/", "/Home", "/system-checkin", "/journals", "/tasks"];

function isTabRoot(pathname) {
  return TAB_ROOTS.some(r => pathname === r) || pathname === "/settings";
}

function useNavItems(terms) {
  return [
    { path: "/", label: "Home", icon: Home },
    { path: "/Home", label: terms.Alters || "Alters", icon: Users },
    { path: "/system-checkin", label: "Check-In", icon: Sparkles },
    { path: "/journals", label: "Journals", icon: BookOpen },
    { path: "/tasks", label: "Tasks", icon: CheckSquare },
  ];
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const navItems = useNavItems(terms);
  const [historyDepth, setHistoryDepth] = useState(0);

  useEffect(() => {
    setHistoryDepth(prev => isTabRoot(location.pathname) ? 0 : prev + 1);
  }, [location.pathname]);

  const canGoBack = historyDepth > 0 && !isTabRoot(location.pathname);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Desktop top header (hidden on mobile) ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl hidden sm:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 select-none" aria-label="Symphony home">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">Symphony</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/"
                ? location.pathname === "/"
                : item.path === "/Home"
                  ? location.pathname === "/Home" || location.pathname.startsWith("/alter")
                  : location.pathname.startsWith(item.path);
              return (
                <Link key={item.path} to={item.path}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 select-none min-h-[44px]",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <Link to="/settings"
              aria-label="Settings"
              aria-current={location.pathname.startsWith("/settings") ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 select-none min-h-[44px]",
                location.pathname.startsWith("/settings") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}>
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Mobile top bar (shown only on mobile) ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl sm:hidden flex items-center justify-between px-2 h-14">
        {/* Left: back button or logo */}
        {canGoBack ? (
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="flex items-center gap-1 text-primary min-w-[44px] min-h-[44px] px-2 rounded-xl transition-colors hover:bg-muted/50"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
        ) : (
          <Link to="/" className="flex items-center gap-2 select-none min-h-[44px] px-2" aria-label="Symphony home">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-display text-base font-semibold text-foreground">Symphony</span>
          </Link>
        )}

        {/* Right: settings icon */}
        <Link
          to="/settings"
          aria-label="Settings"
          className={cn(
            "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors",
            location.pathname.startsWith("/settings") ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <Settings className="w-5 h-5" />
        </Link>
      </header>

      {/* ── Page content ── */}
      <main
        className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-8"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Outlet />
      </main>

      {/* ── Fixed bottom tab bar (mobile only) ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Tab bar navigation"
      >
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/"
              ? location.pathname === "/"
              : item.path === "/Home"
                ? location.pathname === "/Home" || location.pathname.startsWith("/alter")
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] py-1 select-none transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}