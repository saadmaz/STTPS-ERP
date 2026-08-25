// Procurement overview loading skeleton — mirrors 4 stat cards layout.
export default function ProcurementLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-slate-200 rounded-lg" />
          <div className="h-4 w-52 bg-slate-100 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="w-10 h-10 bg-slate-100 rounded-xl mb-3" />
            <div className="h-8 w-16 bg-slate-200 rounded-md mb-2" />
            <div className="h-4 w-36 bg-slate-100 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
