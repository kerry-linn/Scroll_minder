import { create } from "zustand";
import type { OptimisticTask, Task } from "@/lib/tasks/types";

function sortByDueDateThenCreated(tasks: OptimisticTask[]): OptimisticTask[] {
  return [...tasks].sort((a, b) => {
    // Null due_date sorts after all dated tasks
    if (!a.due_date && !b.due_date) {
      return a.created_at.localeCompare(b.created_at);
    }
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    const diff = a.due_date.localeCompare(b.due_date);
    return diff !== 0 ? diff : a.created_at.localeCompare(b.created_at);
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
    set({ tasks: sortByDueDateThenCreated(tasks.map((t) => ({ ...t }))) }),

  addOptimisticTask: (task) =>
    set((state) => ({
      tasks: sortByDueDateThenCreated([...state.tasks, task]),
    })),

  replaceOptimisticTask: (tempId, persistedTask) =>
    set((state) => ({
      tasks: sortByDueDateThenCreated(
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
