import { Suspense } from "react";
import { TaskFeedSkeleton } from "@/components/tasks/task-feed-skeleton";
import { TasksLoader } from "@/components/tasks/tasks-loader";
import { Skeleton } from "@/components/ui/skeleton";

function AppShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-4">
        <div className="w-16" />
        <Skeleton className="h-3 w-32" />
        <div className="w-16" />
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <TaskFeedSkeleton />
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <TasksLoader />
    </Suspense>
  );
}
