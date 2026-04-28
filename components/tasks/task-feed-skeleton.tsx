import { Skeleton } from "@/components/ui/skeleton";

export function TaskFeedSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-4 pt-4">
      {[0, 1, 2].map((group) => (
        <section key={group}>
          <Skeleton className="mb-2 h-3 w-24" />
          <div className="flex flex-col gap-1.5">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3"
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
