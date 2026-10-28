import { readFile } from "node:fs/promises";

import {
  entrar,
  enviar,
  estadoDelPanel,
  expect,
  FLUJO,
  RESPUESTAS,
  test,
} from "./fixtures";

// Flujo feliz (PLAN F8.2): acceso, necesidad, pregunta, v1 con faltan datos,
// respuesta, v2 suficiente, ajuste, v3, confirmar y exportar.

test("de la necesidad al requerimiento confirmado y exportado", async ({
  page,
}) => {
  await entrar(page);
  await expect(estadoDelPanel(page)).toHaveText(/Todavía no hay requerimiento/);

  await enviar(page, FLUJO.necesidad, RESPUESTAS.pregunta);
  await expect(estadoDelPanel(page)).toHaveAttribute(
    "data-estado",
    "sin_propuesta",
  );

  // v1: faltan las fuentes, y Confirmar dice por qué no se puede.
  await enviar(page, FLUJO.decision, RESPUESTAS.v1);
  await expect(estadoDelPanel(page)).toHaveAttribute(
    "data-estado",
    "faltan_datos",
  );
  await expect(estadoDelPanel(page)).toContainText(
    "No hay fuentes requeridas.",
  );
  const confirmar = page.getByRole("button", { name: "Confirmar" });
  await expect(confirmar).toBeDisabled();
  await expect(confirmar).toHaveAccessibleDescription(/^Faltan datos:/);
  await expect(page.getByText("Sin datos para:").first()).toBeVisible();

  // v2: con las fuentes, las reglas quedan cubiertas y se puede confirmar.
  await enviar(page, FLUJO.datos, RESPUESTAS.v2);
  await expect(estadoDelPanel(page)).toHaveText("Esperando confirmación");
  await expect(page.getByLabel("Versión")).toHaveValue("2");
  await expect(page.getByText("Sin datos para:")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Columnas de Reclamos del CRM" }),
  ).toContainText("fecha_hora");
  await expect(confirmar).toBeEnabled();

  // Ajuste: la intención viaja al servidor y produce v3, con el cambio marcado.
  await page.getByRole("button", { name: "Ajustar" }).click();
  await expect(
    page.getByRole("textbox", { name: /Ajuste de v2/ }),
  ).toBeFocused();
  const turno = page.waitForRequest("/api/interview");
  await enviar(page, FLUJO.ajuste, RESPUESTAS.v3);
  expect((await turno).postDataJSON()).toMatchObject({
    intencion: "ajuste",
    vigente: { version: 2 },
  });
  await expect(page.getByLabel("Versión")).toHaveValue("3");
  await expect(
    page.getByRole("heading", { name: /Alcance/ }).getByText("cambió"),
  ).toBeVisible();
  await expect(page.getByText("Teléfono, Chat, Email")).toBeVisible();

  // Confirmar.
  await confirmar.click();
  await expect(estadoDelPanel(page)).toHaveText("Confirmado · v3");
  await expect(page.getByRole("textbox")).toBeDisabled();

  // Exportar el requerimiento y la transcripción.
  await page.getByRole("button", { name: "Exportar" }).click();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("menuitem", { name: "Requerimiento v3 (contrato base)" })
      .click(),
  ]);
  expect(json.suggestedFilename()).toBe("trama-requerimiento-v3-base.json");
  const base = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(base.alcance.unidades).toEqual(["Teléfono", "Chat", "Email"]);
  expect(base.completitud).toBe("suficiente_para_confirmar");

  await page.getByRole("button", { name: "Exportar" }).click();
  const [md] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Transcripción (Markdown)" }).click(),
  ]);
  const transcripcion = await readFile((await md.path())!, "utf8");
  expect(transcripcion).toContain(FLUJO.necesidad);
  expect(transcripcion).toContain("**Confirmada la versión v3**");

  // Al recargar se conserva todo.
  await page.reload();
  await expect(estadoDelPanel(page)).toHaveText("Confirmado · v3");
  await expect(page.getByRole("log").getByText(FLUJO.ajuste)).toBeVisible();
  await page.getByLabel("Versión").selectOption("1");
  await expect(estadoDelPanel(page)).toContainText("v1 · reemplazada por v3");
});

test("el borrador sobrevive a una recarga", async ({ page }) => {
  await entrar(page);
  await page.getByRole("textbox").fill("Todavía lo estoy pensando");
  await page.reload();
  await expect(page.getByRole("textbox")).toHaveValue(
    "Todavía lo estoy pensando",
  );
});
