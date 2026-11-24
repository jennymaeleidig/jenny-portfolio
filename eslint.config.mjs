import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "vendor/**",
      "tmp/**",
      ".playwright-mcp/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["assets/**/*.js", "assets/**/*.mjs"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
