import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar, CheckSquare } from "lucide-react";

export default function NewFeaturesBar() {
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      <Link to="/tasks">
        <Button variant="outline" size="sm" className="gap-2">
          <CheckSquare className="w-4 h-4" />
          To-Do List
        </Button>
      </Link>
      <Link to="/timeline">
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="w-4 h-4" />
          Timeline
        </Button>
      </Link>
    </div>
  );
}