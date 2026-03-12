import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import nextConfig from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: [".yalc/**", "docs/**", "generated/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  ...nextConfig,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
      ],
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
