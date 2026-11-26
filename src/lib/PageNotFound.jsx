import { Link, useLocation } from "react-router-dom";
import { Home, LifeBuoy } from "lucide-react";

// A link that leads nowhere (an old bookmark, a page that moved). Calm, in
// the person's own theme, with a way home and the fire exit one tap away.
// Replaces the leftover hosting-template page and its "Admin note".
export default function PageNotFound() {
  const location = useLocation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-semibold">This page isn't here</h1>
        <p className="text-sm text-muted-foreground">
          Nothing lives at <span className="font-medium text-foreground break-all">{location.pathname}</span>.
          It may have moved. Nothing of yours is lost.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Link to="/" className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            <Home className="w-4 h-4" aria-hidden="true" /> Go home
          </Link>
          <Link to="/grounding" className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-border text-sm font-medium">
            <LifeBuoy className="w-4 h-4" aria-hidden="true" /> Support
          </Link>
        </div>
      </div>
    </div>
  );
}
