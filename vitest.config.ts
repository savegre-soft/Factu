import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // `e2e/` son specs de Playwright (requieren su propio test runner, no Vitest);
    // se agrega a los excludes por defecto en vez de reemplazarlos.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
