import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Archive, RotateCcw, Loader2 } from "lucide-react";

export default function ArchivedAltersManager() {
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState(null);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const archived = alters.filter(a => a.is_archived);

  const restoreMutation = useMutation({
    mutationFn: (alterId) => base44.entities.Alter.update(alterId, { is_archived: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      setRestoring(null);
    },
  });

  if (archived.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Archive className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Archived Members</CardTitle>
              <CardDescription>Manage archived system members</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No archived members</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Archive className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Archived Members</CardTitle>
            <CardDescription>Manage archived system members</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {archived.map((alter) => (
            <div key={alter.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm font-medium">{alter.name}</p>
                {alter.alias && <p className="text-xs text-muted-foreground">{alter.alias}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRestoring(alter.id);
                  restoreMutation.mutate(alter.id);
                }}
                disabled={restoring === alter.id}
              >
                {restoring === alter.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                {restoring === alter.id ? "Restoring..." : "Restore"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}