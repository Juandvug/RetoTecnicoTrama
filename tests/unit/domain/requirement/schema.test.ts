import { describe, expect, it } from "vitest";

import { LIMITES, RequerimientoMotorSchema } from "@/domain/requirement";
import { FIXTURES, unRequerimiento } from "@tests/fixtures/requerimientos";

describe("RequerimientoMotorSchema", () => {
  it.each(Object.entries(FIXTURES))(
    "acepta el fixture %s",
    (_, { requerimiento }) => {
      expect(RequerimientoMotorSchema.safeParse(requerimiento).success).toBe(
        true,
      );
    },
  );

  it("acepta null en la decisión y el período (E4)", () => {
    const req = unRequerimiento((r) => {
      r.decision_objetivo = null;
      r.alcance.periodo = null;
    });
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(true);
  });

  it("rechaza campos que no están en el contrato", () => {
    const req = { ...unRequerimiento(), extra: true };
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(false);
  });

  it("rechaza columnas sin justificación (E1)", () => {
    const req = unRequerimiento((r) => {
      r.fuentes_requeridas[0]!.columnas_minimas[0]!.justifica = [];
    });
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(false);
  });

  it("rechaza un tipo de fuente que no es del enunciado", () => {
    const req = unRequerimiento() as unknown as {
      fuentes_requeridas: { tipo: string }[];
    };
    req.fuentes_requeridas[0]!.tipo = "json";
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(false);
  });

  it.each(["R1", "R9", "R12"])("acepta el id de regla %s", (id) => {
    const req = unRequerimiento((r) => {
      r.reglas_candidatas[0]!.id = id;
    });
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(true);
  });

  it.each(["R0", "r1", "R123", "Regla1"])("rechaza el id de regla %s", (id) => {
    const req = unRequerimiento((r) => {
      r.reglas_candidatas[0]!.id = id;
    });
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(false);
  });

  it("aplica los topes por lista (E5)", () => {
    const req = unRequerimiento((r) => {
      r.esquema.clases = Array.from(
        { length: LIMITES.clases + 1 },
        (_, i) => `Clase${i}`,
      );
    });
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(false);
  });

  it("rechaza textos más largos que el tope", () => {
    const req = unRequerimiento((r) => {
      r.necesidad = "x".repeat(LIMITES.texto + 1);
    });
    expect(RequerimientoMotorSchema.safeParse(req).success).toBe(false);
  });
});
