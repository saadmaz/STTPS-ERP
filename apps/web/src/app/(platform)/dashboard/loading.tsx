// Dashboard loading skeleton — mirrors the 8 KPI cards + Quick Actions + System Status layout.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-slate-200 rounded-lg" />
          <div className="h-4 w-52 bg-slate-100 rounded-md" />
        </div>
        <div className="h-4 w-40 bg-slate-100 rounded-md" />
      </div>

      {/* 8 KPI stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-28 bg-slate-100 rounded-md" />
                <div className="h-8 w-24 bg-slate-200 rounded-lg" />
                <div className="h-3 w-36 bg-slate-100 rounded-md" />
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl ml-3 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions + System Status row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions — spans 2 cols */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <div className="h-5 w-28 bg-slate-200 rounded-md mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="h-5 w-28 bg-slate-200 rounded-md mb-4" />
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-32 bg-slate-100 rounded-md" />
                <div className="h-5 w-16 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
