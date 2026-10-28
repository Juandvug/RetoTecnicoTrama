import { entrar, expect, test } from "./fixtures";

// Error y reintento (PLAN F8.2): el fake falla por timeout los tres intentos de
// transporte del primer envío (con los reintentos de withRetry), el turno
// responde 504 y el mensaje queda en pantalla. Reintentar lo reenvía.

test("un turno que falla por timeout conserva el mensaje y se reintenta", async ({
  page,
}, testInfo) => {
  await entrar(page);
  // Texto único: el fake falla una sola vez por texto exacto.
  const texto = `Probemos un corte falla-una-vez ${testInfo.testId}`;
  const composer = page.getByRole("textbox");
  await composer.fill(texto);
  const envio = page.waitForRequest("/api/interview");
  await composer.press("Enter");
  const turnId = (await envio).postDataJSON().turnId;

  const log = page.getByRole("log");
  await expect(log.getByText("No se pudo enviar")).toBeVisible();
  await expect(log.getByText(texto)).toBeVisible();
  await expect(composer).toHaveValue("");

  const reenvio = page.waitForRequest("/api/interview");
  await page.getByRole("button", { name: "Reintentar" }).click();
  expect((await reenvio).postDataJSON().turnId).toBe(turnId);
  await expect(log.getByText("Ahora sí llegó tu mensaje.")).toBeVisible();
  await expect(log.getByText("No se pudo enviar")).toHaveCount(0);
  // Un solo mensaje del usuario: el reintento no lo duplica.
  await expect(log.getByText(texto)).toHaveCount(1);
});

test("Editar devuelve el texto fallido al composer", async ({
  page,
}, testInfo) => {
  await entrar(page);
  const texto = `Otro corte falla-una-vez ${testInfo.testId}`;
  const composer = page.getByRole("textbox");
  await composer.fill(texto);
  await composer.press("Enter");

  await page.getByRole("button", { name: "Editar" }).click();
  await expect(composer).toHaveValue(texto);
  await expect(page.getByRole("log").getByText(texto)).toHaveCount(0);
});
