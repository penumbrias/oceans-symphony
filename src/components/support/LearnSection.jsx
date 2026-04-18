import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ModuleCard from "./ModuleCard";
import TopicView, { CURRICULUM } from "./TopicView";
import MyReflections from "./MyReflections";
import NeedsCheckIn from "./NeedsCheckIn";
import { FileText, Heart } from "lucide-react";

export default function LearnSection({ onTryTechnique }) {
  const [view, setView] = useState("overview"); // "overview" | "topic" | "reflections" | "needs"
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(null);

  const { data: progressRecords = [] } = useQuery({
    queryKey: ["learningProgress"],
    queryFn: () => base44.entities.LearningProgress.list(),
  });

  const totalTopics = CURRICULUM.reduce((sum, m) => sum + m.topics.length, 0);
  const completedTopics = progressRecords.filter(p => p.completed).length;
  const startedModules = new Set(progressRecords.filter(p => p.completed).map(p => p.module_id)).size;

  const handleSelectTopic = (topic, moduleId) => {
    setSelectedTopic(topic);
    setSelectedModuleId(moduleId);
    setView("topic");
  };

  if (view === "topic" && selectedTopic) {
    return (
      <TopicView
        topic={selectedTopic}
        moduleId={selectedModuleId}
        onBack={() => setView("overview")}
        onTryTechnique={onTryTechnique}
      />
    );
  }

  if (view === "reflections") {
    return <MyReflections onBack={() => setView("overview")} />;
  }

  if (view === "needs") {
    return <NeedsCheckIn onBack={() => setView("overview")} />;
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-12">
      {/* Gentle intro */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Learn at your own pace</h2>
        <p className="text-sm text-muted-foreground">
          A gentle curriculum you can move through whenever you're ready. No pressure, no deadlines, no right order. You can revisit anything as many times as you like.
        </p>
        {completedTopics > 0 && (
          <p className="text-xs text-primary/80">
            You've explored {completedTopics} of {totalTopics} topics across {startedModules} {startedModules === 1 ? "module" : "modules"}.
          </p>
        )}
      </div>

      {/* Quick access tools */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("reflections")}
          className="flex-1 flex items-center gap-2 bg-card border border-border/60 rounded-xl p-3 hover:border-primary/30 hover:bg-primary/5 transition-all"
        >
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">My Reflections</span>
        </button>
        <button
          onClick={() => setView("needs")}
          className="flex-1 flex items-center gap-2 bg-card border border-border/60 rounded-xl p-3 hover:border-primary/30 hover:bg-primary/5 transition-all"
        >
          <Heart className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Needs Check-In</span>
        </button>
      </div>

      {/* Note */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <p className="text-xs text-primary/80 italic">
          Some of this content can bring up difficult feelings. Please take breaks whenever you need to, and know that the Support tab is always there if you need grounding or crisis resources.
        </p>
      </div>

      {/* Module cards */}
      <div className="space-y-4">
        {CURRICULUM.map(module => (
          <ModuleCard
            key={module.id}
            module={module}
            onSelectTopic={handleSelectTopic}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        This curriculum is a beginning, not an ending. Come back as many times as you like. 🤍
      </p>
    </div>
  );
}