import React, { useRef, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Users, Sparkles, ClipboardList, BookOpen, CheckSquare, Home, Settings } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { cn } from "@/lib/utils";

// Slide direction: positive = slide-in from right (going deeper), negative = from left (going back)
const ROUTE_ORDER = ["/", "/Home", "/system-checkin", "/journals", "/tasks", "/todo", "/settings"];

function getSlideDirection(from, to) {
  const fromIdx = ROUTE_ORDER.findIndex(r => from.startsWith(r));
  const toIdx = ROUTE_ORDER.findIndex(r => to.startsWith(r));
  if (fromIdx === -1 || toIdx === -1) return 1;
  return toIdx >= fromIdx ? 1 : -1;
}

const pageVariants = {
  enter: (dir) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? "-40%" : "40%", opacity: 0 }),
};
const pageTransition = { type: "tween", ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 };

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
  const terms = useTerms();
  const navItems = useNavItems(terms);
  const prevPath = useRef(location.pathname);
  const dir = getSlideDirection(prevPath.current, location.pathname);
  // Update prevPath AFTER computing dir so we compare current→next
  React.useEffect(() => { prevPath.current = location.pathname; }, [location.pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Desktop top header (hidden on mobile) ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl hidden sm:block">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 select-none">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">Symphony</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/"
                ? location.pathname === "/"
                : item.path === "/Home"
                  ? location.pathname === "/Home" || location.pathname.startsWith("/alter")
                  : location.pathname.startsWith(item.path);
              return (
                <Link key={item.path} to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 select-none",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <Link to="/settings"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 select-none",
                location.pathname.startsWith("/settings") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}>
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Mobile top bar (shown only on mobile) ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl sm:hidden flex items-center justify-between px-4 h-14">
        <Link to="/" className="flex items-center gap-2 select-none">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-display text-base font-semibold text-foreground">Symphony</span>
        </Link>
        <Link to="/settings" className={cn(
          "p-2 rounded-lg transition-colors select-none",
          location.pathname.startsWith("/settings") ? "text-primary bg-primary/10" : "text-muted-foreground"
        )}>
          <Settings className="w-5 h-5" />
        </Link>
      </header>

      {/* ── Page content with slide transitions ── */}
      <main
        className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-hidden"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={location.pathname}
            custom={dir}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="w-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Fixed bottom tab bar (mobile only) ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full py-1 select-none transition-colors",
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