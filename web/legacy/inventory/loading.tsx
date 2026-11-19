// Inventory overview loading skeleton — mirrors 3 stat cards + stock value card.
export default function InventoryLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-24 bg-slate-200 rounded-lg" />
          <div className="h-4 w-48 bg-slate-100 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl" />
            </div>
            <div className="h-8 w-16 bg-slate-200 rounded-md mb-2" />
            <div className="h-4 w-24 bg-slate-100 rounded-md" />
          </div>
        ))}
      </div>
      {/* Stock value card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="h-4 w-28 bg-slate-100 rounded-md mb-2" />
        <div className="h-9 w-44 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
