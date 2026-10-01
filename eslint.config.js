import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/**/*.{js,mjs,cjs,jsx}",
    ],
    // Only the generated shadcn primitives are skipped. src/lib, src/hooks,
    // src/utils, App.jsx and main.jsx used to be outside the globs — so the
    // no-undef guard (which this config credits with catching a real crash)
    // never covered them.
    ignores: ["src/components/ui/**/*", "src/locales/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      // Spreading pluginJs.configs.recommended above sets `rules`, and this
      // block then REPLACES it wholesale — so no-undef was silently off.
      // esbuild does no scope checking either, which is how a missing
      // import (USER_STYLE_PREFIX) built clean and crashed the home screen
      // on a real device. Keep this on.
      "no-undef": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
      // Was never enabled; the eslint-disable comments referencing it
      // throughout the codebase were decorative. Warn, not error, so the
      // backlog can be worked down without blocking builds.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
