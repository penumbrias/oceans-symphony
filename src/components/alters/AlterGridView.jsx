import React from "react";

export default function AlterGridView({ alters }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {alters.map((alter) => (
        <div key={alter.id} className="flex flex-col items-center gap-2">
          {alter.avatar_url ? (
            <img
              src={alter.avatar_url}
              alt={alter.name}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center ring-2 ring-primary/20">
              <span className="text-xs font-semibold text-muted-foreground">
                {alter.name.slice(0, 2)}
              </span>
            </div>
          )}
          <span className="text-xs text-center font-medium truncate w-full px-1">
            {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
          </span>
        </div>
      ))}
    </div>
  );
}