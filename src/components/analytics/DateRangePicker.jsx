import React, { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

export default function DateRangePicker({ from, to, onChange }) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Popover open={openFrom} onOpenChange={setOpenFrom}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2 rounded-xl h-10 px-4 text-sm font-medium">
            <CalendarIcon className="w-4 h-4" />
            {format(from, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={from}
            onSelect={(d) => { if (d) { onChange(d, to); setOpenFrom(false); } }}
            defaultMonth={from}
          />
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground font-medium">›</span>

      <Popover open={openTo} onOpenChange={setOpenTo}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2 rounded-xl h-10 px-4 text-sm font-medium">
            <CalendarIcon className="w-4 h-4" />
            {format(to, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={to}
            onSelect={(d) => { if (d) { onChange(from, d); setOpenTo(false); } }}
            defaultMonth={to}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}