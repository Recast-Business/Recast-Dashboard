import * as React from "react";
import { ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskDialog, type TaskEntityRef } from "@/components/tasks/TaskDialog";
import { cn } from "@/lib/utils";

/**
 * Round 3: contextual "+ Task" — dropped into campaign cards, vendor
 * detail, and creator profiles so "chase FanDuel about March" gets
 * created while looking at the thing, pre-linked back to it. The
 * task's entity chip then jumps straight back here.
 */
export function NewTaskButton({
  entity,
  size = "sm",
  variant = "outline",
  className,
  label = "Task",
}: {
  entity: TaskEntityRef;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost";
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn("h-8 text-[12px]", className)}
        title={`Add a task linked to ${entity.label}`}
        onClick={(e) => {
          // Quick-adds often live inside expandable card headers —
          // opening the dialog shouldn't also toggle the card.
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ListTodo className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
        {label}
      </Button>
      {open && <TaskDialog open onOpenChange={setOpen} entity={entity} />}
    </>
  );
}
