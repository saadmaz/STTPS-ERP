// Settings loading skeleton — mirrors tab bar + card sections layout.
export default function SettingsLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header (rendered by settings layout — skeleton only for content) */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-24 bg-slate-200 rounded-lg" />
          <div className="h-4 w-72 bg-slate-100 rounded-md" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-28 bg-slate-100 rounded-t-lg" />
        ))}
      </div>

      {/* Section title + count */}
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-1.5">
          <div className="h-5 w-24 bg-slate-200 rounded-md" />
          <div className="h-4 w-52 bg-slate-100 rounded-md" />
        </div>
        <div className="h-5 w-20 bg-slate-100 rounded-full" />
      </div>

      {/* Card grid (companies / roles) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 bg-slate-200 rounded-md" />
                <div className="h-3 w-20 bg-slate-100 rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-100 rounded-md" />
              <div className="h-3 w-4/5 bg-slate-100 rounded-md" />
              <div className="h-3 w-3/5 bg-slate-100 rounded-md" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between">
              <div className="h-5 w-14 bg-slate-100 rounded-full" />
              <div className="h-4 w-20 bg-slate-100 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="h-12 bg-blue-50 rounded-xl border border-blue-100" />
    </div>
  );
}
