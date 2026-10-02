import { cn } from "@/lib/utils";

const BAR_HEIGHTS = [38, 62, 48, 74, 56, 44, 68, 82, 58, 70, 52, 78, 64, 88, 72];

export function PaceChartSkeleton({
  className,
  legend = true,
  plotClassName = "h-72",
}: {
  className?: string;
  legend?: boolean;
  plotClassName?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("min-w-0 animate-pulse motion-reduce:animate-none", className)}>
      <div className={cn("flex gap-3", plotClassName)}>
        <div className="flex w-9 shrink-0 flex-col justify-between pb-7">
          {[0, 1, 2, 3, 4].map((tick) => (
            <span className="h-2 w-7 rounded-full bg-[#eef2f7]" key={tick} />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 items-end gap-[3%] border-b border-[#edf1f6] px-1">
            {BAR_HEIGHTS.map((height, index) => (
              <span
                className="flex-1 rounded-t-lg bg-[#edf1f7]"
                key={index}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="flex h-7 items-end justify-between">
            {[0, 1, 2, 3, 4].map((tick) => (
              <span className="h-2 w-8 rounded-full bg-[#eef2f7]" key={tick} />
            ))}
          </div>
        </div>
      </div>
      {legend ? (
        <div className="mt-3 flex gap-4">
          <span className="h-2.5 w-24 rounded-full bg-[#eef2f7]" />
          <span className="h-2.5 w-20 rounded-full bg-[#eef2f7]" />
        </div>
      ) : null}
    </div>
  );
}
