import { defineConfig, devices } from "@playwright/test";

import { CODIGO_E2E, PUERTO_E2E } from "./tests/e2e/constants";

// E2E contra el build de producción con el LLM simulado (PLAN F8.1): sin red,
// sin key y con el limitador en memoria. En la CI el build ya está hecho; en
// local, `pnpm test:e2e` lo hace antes de arrancar.

const enCi = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: enCi,
  retries: enCi ? 1 : 0,
  workers: enCi ? 2 : undefined,
  reporter: enCi ? [["list"], ["html", { open: "never" }]] : "list",
  // Un turno que falla por timeout espera los reintentos de withRetry.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PUERTO_E2E}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${enCi ? "" : "pnpm build && "}pnpm start --port ${PUERTO_E2E}`,
    url: `http://localhost:${PUERTO_E2E}`,
    reuseExistingServer: !enCi,
    timeout: 180_000,
    env: {
      LLM_PROVIDER: "fake",
      FAKE_LLM_SCENARIO: "e2e",
      ACCESS_CODE: CODIGO_E2E,
      SESSION_SECRET: "e".repeat(48),
      // Bajo para que el test de rate limit no tenga que mandar 50 turnos.
      // Cada test usa su propia sesión y su propia IP, así que no se pisan.
      RATE_LIMIT_SESSION: "8",
    },
  },
});
