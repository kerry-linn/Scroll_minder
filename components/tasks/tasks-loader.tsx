import { fetchPendingTasks } from "@/app/actions/tasks";
import { TasksApp } from "./tasks-app";

export async function TasksLoader() {
  const initialTasks = await fetchPendingTasks();
  return <TasksApp initialTasks={initialTasks} />;
}
