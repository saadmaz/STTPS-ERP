export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold mb-2">You&apos;re offline</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">This page needs a connection. Reconnect and try again.</p>
      </div>
    </div>
  );
}
