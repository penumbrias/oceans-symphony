/**
 * Loading spinner with optional label.
 * Usage: <LoadingSpinner label="Loading entries..." />
 */
export default function LoadingSpinner({ label = "Loading...", className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center py-20 gap-3 ${className}`}>
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}