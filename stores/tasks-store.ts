import { create } from "zustand";
import type { OptimisticTask, Task, TaskPriority } from "@/lib/tasks/types";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function dueDateKey(task: OptimisticTask): string | null {
  return task.due_date ? task.due_date.slice(0, 10) : null;
}

function sortByDueDatePriorityThenCreated(
  tasks: OptimisticTask[]
): OptimisticTask[] {
  return [...tasks].sort((a, b) => {
    const aDate = dueDateKey(a);
    const bDate = dueDateKey(b);

    // Null due_date sorts after all dated tasks.
    if (!aDate && !bDate) {
      const priorityDiff =
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.created_at.localeCompare(b.created_at);
    }
    if (!aDate) return 1;
    if (!bDate) return -1;

    const dateDiff = aDate.localeCompare(bDate);
    if (dateDiff !== 0) return dateDiff;

    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return priorityDiff !== 0
      ? priorityDiff
      : a.created_at.localeCompare(b.created_at);
  });
}

interface TasksState {
  tasks: OptimisticTask[];
  setTasks: (tasks: Task[]) => void;
  addOptimisticTask: (task: OptimisticTask) => void;
  replaceOptimisticTask: (tempId: string, persistedTask: Task) => void;
  removeTask: (id: string) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],

  setTasks: (tasks) =>
    set({
      tasks: sortByDueDatePriorityThenCreated(tasks.map((t) => ({ ...t }))),
    }),

  addOptimisticTask: (task) =>
    set((state) => ({
      tasks: sortByDueDatePriorityThenCreated([...state.tasks, task]),
    })),

  replaceOptimisticTask: (tempId, persistedTask) =>
    set((state) => ({
      tasks: sortByDueDatePriorityThenCreated(
        state.tasks.map((t) =>
          t.id === tempId ? { ...persistedTask, isOptimistic: false } : t
        )
      ),
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),
}));
