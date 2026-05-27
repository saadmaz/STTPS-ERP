// Analytics loading skeleton — mirrors 8 KPI cards + module directory grid.
export default function AnalyticsLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-slate-200 rounded-lg" />
          <div className="h-4 w-64 bg-slate-100 rounded-md" />
        </div>
        <div className="h-9 w-28 bg-slate-200 rounded-lg" />
      </div>

      {/* 8 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl" />
              <div className="w-4 h-4 bg-slate-100 rounded" />
            </div>
            <div className="h-7 w-20 bg-slate-200 rounded-md mb-1.5" />
            <div className="h-4 w-28 bg-slate-100 rounded-md mb-1" />
            <div className="h-3 w-20 bg-slate-100 rounded-md" />
          </div>
        ))}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-24 bg-slate-200 rounded-md" />
        <div className="h-5 w-16 bg-slate-100 rounded-full" />
      </div>

      {/* Module directory grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-slate-200 rounded-md" />
              <div className="h-3 w-48 bg-slate-100 rounded-md" />
            </div>
            <div className="w-4 h-4 bg-slate-100 rounded flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
