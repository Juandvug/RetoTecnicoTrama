import type { Locator, Page } from "@playwright/test";

import { CODIGO_E2E } from "./constants";
import { expect, FLUJO, RESPUESTAS, test } from "./fixtures";

// El flujo completo solo con el teclado (PLAN F7, criterios de aceptación): sin
// un solo clic, del código de acceso a la exportación.

/** Avanza con Tab (o Shift+Tab) hasta que el foco llega al elemento. */
async function tabularHasta(page: Page, destino: Locator, atras = false) {
  for (let i = 0; i < 40; i++) {
    if (await destino.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(atras ? "Shift+Tab" : "Tab");
  }
  throw new Error(`El foco nunca llegó a ${destino}`);
}

async function escribirYEnviar(
  page: Page,
  texto: string,
  respuesta: string | RegExp,
) {
  await page.keyboard.type(texto);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("log").getByText(respuesta)).toBeVisible();
}

test("del acceso a la exportación sin usar el mouse", async ({ page }) => {
  await page.goto("/");
  // El campo del código tiene el foco al cargar.
  await expect(page.getByLabel("Código", { exact: true })).toBeFocused();
  await page.keyboard.type(CODIGO_E2E);
  await page.keyboard.press("Enter");

  const composer = page.getByRole("textbox", {
    name: /Mensaje para el agente|Ajuste de/,
  });
  await expect(page.getByRole("log")).toBeVisible();
  await tabularHasta(page, composer);
  await escribirYEnviar(page, FLUJO.necesidad, RESPUESTAS.pregunta);
  // Shift+Enter inserta un salto de línea sin enviar.
  await page.keyboard.type("Primera línea");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("segunda");
  await expect(composer).toHaveValue("Primera línea\nsegunda");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");

  await escribirYEnviar(page, FLUJO.decision, RESPUESTAS.v1);
  await escribirYEnviar(page, FLUJO.datos, RESPUESTAS.v2);

  // Ajustar devuelve el foco al composer.
  await tabularHasta(page, page.getByRole("button", { name: "Ajustar" }));
  await page.keyboard.press("Enter");
  await expect(composer).toBeFocused();
  await escribirYEnviar(page, FLUJO.ajuste, RESPUESTAS.v3);

  await tabularHasta(page, page.getByRole("button", { name: "Confirmar" }));
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-estado]")).toHaveText("Confirmado · v3");

  // El menú de exportación se abre y se recorre con las flechas.
  await tabularHasta(page, page.getByRole("button", { name: "Exportar" }));
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Transcripción (Markdown)" }),
  ).toBeFocused();
  // Radix termina de abrir el menú en el frame siguiente y puede perder la
  // primera flecha: se insiste hasta que el foco llega a la opción.
  const json = page.getByRole("menuitem", { name: "Requerimiento v3 (JSON)" });
  await expect(async () => {
    await page.keyboard.press("ArrowDown");
    await expect(json).toBeFocused({ timeout: 200 });
  }).toPass();
  const descarga = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await descarga).suggestedFilename()).toBe(
    "trama-requerimiento-v3.json",
  );

  // Reabrir también con el teclado.
  await tabularHasta(page, page.getByRole("button", { name: "Reabrir" }), true);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-estado]")).toHaveText(
    "Esperando confirmación",
  );
});
