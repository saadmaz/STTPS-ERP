// ESLint configuration: Next.js core web vitals and TypeScript rules.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", ".open-next/**", ".wrangler/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Warn rather than fail: remaining uses are in screens for modules still
      // being ported, and are typed as each module moves to the new API.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default config;
