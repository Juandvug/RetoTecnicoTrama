import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validarArgumentos } from "@/domain/requirement";
import { EscenarioSchema } from "@/server/llm/fake/scenarios";
import { NOMBRE_TOOL } from "@/server/interview/tools";

// El escenario del e2e (tests/fixtures/scenarios/e2e.json) tiene que producir
// versiones válidas con la completitud que espera el flujo feliz: si alguien lo
// edita y rompe una invariante, falla acá y no en un e2e lento de depurar.

const escenario = EscenarioSchema.parse(
  JSON.parse(readFileSync("tests/fixtures/scenarios/e2e.json", "utf8")),
);
if (Array.isArray(escenario))
  throw new Error("El escenario e2e es conversacional.");

// Los mensajes que escribe el e2e, en orden: el corpus del usuario crece con ellos.
const MENSAJES = [
  "Aumentaron los reclamos de clientes y no sé por qué.",
  "Quiero decidir si refuerzo el soporte telefónico o el chat. Empezó en marzo de 2026.",
  "Tenemos una exportación del CRM con canal, fecha y motivo de cada reclamo, y un Excel con los turnos del equipo de soporte.",
  "Sumá también el email como canal.",
];

const turnoDe = (mensaje: string) =>
  escenario.turnos.find((t) =>
    mensaje.toLowerCase().includes(t.cuando.toLowerCase()),
  );

describe("escenario e2e", () => {
  it("cada mensaje del flujo feliz tiene su turno", () => {
    for (const mensaje of MENSAJES)
      expect(turnoDe(mensaje), mensaje).toBeDefined();
  });

  it.each([
    [1, "faltan_datos"],
    [2, "suficiente_para_confirmar"],
    [3, "suficiente_para_confirmar"],
  ] as const)(
    "el mensaje %i registra una versión válida con %s",
    (i, completitud) => {
      const paso = turnoDe(MENSAJES[i]!)!.pasos[0]!;
      if (!("llamada" in paso))
        throw new Error("El primer paso tiene que registrar.");
      expect(paso.llamada.nombre).toBe(NOMBRE_TOOL);

      const resultado = validarArgumentos(
        JSON.stringify(paso.llamada.argumentos),
        MENSAJES.slice(0, i + 1),
      );
      if (!resultado.ok)
        throw new Error(JSON.stringify(resultado.errores, null, 2));
      expect(resultado.analisis.completitudEfectiva).toBe(completitud);
    },
  );

  it("ningún texto del agente tiene dígitos (la guarda de cifras lo corregiría)", () => {
    const textos = [
      ...escenario.turnos.flatMap((t) => t.pasos),
      ...escenario.porDefecto,
    ].flatMap((p) => ("texto" in p ? [p.texto] : []));
    expect(textos.length).toBeGreaterThan(0);
    for (const texto of textos) expect(texto).not.toMatch(/\d/);
  });
});
