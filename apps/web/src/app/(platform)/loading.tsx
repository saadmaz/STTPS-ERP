// Generic platform-level loading skeleton.
// Shown on any route inside (platform) that doesn't have its own loading.tsx.
export default function PlatformLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
          <div className="h-4 w-64 bg-slate-100 rounded-md" />
        </div>
        <div className="h-9 w-28 bg-slate-200 rounded-lg" />
      </div>

      {/* Stat card row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl" />
            </div>
            <div className="h-7 w-20 bg-slate-200 rounded-md mb-2" />
            <div className="h-4 w-32 bg-slate-100 rounded-md" />
          </div>
        ))}
      </div>

      {/* Main content card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-slate-100 flex gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded-md flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-4 py-3.5 border-b border-slate-50 flex gap-4">
            <div className="h-4 w-24 bg-slate-100 rounded-md" />
            <div className="h-4 flex-1 bg-slate-100 rounded-md" />
            <div className="h-4 w-20 bg-slate-100 rounded-md" />
            <div className="h-4 w-16 bg-slate-100 rounded-md" />
            <div className="h-5 w-14 bg-slate-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
