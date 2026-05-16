import React from "react";

/**
 * Minimal React error boundary.
 *
 * Wrap a subtree to prevent a single render-time exception from blanking
 * the entire page. The fallback can be:
 *   - a ReactNode → rendered as-is
 *   - a function (error, reset) => ReactNode → called on each error
 *
 * `onError(error, info)` is optional and fires when a child throws — use it
 * for telemetry or to log to console in development.
 *
 * `resetKeys` is an array; whenever any of its values change between
 * renders, the boundary clears its error state and tries to render its
 * children again. Useful for "the user just took a recovery action,
 * try again now".
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Always log so the user can copy the trace from devtools when
    // reporting an issue, but don't crash the boundary itself if
    // logging fails.
    try {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary] caught:", error, info);
    } catch { /* ignore */ }
    if (typeof this.props.onError === "function") {
      try { this.props.onError(error, info); } catch { /* ignore */ }
    }
  }

  componentDidUpdate(prevProps) {
    if (!this.state.error) return;
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys || [];
    if (prev.length !== next.length) { this.reset(); return; }
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) { this.reset(); return; }
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        return fallback(this.state.error, this.reset);
      }
      if (fallback !== undefined) return fallback;
      // Default fallback — small, unobtrusive, doesn't pretend to know
      // anything about what crashed.
      return (
        <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
          Something went wrong rendering this section.
          <button
            type="button"
            onClick={this.reset}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
