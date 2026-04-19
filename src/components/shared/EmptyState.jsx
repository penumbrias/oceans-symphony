/**
 * Consistent empty state with emoji, title, and suggestion.
 * Usage: <EmptyState emoji="📓" title="No entries yet" suggestion="Write your first journal entry to get started." />
 */
export default function EmptyState({ emoji = "🔍", title, suggestion, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {suggestion && <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{suggestion}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}