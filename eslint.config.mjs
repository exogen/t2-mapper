import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([".yalc", "dist", "generated"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
      ],
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-refresh/only-export-components": "warn",
      "react-hooks/immutability": "warn",
      "no-control-regex": "off",
    },
  },
  {
    // Layer boundary: src/components is the React/r3f layer. Everything
    // else in src is React-free and must not reach into it.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/**", "src/main.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/components/*"],
              message:
                "React-free code must not import from src/components; move the helper out of components instead.",
            },
          ],
        },
      ],
    },
  },
]);
