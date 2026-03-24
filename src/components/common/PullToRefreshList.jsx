import { useRef } from 'react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Loader2 } from 'lucide-react';

export default function PullToRefreshList({ children, onRefresh, isLoading = false }) {
  const { scrollableRef, isRefreshing, pullDistance } = usePullToRefresh(onRefresh);

  return (
    <div
      ref={scrollableRef}
      className="overflow-y-auto h-full relative"
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          {isRefreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="text-xs">Pull to refresh</span>
          )}
        </div>
      )}

      <div className="p-4">
        {children}
      </div>
    </div>
  );
}