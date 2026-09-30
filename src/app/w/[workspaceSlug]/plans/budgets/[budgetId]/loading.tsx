export default function Loading() {
  return (
    <main className="px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-355 animate-pulse space-y-5">
        <div className="h-16 w-72 rounded-xl bg-[#eef2f7]" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="h-24 rounded-xl bg-[#eef2f7]" key={index} />
          ))}
        </div>
        <div className="h-44 rounded-xl bg-[#eef2f7]" />
        <div className="h-72 rounded-xl bg-[#eef2f7]" />
      </div>
    </main>
  );
}
