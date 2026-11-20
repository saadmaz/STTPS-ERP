import type { MetadataRoute } from "next";

/**
 * Blueprint §37: makes the existing responsive staff app installable as a
 * PWA. Deliberately not a separate mobile app or a rebuild of any screen —
 * warehouse scanning and driver flows (Phase 5) were already built
 * phone-width-first; this is just the installability/offline wrapper.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STTPS ERP",
    short_name: "STTPS",
    description: "Enterprise Resource Planning Platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
