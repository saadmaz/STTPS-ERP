// EHS overview loading skeleton — mirrors 4 stat cards + 2 detail cards layout.
export default function EhsLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-200 rounded-lg" />
          <div className="h-4 w-52 bg-slate-100 rounded-md" />
        </div>
        <div className="h-9 w-36 bg-slate-200 rounded-lg" />
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="w-10 h-10 bg-slate-100 rounded-xl mb-3" />
            <div className="h-8 w-12 bg-slate-200 rounded-md mb-1.5" />
            <div className="h-4 w-28 bg-slate-100 rounded-md" />
            <div className="h-3 w-20 bg-slate-100 rounded-md mt-1" />
          </div>
        ))}
      </div>

      {/* 2 detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="h-5 w-40 bg-slate-200 rounded-md mb-4" />
            <div className="space-y-3">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center justify-between py-1">
                  <div className="h-5 w-16 bg-slate-100 rounded-full" />
                  <div className="h-5 w-8 bg-slate-200 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
