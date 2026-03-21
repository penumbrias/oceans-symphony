import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";

export default function CheckInStep2({ data, onChange, alters = [] }) {
  const step = data?.step2_notice || {};

  const toggleAlter = (alterId) => {
    const present = step.alters_present || [];
    const updated = present.includes(alterId)
      ? present.filter(id => id !== alterId)
      : [...present, alterId];
    onChange({
      step2_notice: {
        ...step,
        alters_present: updated
      }
    });
  };

  const removeAlter = (alterId) => {
    const present = step.alters_present || [];
    onChange({
      step2_notice: {
        ...step,
        alters_present: present.filter(id => id !== alterId)
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 2: Notice Who's Near (1 min)</CardTitle>
          <CardDescription>Notice what, if anything, arises. No need to force anything. Showing up is what matters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
             <div>
               <Label className="text-sm mb-2 block">Alters present</Label>
               <div className="space-y-2">
                 {alters.length > 0 ? (
                   alters.map((alter) => (
                     <div key={alter.id} className="flex items-center gap-3">
                       <Checkbox
                         id={`alter-${alter.id}`}
                         checked={(step.alters_present || []).includes(alter.id)}
                         onCheckedChange={() => toggleAlter(alter.id)}
                       />
                       <Label htmlFor={`alter-${alter.id}`} className="cursor-pointer flex-1">
                         {alter.name}
                       </Label>
                     </div>
                   ))
                 ) : (
                   <p className="text-xs text-muted-foreground">No alters available</p>
                 )}
               </div>
               {step.alters_present && step.alters_present.length > 0 && (
                 <div className="flex flex-wrap gap-2 mt-3">
                   {step.alters_present.map((alterId) => {
                     const alter = alters.find(a => a.id === alterId);
                     return alter ? (
                       <div
                         key={alterId}
                         className="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full flex items-center gap-2"
                       >
                         {alter.name}
                         <button
                           onClick={() => removeAlter(alterId)}
                           className="hover:text-destructive transition-colors"
                         >
                           <X className="w-3 h-3" />
                         </button>
                       </div>
                     ) : null;
                   })}
                 </div>
               )}
             </div>

            <div>
              <Label htmlFor="step2-feelings" className="text-sm mb-2 block">
                Feelings noticed
              </Label>
              <Textarea
                id="step2-feelings"
                placeholder="What emotions or feelings do you notice?"
                value={step.feelings || ""}
                onChange={(e) =>
                  onChange({
                    step2_notice: { ...step, feelings: e.target.value }
                  })
                }
                className="resize-none h-16"
              />
            </div>

            <div>
              <Label htmlFor="step2-sensations" className="text-sm mb-2 block">
                Sensations, colors, or textures
              </Label>
              <Textarea
                id="step2-sensations"
                placeholder="Any physical sensations, colors, or textures?"
                value={step.sensations || ""}
                onChange={(e) =>
                  onChange({
                    step2_notice: { ...step, sensations: e.target.value }
                  })
                }
                className="resize-none h-16"
              />
            </div>

            <div>
              <Label htmlFor="step2-notes" className="text-sm mb-2 block">
                Additional notes
              </Label>
              <Textarea
                id="step2-notes"
                placeholder="Any other observations..."
                value={step.notes || ""}
                onChange={(e) =>
                  onChange({
                    step2_notice: { ...step, notes: e.target.value }
                  })
                }
                className="resize-none h-16"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}