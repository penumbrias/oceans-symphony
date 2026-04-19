/**
 * Consistent section header: small caps, muted, tracking-wider, with a bottom divider.
 * Usage: <SectionHeader>Members</SectionHeader>
 */
export default function SectionHeader({ children, className = "" }) {
  return (
    <div className={`flex items-center gap-2 mb-3 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </p>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}