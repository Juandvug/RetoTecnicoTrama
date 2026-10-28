import { describe, expect, it } from "vitest";

import { textoDeRespaldo } from "@/server/interview/fallbacks";
import { INSTRUCCIONES, politicaDeTurno } from "@/server/interview/policy";
import {
  definicionDeLaTool,
  NOMBRE_TOOL,
  resultadoInvalido,
  resultadoValido,
} from "@/server/interview/tools";
import { analizarRequerimiento } from "@/domain/requirement";
import { corpus, unRequerimiento } from "@tests/fixtures/requerimientos";

const FORZADA = { name: "registrar_requerimiento" };

// Tabla de ARCHITECTURE §9 / ADR-0007.
describe("politicaDeTurno", () => {
  it.each([
    ["delimitar", false, "auto", INSTRUCCIONES.delimitar],
    ["proponer", false, FORZADA, INSTRUCCIONES.proponer],
    ["pedir", false, "auto", INSTRUCCIONES.pedir],
    ["pedir", true, FORZADA, INSTRUCCIONES.pedirCierre],
    ["confirmar", false, "auto", INSTRUCCIONES.confirmar],
  ] as const)(
    "%s (cierre: %s) → toolChoice %j",
    (fase, cierre, toolChoice, instruccion) => {
      expect(politicaDeTurno(fase, cierre, "mensaje")).toEqual({
        toolChoice,
        instruccionDeFase: instruccion,
      });
    },
  );

  it("en confirmar la instrucción prohíbe hacer preguntas nuevas", () => {
    expect(INSTRUCCIONES.confirmar).toMatch(/No hagas preguntas nuevas/);
  });

  it("en el cierre de pedir la instrucción prohíbe seguir preguntando", () => {
    expect(INSTRUCCIONES.pedirCierre).toMatch(/No hagas más preguntas/);
  });

  it.each([
    ["delimitar", false],
    ["proponer", false],
    ["pedir", false],
    ["pedir", true],
    ["confirmar", false],
  ] as const)(
    "el ajuste en %s (cierre: %s) agrega la instrucción y no cambia el toolChoice",
    (fase, cierre) => {
      const sin = politicaDeTurno(fase, cierre, "mensaje");
      const con = politicaDeTurno(fase, cierre, "ajuste");
      expect(con.toolChoice).toEqual(sin.toolChoice);
      expect(con.instruccionDeFase).toBe(
        `${sin.instruccionDeFase} ${INSTRUCCIONES.ajuste}`,
      );
    },
  );
});

describe("la tool registrar_requerimiento", () => {
  it("se define con los parámetros del mismo esquema que valida", () => {
    const tool = definicionDeLaTool();
    expect(tool.name).toBe(NOMBRE_TOOL);
    expect(tool.description).toMatch(/enviá siempre el requerimiento entero/);
    expect(tool.parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: expect.arrayContaining(["necesidad", "esquema", "completitud"]),
    });
  });

  it("el resultado válido lleva la versión, la completitud efectiva, los motivos y las observaciones", () => {
    const req = unRequerimiento((r) => {
      r.fuentes_requeridas[0]!.columnas_minimas[1]!.justifica = ["Supervisor"];
      r.esquema.clases.push("Sede");
    });
    const resultado = JSON.parse(
      resultadoValido(3, analizarRequerimiento(req, corpus)),
    );
    expect(resultado).toEqual({
      ok: true,
      version: 3,
      completitud_efectiva: "faltan_datos",
      motivos: ["R2 no tiene datos para: reportaA."],
      observaciones: [
        "R2 no tiene columnas que alimenten: reportaA.",
        "La clase Sede no la usa ninguna regla ni la alimenta ninguna columna. Puede sobrar.",
      ],
    });
  });

  it("el resultado inválido lleva ruta, código y mensaje de cada error", () => {
    const req = unRequerimiento((r) => {
      r.esquema.relaciones[1]!.objeto = "Jefe";
    });
    const a = analizarRequerimiento(req, corpus);
    expect(JSON.parse(resultadoInvalido(a.errores))).toEqual({
      ok: false,
      errores: [
        {
          ruta: "esquema.relaciones[1].objeto",
          codigo: "CLASE_INEXISTENTE",
          mensaje: '"Jefe" no está en esquema.clases.',
        },
      ],
    });
  });

  it("el resultado inválido puede llevar una instrucción", () => {
    expect(
      JSON.parse(resultadoInvalido([], "Preguntale al usuario.")),
    ).toMatchObject({
      instruccion: "Preguntale al usuario.",
    });
  });
});

describe("textoDeRespaldo", () => {
  it.each(["delimitar", "proponer", "pedir", "confirmar"] as const)(
    "sin propuesta, en %s, hay un texto",
    (fase) => {
      expect(textoDeRespaldo(fase, null).length).toBeGreaterThan(20);
    },
  );

  it("con propuesta, distingue si alcanza o si faltan datos", () => {
    const alcanza = textoDeRespaldo("pedir", {
      completitud: "suficiente_para_confirmar",
    });
    const faltan = textoDeRespaldo("pedir", { completitud: "faltan_datos" });
    expect(alcanza).toMatch(/confirmala/);
    expect(faltan).toMatch(/faltan datos/);
  });

  it("nunca incluye una cifra", () => {
    for (const fase of [
      "delimitar",
      "proponer",
      "pedir",
      "confirmar",
    ] as const) {
      expect(textoDeRespaldo(fase, null)).not.toMatch(/\d/);
    }
  });
});
