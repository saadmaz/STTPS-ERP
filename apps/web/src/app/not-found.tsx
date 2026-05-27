import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">STTPS</span>
        </div>

        {/* 404 Illustration */}
        <div className="mb-6">
          <p className="text-8xl font-extrabold text-blue-500 leading-none tracking-tighter select-none">
            404
          </p>
          <div className="mt-1 h-1 w-16 bg-blue-600 rounded-full mx-auto" />
        </div>

        {/* Message */}
        <h1 className="text-xl font-semibold text-white mb-2">
          Page not found
        </h1>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          <br />
          Head back to the dashboard to continue.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium
                       rounded-lg bg-blue-600 text-white hover:bg-blue-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
                       transition-colors duration-150 w-full sm:w-auto"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium
                       rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white border border-white/10
                       focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900
                       transition-colors duration-150 w-full sm:w-auto"
          >
            Back to Login
          </Link>
        </div>

        <p className="mt-10 text-xs text-slate-600">
          STTPS Enterprise ERP &mdash; v0.7.0
        </p>
      </div>
    </div>
  );
}
