import {
  entrar,
  enviar,
  estadoDelPanel,
  expect,
  FLUJO,
  RESPUESTAS,
  test,
} from "./fixtures";

// Pantalla angosta (PLAN F7.6, F8.2): por debajo de md, Chat y Requerimiento
// son pestañas, y la del panel avisa con texto que llegó una versión nueva.

test.use({ viewport: { width: 390, height: 844 } });

test("Chat y Requerimiento son pestañas con aviso de versión nueva", async ({
  page,
}) => {
  await entrar(page);
  const chat = page.getByRole("tab", { name: "Chat" });
  const requerimiento = page.getByRole("tab", { name: /^Requerimiento/ });
  await expect(chat).toHaveAttribute("aria-selected", "true");
  await expect(estadoDelPanel(page)).toBeHidden();

  await enviar(page, FLUJO.necesidad, RESPUESTAS.pregunta);
  await expect(requerimiento).toHaveText("Requerimiento");
  await enviar(page, FLUJO.decision, RESPUESTAS.v1);
  await expect(requerimiento).toContainText("nueva versión");

  await requerimiento.click();
  await expect(estadoDelPanel(page)).toBeVisible();
  await expect(estadoDelPanel(page)).toContainText("Faltan datos");
  await expect(page.getByRole("log")).toBeHidden();
  await expect(requerimiento).toHaveText("Requerimiento");

  await chat.click();
  await expect(page.getByRole("log")).toBeVisible();
  // Nada se desborda a lo ancho.
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(390);
});
