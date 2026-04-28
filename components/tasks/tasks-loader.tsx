import { fetchPendingTasks } from "@/app/actions/tasks";
import { TasksApp } from "./tasks-app";

/**
 * Server Component that fetches tasks and passes them to the client shell.
 * Rendered inside a Suspense boundary so the skeleton shows during the fetch.
 */
export async function TasksLoader() {
  const initialTasks = await fetchPendingTasks();
  return <TasksApp initialTasks={initialTasks} />;
}
