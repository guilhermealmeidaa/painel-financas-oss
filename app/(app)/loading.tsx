export default function Loading() {
  return (
    <div className="flex flex-col gap-4 pt-2" aria-busy="true" aria-label="Carregando">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-10 w-56 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
