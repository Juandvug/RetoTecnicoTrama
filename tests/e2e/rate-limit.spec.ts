import { randomUUID } from "node:crypto";

import { entrar, expect, test } from "./fixtures";

// Rate limit (PLAN F8.2): el servidor del e2e permite 8 turnos por sesión. Los
// primeros 8 se gastan por la API, con la cookie del navegador, y el noveno sale
// de la UI: el mensaje queda en pantalla con la cuenta regresiva.

test("al pasar el límite de la sesión, Reintentar espera el Retry-After", async ({
  page,
  baseURL,
}) => {
  await entrar(page);

  for (let i = 1; i <= 8; i++) {
    const respuesta = await page.request.post("/api/interview", {
      headers: { Origin: baseURL! },
      data: {
        turnId: randomUUID(),
        mensajes: [{ rol: "user", contenido: `Mensaje ${i}` }],
        vigente: null,
        resumen: { mensajesUsuario: 1, turnosSinVersionNueva: 0 },
        intencion: "mensaje",
      },
    });
    expect(respuesta.status(), `turno ${i}`).toBe(200);
  }

  const composer = page.getByRole("textbox");
  await composer.fill("Uno más");
  const respuesta = page.waitForResponse("/api/interview");
  await composer.press("Enter");
  expect((await respuesta).status()).toBe(429);
  expect(Number((await respuesta).headers()["retry-after"])).toBeGreaterThan(0);

  const log = page.getByRole("log");
  await expect(
    log.getByText("Hiciste muchas solicitudes", { exact: false }),
  ).toBeVisible();
  await expect(log.getByText("Uno más")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Reintentar en / }),
  ).toBeDisabled();
});
