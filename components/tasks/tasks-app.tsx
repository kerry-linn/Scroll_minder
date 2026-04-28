"use client";

import * as React from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { Task } from "@/lib/tasks/types";
import { useTasksStore } from "@/stores/tasks-store";
import { TaskCommandBar } from "./task-command-bar";
import { TaskFeed } from "./task-feed";

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
        <header className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="w-16" />
          <h1 className="text-sm font-semibold tracking-widest uppercase text-foreground/70">
            ScrollMinder
          </h1>
          <div className="w-16 flex justify-end">
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl">
            <TaskFeed />
          </div>
        </main>
      </div>

      <TaskCommandBar />
    </>
  );
}
