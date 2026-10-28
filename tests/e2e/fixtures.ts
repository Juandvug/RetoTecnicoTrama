import { createHash } from "node:crypto";

import { test as base, expect, type Page } from "@playwright/test";

import { CODIGO_E2E } from "./constants";

// Fixtures del e2e:
// - Cada test sale de su propia IP (x-real-ip, que el servidor lee fuera de
//   Vercel). Así los límites por IP y de intentos de acceso no se reparten
//   entre tests que corren en paralelo.
// - Ninguna request puede ir a un host que no sea el local: se corta y el test
//   falla al terminar (PLAN F8, criterios de aceptación).

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

function ipDelTest(id: string): string {
  const [a = 0, b = 0, c = 0] = createHash("sha256").update(id).digest();
  return `10.${a}.${b}.${(c % 250) + 1}`;
}

export const test = base.extend<{ externas: string[] }>({
  extraHTTPHeaders: async ({}, usar, testInfo) => {
    await usar({ "x-real-ip": ipDelTest(testInfo.testId) });
  },
  externas: [
    async ({ context }, usar) => {
      const externas: string[] = [];
      await context.route(
        (url) => !HOSTS_LOCALES.has(url.hostname),
        (route) => {
          externas.push(route.request().url());
          return route.abort("blockedbyclient");
        },
      );
      await usar(externas);
      expect(externas, "requests a hosts externos").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function entrar(page: Page) {
  await page.goto("/");
  await page.getByLabel("Código", { exact: true }).fill(CODIGO_E2E);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("log")).toBeVisible();
}

/** Escribe un mensaje, lo envía con Enter y espera la respuesta del agente. */
export async function enviar(
  page: Page,
  texto: string,
  respuesta: string | RegExp,
) {
  const composer = page.getByRole("textbox", {
    name: /Mensaje para el agente|Ajuste de/,
  });
  await composer.fill(texto);
  await composer.press("Enter");
  await expect(page.getByRole("log").getByText(respuesta)).toBeVisible();
}

export const estadoDelPanel = (page: Page) => page.locator("[data-estado]");

// Los mensajes del flujo feliz, en el orden en que los espera el escenario e2e
// (tests/fixtures/scenarios/e2e.json).
export const FLUJO = {
  necesidad: "Aumentaron los reclamos de clientes y no sé por qué.",
  decision:
    "Quiero decidir si refuerzo el soporte telefónico o el chat. Empezó en marzo de 2026.",
  datos:
    "Tenemos una exportación del CRM con canal, fecha y motivo de cada reclamo, y un Excel con los turnos del equipo de soporte.",
  ajuste: "Sumá también el email como canal.",
} as const;

export const RESPUESTAS = {
  pregunta: "¿Qué decisión querés tomar con esto, y desde cuándo lo notan?",
  v1: /Te dejé una primera versión/,
  v2: /Con eso alcanza/,
  v3: /agregué el email al alcance/,
} as const;
