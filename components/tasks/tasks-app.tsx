"use client";

import * as React from "react";
import { Toaster } from "@/components/ui/sonner";
import { useTasksStore } from "@/stores/tasks-store";
import type { Task } from "@/lib/tasks/types";
import { TaskFeed } from "./task-feed";
import { TaskCommandBar } from "./task-command-bar";

interface TasksAppProps {
  initialTasks: Task[];
}

export function TasksApp({ initialTasks }: TasksAppProps) {
  const setTasks = useTasksStore((s) => s.setTasks);

  React.useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks, setTasks]);

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-border px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-base font-semibold tracking-tight">
              Scroll Minder
            </h1>
            <p className="text-xs text-muted-foreground">
              Pending tasks · sorted by due date
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl">
            <TaskFeed />
          </div>
        </main>
      </div>

      <TaskCommandBar />
      <Toaster richColors position="top-center" />
    </>
  );
}
