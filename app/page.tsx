import { fetchPendingTasks } from "@/app/actions/tasks";
import { TasksApp } from "@/components/tasks/tasks-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialTasks = await fetchPendingTasks();

  return <TasksApp initialTasks={initialTasks} />;
}
