import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ruta = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": ruta("./src"),
      "@tests": ruta("./tests"),
      // server-only lanza un error fuera de React Server Components; en los
      // tests de Node se reemplaza por un módulo vacío.
      "server-only": ruta("./tests/support/server-only.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/components/ui/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/{unit,integration,contract}/**/*.test.ts"],
          exclude: ["tests/**/features/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "tests/**/features/**/*.test.{ts,tsx}",
            "tests/**/*.test.tsx",
          ],
        },
      },
    ],
  },
});
