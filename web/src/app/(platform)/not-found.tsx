"use client";

import Link from "next/link";
import { FileQuestion, ArrowLeft, LayoutDashboard } from "lucide-react";

export default function PlatformNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      {/* Icon */}
      <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
        <FileQuestion size={36} className="text-slate-400" />
      </div>

      {/* Code */}
      <p className="text-6xl font-extrabold text-slate-200 leading-none tracking-tighter select-none mb-1">
        404
      </p>

      {/* Message */}
      <h1 className="text-xl font-semibold text-slate-800 mt-3 mb-2">
        Page not found
      </h1>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-8">
        This page doesn&apos;t exist or may have been moved. Use the sidebar to
        navigate to the module you need.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          href="/dashboard"
          className="btn-primary gap-2"
        >
          <LayoutDashboard size={15} />
          Go to Dashboard
        </Link>
        <button
          onClick={() => window.history.back()}
          className="btn-secondary gap-2"
        >
          <ArrowLeft size={15} />
          Go Back
        </button>
      </div>

      {/* Divider hint */}
      <div className="mt-10 pt-6 border-t border-slate-200 w-full max-w-xs">
        <p className="text-xs text-slate-400">
          Use the left sidebar to explore all ERP modules
        </p>
      </div>
    </div>
  );
}
