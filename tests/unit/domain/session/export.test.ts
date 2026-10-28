import { describe, expect, it } from "vitest";

import { exportarRequerimiento, exportarTranscripcion } from "@/domain/session";
import { ContratoBaseSchema } from "@/domain/requirement";
import {
  aplicar,
  confirmar,
  sesionConfirmable,
  turno,
} from "@tests/fixtures/sesiones";

describe("exportarTranscripcion", () => {
  it("coincide con el snapshot de una sesión confirmada", () => {
    let s = sesionConfirmable();
    s = aplicar(s, confirmar);
    expect(exportarTranscripcion(s)).toMatchSnapshot();
  });

  it("cita cada línea de un mensaje de varias líneas", () => {
    const s = turno(
      { ...sesionConfirmable(), mensajes: [], versiones: [] },
      "Primera línea\nSegunda línea",
      1,
    );
    expect(exportarTranscripcion(s)).toContain(
      "> Primera línea\n> Segunda línea",
    );
  });

  it("no inventa una confirmación", () => {
    expect(exportarTranscripcion(sesionConfirmable())).not.toContain(
      "Confirmada",
    );
  });
});

describe("exportarRequerimiento", () => {
  const v2 = () => sesionConfirmable().versiones[1]!;
  const v1 = () => sesionConfirmable().versiones[0]!;

  it("la forma extendida es el requerimiento tal cual", () => {
    expect(JSON.parse(exportarRequerimiento(v2(), "extendida"))).toEqual(
      v2().requerimiento,
    );
  });

  it("la forma base valida contra el contrato del enunciado", () => {
    const base = JSON.parse(exportarRequerimiento(v2(), "base"));
    expect(ContratoBaseSchema.safeParse(base).success).toBe(true);
    // En la forma base las columnas son nombres, no objetos.
    expect(base.fuentes_requeridas[0].columnas_minimas[0]).toBe("empleado_id");
  });

  it("la forma base lleva la completitud efectiva y sin definir para null", () => {
    const base = JSON.parse(exportarRequerimiento(v1(), "base"));
    expect(base.completitud).toBe("faltan_datos");
    expect(base.alcance.periodo).toBe("sin definir");
  });

  it("termina con un salto de línea", () => {
    expect(exportarRequerimiento(v2(), "base").endsWith("}\n")).toBe(true);
  });
});
