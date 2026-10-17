import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Archive, RotateCcw, Loader2 } from "lucide-react";
import { contactDisplayName } from "@/lib/contacts";

// Archived contacts are hidden from the Contacts list, so this is the one
// place to find them again. Mirrors ArchivedAltersManager: list every
// archived contact with a Restore button that flips is_archived back off.
// Restoring only clears the flag — the record itself is never touched
// otherwise, and nothing here deletes anything.
export default function ArchivedContactsManager() {
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });

  const archived = contacts
    .filter((c) => c.is_archived)
    .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b)));

  const restoreMutation = useMutation({
    mutationFn: (id) => base44.entities.Contact.update(id, { is_archived: false }),
    onSuccess: (_r, id) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      const c = contacts.find((x) => x.id === id);
      toast.success(`${contactDisplayName(c)} is back in your contacts`);
    },
    onError: (err) => toast.error(err?.message || "Couldn't restore that contact"),
    onSettled: () => setRestoring(null),
  });

  return (
    <Card className="border-border/50" data-testid="archived-contacts">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-muted flex items-center justify-center">
            <Archive className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Archived contacts</CardTitle>
            <CardDescription>Archived contacts are hidden from your Contacts list. Restore one to put it straight back.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {archived.length === 0 ? (
          <p className="text-sm text-muted-foreground">No archived contacts</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto overscroll-contain pr-1">
            {archived.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg">
                <Link to={`/contacts/${c.id}`} className="min-w-0 hover:underline">
                  <p className="text-sm font-medium truncate">{contactDisplayName(c)}</p>
                  {c.nickname && c.name && c.nickname.trim() !== c.name.trim() && (
                    <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                  )}
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setRestoring(c.id);
                    restoreMutation.mutate(c.id);
                  }}
                  disabled={restoring === c.id}
                >
                  {restoring === c.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  {restoring === c.id ? "Restoring..." : "Restore"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
