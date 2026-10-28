import { describe, expect, it } from "vitest";

import { analizarRequerimiento } from "@/domain/requirement";
import {
  corpus,
  FIXTURES,
  unRequerimiento,
} from "@tests/fixtures/requerimientos";

const analizar = (req: ReturnType<typeof unRequerimiento>) =>
  analizarRequerimiento(req, corpus);

describe("completitud efectiva", () => {
  it.each(Object.entries(FIXTURES))(
    "el fixture %s es suficiente para confirmar",
    (_, { requerimiento, corpus }) => {
      const a = analizarRequerimiento(requerimiento, corpus);
      expect(a.completitudEfectiva).toBe("suficiente_para_confirmar");
      expect(a.motivos).toEqual([]);
    },
  );

  it("nunca sube: faltan_datos declarado se respeta aunque la cobertura esté completa", () => {
    const req = unRequerimiento((r) => {
      r.completitud = "faltan_datos";
    });
    const a = analizar(req);
    expect(a.completitudEfectiva).toBe("faltan_datos");
    expect(a.motivos).toEqual([]);
  });

  it("baja a faltan_datos si una regla no tiene cobertura, y el motivo la nombra", () => {
    const req = unRequerimiento((r) => {
      r.fuentes_requeridas[0]!.columnas_minimas[1]!.justifica = ["Supervisor"];
    });
    const a = analizar(req);
    expect(req.completitud).toBe("suficiente_para_confirmar");
    expect(a.completitudEfectiva).toBe("faltan_datos");
    expect(a.motivos).toEqual(["R2 no tiene datos para: reportaA."]);
  });

  it.each([
    [
      "la decisión es null",
      (r: ReturnType<typeof unRequerimiento>) => {
        r.decision_objetivo = null;
      },
      "La decisión objetivo no está definida.",
      "decision_objetivo",
    ],
    [
      "el período es null",
      (r: ReturnType<typeof unRequerimiento>) => {
        r.alcance.periodo = null;
      },
      "El período no está definido.",
      "alcance.periodo",
    ],
    [
      "no hay reglas",
      (r: ReturnType<typeof unRequerimiento>) => {
        r.reglas_candidatas = [];
        r.fuentes_requeridas.forEach((f) => {
          f.justifica = f.justifica.filter((j) => !j.startsWith("R"));
          f.columnas_minimas.forEach((c) => {
            c.justifica = c.justifica.filter((j) => !/^R\d/.test(j));
          });
        });
        r.preguntas_abiertas = [r.preguntas_abiertas[0]!];
      },
      "No hay reglas candidatas.",
      "reglas_candidatas",
    ],
    [
      "no hay fuentes",
      (r: ReturnType<typeof unRequerimiento>) => {
        r.fuentes_requeridas = [];
      },
      "No hay fuentes requeridas.",
      "fuentes_requeridas",
    ],
  ])(
    "baja a faltan_datos cuando %s (DATO_SIN_DEFINIR)",
    (_, modificar, motivo, ruta) => {
      const a = analizar(unRequerimiento(modificar));
      expect(a.completitudEfectiva).toBe("faltan_datos");
      expect(a.motivos).toContain(motivo);
      expect(a.advertencias).toContainEqual(
        expect.objectContaining({ codigo: "DATO_SIN_DEFINIR", ruta }),
      );
    },
  );

  it("baja a faltan_datos si hay errores", () => {
    const req = unRequerimiento((r) => {
      r.esquema.relaciones[0]!.objeto = "Jefe";
    });
    const a = analizar(req);
    expect(a.completitudEfectiva).toBe("faltan_datos");
    expect(a.motivos).toContain(
      "El requerimiento tiene errores de validación.",
    );
  });
});
