"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PlatformError]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      {/* Icon */}
      <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
        <AlertTriangle size={36} className="text-red-400" />
      </div>

      {/* Message */}
      <h1 className="text-xl font-semibold text-slate-800 mb-2">
        Something went wrong
      </h1>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-4">
        An unexpected error occurred while loading this page.
        This has been logged and our team will look into it.
      </p>

      {/* Error digest */}
      {error.digest && (
        <p className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg mb-6">
          Error ID: {error.digest}
        </p>
      )}

      {/* Dev message (only shown in development) */}
      {process.env.NODE_ENV === "development" && error.message && (
        <div className="w-full max-w-md mb-6 text-left bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-700 mb-1">Dev Error Message:</p>
          <p className="text-xs font-mono text-red-600 break-all leading-relaxed">
            {error.message}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={reset}
          className="btn-primary gap-2"
        >
          <RotateCcw size={14} />
          Try again
        </button>
        <Link
          href="/dashboard"
          className="btn-secondary gap-2"
        >
          <LayoutDashboard size={14} />
          Go to Dashboard
        </Link>
      </div>

      {/* Divider */}
      <div className="mt-10 pt-6 border-t border-slate-200 w-full max-w-xs">
        <p className="text-xs text-slate-400">
          If this keeps happening, please contact your system administrator
        </p>
      </div>
    </div>
  );
}
