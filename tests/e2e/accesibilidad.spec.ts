import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { entrar, enviar, expect, FLUJO, RESPUESTAS, test } from "./fixtures";

// Revisión de accesibilidad con axe (PLAN F8.3), en claro y en oscuro: ninguna
// violación serious ni critical en la pantalla de acceso ni en el workspace con
// una versión que falta completar y con una suficiente.

async function violacionesGraves(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      regla: v.id,
      nodos: v.nodes.map((n) => n.target.join(" ")),
    }));
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`tema ${tema === "light" ? "claro" : "oscuro"}`, () => {
    test.use({ colorScheme: tema });

    test("sin violaciones graves de axe", async ({ page }) => {
      await page.goto("/");
      // next-themes sigue al sistema: la clase .dark refleja el esquema emulado.
      await expect(page.locator("html")).toHaveClass(
        tema === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/,
      );
      expect(await violacionesGraves(page), "pantalla de acceso").toEqual([]);

      await entrar(page);
      expect(await violacionesGraves(page), "workspace vacío").toEqual([]);

      await enviar(page, FLUJO.necesidad, RESPUESTAS.pregunta);
      await enviar(page, FLUJO.decision, RESPUESTAS.v1);
      expect(await violacionesGraves(page), "v1 con faltan datos").toEqual([]);

      await enviar(page, FLUJO.datos, RESPUESTAS.v2);
      await page.getByRole("button", { name: "Confirmar" }).click();
      expect(await violacionesGraves(page), "confirmado").toEqual([]);

      await page.getByLabel("Versión").selectOption("1");
      expect(await violacionesGraves(page), "versión anterior").toEqual([]);
    });
  });
}
