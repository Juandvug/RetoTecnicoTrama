import { describe, expect, it } from "vitest";

import { crearLogger } from "@/server/observability/logger";
import { CENTINELA, unReloj } from "@tests/fixtures/http";

function armar() {
  const lineas: string[] = [];
  const logger = crearLogger((l) => lineas.push(l), unReloj());
  const leidas = () =>
    lineas.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { logger, lineas, leidas };
}

describe("logger con lista blanca", () => {
  it("escribe una línea JSON por evento, con nivel y fecha", () => {
    const { logger, leidas } = armar();
    logger.info("turno", { fase: "pedir", llamadas: 2, cierre: false });
    expect(leidas()).toEqual([
      {
        nivel: "info",
        evento: "turno",
        en: "2026-10-28T12:00:00.000Z",
        fase: "pedir",
        llamadas: 2,
        cierre: false,
      },
    ]);
  });

  it("descarta los campos que no están en la lista blanca", () => {
    const { logger, lineas } = armar();
    logger.info("turno", {
      fase: "pedir",
      mensaje: CENTINELA,
      contenido: CENTINELA,
      authorization: CENTINELA,
    } as never);
    expect(lineas.join("\n")).not.toContain(CENTINELA);
    expect(JSON.parse(lineas[0]!)).toMatchObject({ fase: "pedir" });
  });

  it("descarta los valores que no son escalares", () => {
    const { logger, leidas } = armar();
    logger.info("turno", { fase: { anidado: CENTINELA } } as never);
    expect(leidas()[0]).not.toHaveProperty("fase");
  });

  it("acota el largo de los textos", () => {
    const { logger, leidas } = armar();
    logger.warn("x", { resultado: "a".repeat(500) });
    expect((leidas()[0]!.resultado as string).length).toBe(80);
  });

  it("recibe la telemetría del LLM con el mismo filtro", () => {
    const { logger, leidas } = armar();
    logger.registrar({
      evento: "llm",
      resultado: "ok",
      latenciaMs: 30,
      texto: CENTINELA,
    });
    expect(leidas()[0]).toEqual({
      nivel: "info",
      evento: "llm",
      en: "2026-10-28T12:00:00.000Z",
      resultado: "ok",
      latenciaMs: 30,
    });
  });

  it("tiene nivel de error", () => {
    const { logger, leidas } = armar();
    logger.error("turno", { status: 500 });
    expect(leidas()[0]).toMatchObject({ nivel: "error", status: 500 });
  });
});
