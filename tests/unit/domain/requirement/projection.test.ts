import { describe, expect, it } from "vitest";

import {
  aContratoBase,
  ContratoBaseSchema,
  SIN_DEFINIR,
} from "@/domain/requirement";
import { FIXTURES, unRequerimiento } from "@tests/fixtures/requerimientos";

describe("aContratoBase", () => {
  it.each(Object.entries(FIXTURES))(
    "la proyección del fixture %s valida contra la forma base literal",
    (_, { requerimiento }) => {
      expect(
        ContratoBaseSchema.safeParse(aContratoBase(requerimiento)).success,
      ).toBe(true);
    },
  );

  it("convierte las columnas en nombres y une las justificaciones", () => {
    const base = aContratoBase(unRequerimiento());
    expect(base.fuentes_requeridas[0]).toEqual({
      nombre: "Nómina",
      tipo: "excel",
      columnas_minimas: [
        "empleado_id",
        "supervisor_id",
        "fecha_salida",
        "motivo_salida",
      ],
      justifica: [
        "Salida",
        "R1",
        "R2",
        "Empleado",
        "Supervisor",
        "reportaA",
        "registra",
      ],
    });
  });

  it("quita usa de las reglas", () => {
    expect(
      aContratoBase(unRequerimiento()).reglas_candidatas[0],
    ).not.toHaveProperty("usa");
  });

  it('serializa null como "sin definir"', () => {
    const req = unRequerimiento((r) => {
      r.decision_objetivo = null;
      r.alcance.periodo = null;
    });
    const base = aContratoBase(req);
    expect(base.decision_objetivo).toBe(SIN_DEFINIR);
    expect(base.alcance.periodo).toBe(SIN_DEFINIR);
    expect(ContratoBaseSchema.safeParse(base).success).toBe(true);
  });

  it("exporta la completitud efectiva cuando se la pasa", () => {
    expect(aContratoBase(unRequerimiento(), "faltan_datos").completitud).toBe(
      "faltan_datos",
    );
  });

  it("no comparte referencias con el requerimiento original", () => {
    const req = unRequerimiento();
    aContratoBase(req).esquema.clases.push("Otra");
    expect(req.esquema.clases).not.toContain("Otra");
  });
});
