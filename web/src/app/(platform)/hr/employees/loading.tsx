// HR employees loading skeleton — mirrors page header + filter + table layout.
export default function EmployeesLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-slate-200 rounded-lg" />
          <div className="h-4 w-24 bg-slate-100 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-slate-100 rounded-lg" />
          <div className="h-9 w-32 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-8 gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          {["w-16", "w-28", "w-24", "w-20", "w-16", "w-20", "w-20", "w-14"].map((w, i) => (
            <div key={i} className={`h-3 ${w} bg-slate-200 rounded-md`} />
          ))}
        </div>
        {/* Rows */}
        {[...Array(7)].map((_, i) => (
          <div key={i} className="grid grid-cols-8 gap-3 px-4 py-3.5 border-b border-slate-100 items-center">
            <div className="h-4 w-14 bg-slate-100 rounded-md" />
            <div>
              <div className="h-4 w-28 bg-slate-200 rounded-md mb-1" />
              <div className="h-3 w-36 bg-slate-100 rounded-md" />
            </div>
            <div className="h-4 w-20 bg-slate-100 rounded-md" />
            <div className="h-4 w-20 bg-slate-100 rounded-md" />
            <div className="h-4 w-16 bg-slate-100 rounded-md" />
            <div className="h-4 w-20 bg-slate-100 rounded-md" />
            <div className="h-4 w-20 bg-slate-200 rounded-md font-mono" />
            <div className="h-5 w-14 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
