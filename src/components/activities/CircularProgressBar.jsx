import React from "react";

export default function CircularProgressBar({
  progress = 0,
  targetMinutes = 60,
  currentMinutes = 0,
  categoryName = "Activity",
  color = "#8b5cf6",
  size = "md",
}) {
  const percentage = Math.min((currentMinutes / targetMinutes) * 100, 100);
  const isComplete = currentMinutes >= targetMinutes;

  // Size configurations
  const sizes = {
    sm: { radius: 35, strokeWidth: 3, fontSize: "text-xs" },
    md: { radius: 50, strokeWidth: 3, fontSize: "text-sm" },
    lg: { radius: 70, strokeWidth: 4, fontSize: "text-base" },
  };

  const config = sizes[size] || sizes.md;
  const circumference = 2 * Math.PI * config.radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const displayTime = () => {
    if (currentMinutes < 60) return `${Math.round(currentMinutes)}m`;
    const hours = currentMinutes / 60;
    return `${Math.round(hours * 10) / 10}h`;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: config.radius * 2 + 20, height: config.radius * 2 + 20 }}>
        <svg
          width={config.radius * 2 + 20}
          height={config.radius * 2 + 20}
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Background circle */}
          <circle
            cx={config.radius + 10}
            cy={config.radius + 10}
            r={config.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-muted/30"
          />
          {/* Progress circle */}
          <circle
            cx={config.radius + 10}
            cy={config.radius + 10}
            r={config.radius}
            fill="none"
            stroke={isComplete ? "#10b981" : color}
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`${config.fontSize} font-bold`}>{displayTime()}</div>
          <div className="text-xs text-muted-foreground">{targetMinutes}m</div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-medium truncate max-w-[150px]">{categoryName}</p>
        <p className="text-xs text-muted-foreground">
          {percentage.toFixed(0)}% complete
        </p>
      </div>
    </div>
  );
}