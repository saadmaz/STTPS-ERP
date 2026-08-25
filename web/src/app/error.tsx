"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service in production
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ width: "100%", maxWidth: "28rem", textAlign: "center" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", marginBottom: "2.5rem" }}>
              <div
                style={{
                  width: "2.5rem",
                  height: "2.5rem",
                  background: "#2563eb",
                  borderRadius: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "white", fontWeight: "700", fontSize: "1.125rem" }}>S</span>
              </div>
              <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "white", letterSpacing: "-0.025em" }}>
                STTPS
              </span>
            </div>

            {/* Error code */}
            <p style={{ fontSize: "5rem", fontWeight: "800", color: "#ef4444", lineHeight: 1, letterSpacing: "-0.05em", userSelect: "none" }}>
              500
            </p>
            <div style={{ marginTop: "0.25rem", height: "4px", width: "4rem", background: "#ef4444", borderRadius: "9999px", margin: "0.25rem auto 0" }} />

            {/* Message */}
            <h1 style={{ fontSize: "1.25rem", fontWeight: "600", color: "white", marginTop: "1.5rem", marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "2rem", lineHeight: "1.6" }}>
              An unexpected error occurred. Our team has been notified.
              <br />
              You can try again or return to the dashboard.
            </p>

            {/* Digest */}
            {error.digest && (
              <p style={{ fontSize: "0.7rem", color: "#475569", marginBottom: "1.5rem", fontFamily: "monospace" }}>
                Error ID: {error.digest}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
              <button
                onClick={reset}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  borderRadius: "0.5rem",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  maxWidth: "200px",
                }}
              >
                Try again
              </button>
              <Link
                href="/dashboard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  borderRadius: "0.5rem",
                  background: "rgba(255,255,255,0.1)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(255,255,255,0.1)",
                  textDecoration: "none",
                  width: "100%",
                  maxWidth: "200px",
                }}
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
