import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

// SWC keeps NestJS decorator metadata, which esbuild drops.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
    // Tests share one emulator; run files serially and isolate by tenant id.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
