// ESLint configuration for the STTPS ERP API (NestJS).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "legacy", ".wrangler"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // NestJS uses empty classes and decorators extensively.
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Warn rather than fail: most remaining uses are in modules still being
      // ported from Prisma to Firestore and are typed as each module moves.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
