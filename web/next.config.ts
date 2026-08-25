import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone: a self-contained server with only the
  // node_modules it actually needs traced in. Passenger/cPanel deploys ship
  // this instead of the full node_modules tree.
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  },
};

export default nextConfig;
