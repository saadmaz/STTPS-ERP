import { Loader2 } from "lucide-react";

/**
 * Full-height centered spinner used by client-side pages
 * while React Query is fetching initial data.
 *
 * Usage:
 *   if (isLoading) return <PageLoader />;
 */
export function PageLoader({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="animate-spin text-blue-600" size={28} />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
