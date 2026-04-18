import { Heart, Star, Clock, Sparkles } from "lucide-react";
import { CATEGORY_EMOJIS, CATEGORY_LABELS } from "@/utils/groundingDefaults";

function StarRating({ rating, onRate }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={(e) => { e.stopPropagation(); onRate(n); }}
          className="transition-colors hover:scale-110">
          <Star className={`w-3.5 h-3.5 ${rating >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
        </button>
      ))}
    </div>
  );
}

function formatDuration(seconds) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `~${m} min`;
}

export default function TechniqueCard({ technique, preference, onTap, onToggleFavorite, onRate }) {
  const emoji = CATEGORY_EMOJIS[technique.category] || "✨";
  const isFav = preference?.is_favorited || false;
  const rating = preference?.rating || 0;

  return (
    <button
      onClick={() => onTap(technique)}
      className="w-full text-left bg-card border border-border/60 rounded-xl p-4 hover:border-primary/30 hover:bg-primary/5 transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
              {technique.name}
            </span>
            {!technique.is_default && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Custom
              </span>
            )}
          </div>
          {technique.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{technique.description}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <StarRating rating={rating} onRate={(r) => onRate?.(technique, r)} />
              {technique.duration_seconds && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(technique.duration_seconds)}
                </span>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(technique); }}
              className="transition-colors hover:scale-110"
            >
              <Heart className={`w-4 h-4 ${isFav ? "fill-rose-400 text-rose-400" : "text-muted-foreground/40 hover:text-rose-400"}`} />
            </button>
          </div>
        </div>
      </div>
    </button>
  );
}