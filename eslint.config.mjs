import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import nextConfig from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["docs/**", "generated/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
      ],
    },
  },
);
