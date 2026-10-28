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
      // PLAN F2: el Validation Engine es el núcleo del reto.
      thresholds: {
        // ADR-0008: al menos 80 % de líneas en el dominio y el servidor.
        "src/domain/**": { lines: 80 },
        "src/server/**": { lines: 80 },
        "src/domain/requirement/**": { lines: 90 },
      },
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
          setupFiles: ["./tests/support/jsdom.ts"],
          include: [
            "tests/**/features/**/*.test.{ts,tsx}",
            "tests/**/*.test.tsx",
          ],
        },
      },
    ],
  },
});
