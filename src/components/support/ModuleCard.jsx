import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle, Circle, ChevronRight } from "lucide-react";

export default function ModuleCard({ module, onSelectTopic }) {
  const { data: progressRecords = [] } = useQuery({
    queryKey: ["learningProgress"],
    queryFn: () => base44.entities.LearningProgress.list(),
  });

  const progressMap = Object.fromEntries(progressRecords.map(p => [p.topic_id, p]));
  const completedCount = module.topics.filter(t => progressMap[t.id]?.completed).length;
  const totalCount = module.topics.length;
  const isStarted = completedCount > 0;
  const isComplete = completedCount === totalCount;

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
      {/* Module header */}
      <div className="px-4 py-4 flex items-center gap-3">
        <span className="text-2xl">{module.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm leading-tight">{module.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {/* Soft dot progress */}
            <div className="flex gap-1">
              {module.topics.map(t => (
                <div
                  key={t.id}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    progressMap[t.id]?.completed
                      ? "bg-green-500"
                      : isStarted
                      ? "bg-primary/30"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {isComplete
                ? "All topics explored"
                : isStarted
                ? `${completedCount} of ${totalCount} explored`
                : `${totalCount} topics`}
            </span>
          </div>
        </div>
        {isComplete && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
      </div>

      {/* Topic list */}
      <div className="border-t border-border/40 divide-y divide-border/30">
        {module.topics.map((topic) => {
          const progress = progressMap[topic.id];
          const done = progress?.completed;
          return (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic, module.id)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
            >
              {done
                ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              <span className={`text-sm flex-1 ${done ? "text-muted-foreground" : "text-foreground"}`}>
                {topic.title}
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}