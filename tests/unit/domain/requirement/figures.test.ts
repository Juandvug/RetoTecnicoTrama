import { describe, expect, it } from "vitest";

import { analizarRequerimiento, detectarCifras } from "@/domain/requirement";
import { corpus, unRequerimiento } from "@tests/fixtures/requerimientos";

const tipos = (texto: string, corpusUsuario: string[] = []) =>
  detectarCifras(texto, corpusUsuario).map((c) => [c.texto, c.tipo]);

describe("detectarCifras", () => {
  it.each([
    ["Bajó un 15 % este año", "15 %"],
    ["Bajó un 15% este año", "15%"],
    ["Bajó un 12,5% este año", "12,5%"],
    ["Bajó un 30 por ciento", "30 por ciento"],
  ])("detecta el porcentaje en %j", (texto, cifra) => {
    expect(tipos(texto)).toEqual([[cifra, "porcentaje"]]);
  });

  it.each([
    ["Se perdieron $1.500.000", "$1.500.000"],
    ["Se perdieron US$ 20", "US$ 20"],
    ["Se perdieron 300 USD", "300 USD"],
    ["Se perdieron 2.000 pesos", "2.000 pesos"],
    ["Se perdieron € 40", "€ 40"],
  ])("detecta el monto en %j", (texto, cifra) => {
    expect(tipos(texto)).toEqual([[cifra, "monto"]]);
  });

  it("detecta otros números", () => {
    expect(tipos("en los 60 días previos")).toEqual([["60", "numero"]]);
  });

  it.each([
    "La regla R1 y la versión v2",
    "La columna fecha_3 y el código ABC12",
    "Del 2026-03 al 2026-10-15",
  ])("no confunde identificadores ni fechas con cifras: %j", (texto) => {
    expect(tipos(texto)).toEqual([]);
  });

  it("ignora las cifras que el usuario aportó", () => {
    expect(tipos("Bajó un 15 %", ["Creo que bajó 15% este año"])).toEqual([]);
  });

  it("reconoce el mismo valor con otro separador", () => {
    expect(tipos("Perdimos $1500", ["perdimos 1.500 dólares"])).toEqual([]);
  });

  it("no da por aportado un porcentaje si el usuario dio ese número sin %", () => {
    expect(tipos("El 15 % de las salidas", ["Son 15 personas"])).toEqual([
      ["15 %", "porcentaje"],
    ]);
  });

  it("devuelve la posición de cada cifra", () => {
    expect(detectarCifras("ahora 15 %", [])[0]?.indice).toBe(6);
  });
});

describe("CIFRA_NO_APORTADA y UMBRAL_NO_CONFIRMADO", () => {
  const observaciones = (req: ReturnType<typeof unRequerimiento>) => {
    const a = analizarRequerimiento(req, corpus);
    return [...a.errores, ...a.advertencias].filter(
      (o) =>
        o.codigo === "CIFRA_NO_APORTADA" || o.codigo === "UMBRAL_NO_CONFIRMADO",
    );
  };

  it("es un error afirmar un porcentaje en la necesidad", () => {
    const req = unRequerimiento((r) => {
      r.necesidad =
        "Explicar por qué el 40% de las renuncias son de operaciones";
    });
    expect(observaciones(req)).toEqual([
      expect.objectContaining({
        codigo: "CIFRA_NO_APORTADA",
        severidad: "error",
        ruta: "necesidad",
      }),
    ]);
  });

  it("es un error afirmar un monto en la decisión", () => {
    const req = unRequerimiento((r) => {
      r.decision_objetivo = "Decidir cómo recuperar $2.000.000";
    });
    expect(observaciones(req)[0]).toMatchObject({
      codigo: "CIFRA_NO_APORTADA",
      ruta: "decision_objetivo",
    });
  });

  it("acepta una cifra que el usuario aportó", () => {
    const req = unRequerimiento((r) => {
      r.necesidad =
        "Explicar por qué el 40% de las renuncias son de operaciones";
    });
    const a = analizarRequerimiento(req, [
      ...corpus,
      "El 40% de las renuncias son de operaciones",
    ]);
    expect(a.errores).toEqual([]);
  });

  it("advierte sobre un umbral numérico que nadie confirmó", () => {
    const req = unRequerimiento((r) => {
      r.preguntas_abiertas = [r.preguntas_abiertas[0]!];
    });
    expect(observaciones(req)).toEqual([
      expect.objectContaining({
        codigo: "UMBRAL_NO_CONFIRMADO",
        severidad: "advertencia",
        ruta: "reglas_candidatas[0].enunciado",
      }),
    ]);
  });

  it("no advierte si el umbral está declarado como supuesto en preguntas_abiertas", () => {
    // El fixture declara los 60 días como pregunta abierta.
    expect(observaciones(unRequerimiento())).toEqual([]);
  });

  it("acepta un umbral porcentual declarado como supuesto", () => {
    const req = unRequerimiento((r) => {
      r.reglas_candidatas[0]!.enunciado =
        "Si más del 20 % de las Salidas de un Turno …";
      r.preguntas_abiertas.push("¿El 20 % es un umbral razonable?");
    });
    expect(observaciones(req)).toEqual([]);
  });

  it("es un error un umbral porcentual sin declarar", () => {
    const req = unRequerimiento((r) => {
      r.reglas_candidatas[0]!.enunciado =
        "Si más del 20 % de las Salidas de un Turno …";
    });
    expect(observaciones(req)).toEqual([
      expect.objectContaining({
        codigo: "CIFRA_NO_APORTADA",
        ruta: "reglas_candidatas[0].enunciado",
      }),
    ]);
  });

  it("es un error un porcentaje en una pregunta abierta que no es el umbral de ninguna regla", () => {
    const req = unRequerimiento((r) => {
      r.preguntas_abiertas.push(
        "¿Es cierto que el 35 % se va en el primer año?",
      );
    });
    expect(observaciones(req)).toEqual([
      expect.objectContaining({
        codigo: "CIFRA_NO_APORTADA",
        ruta: "preguntas_abiertas[2]",
      }),
    ]);
  });

  it("se puede omitir al revalidar una versión vigente", () => {
    const req = unRequerimiento((r) => {
      r.necesidad =
        "Explicar por qué el 40% de las renuncias son de operaciones";
    });
    expect(
      analizarRequerimiento(req, [], { verificarCifras: false }).errores,
    ).toEqual([]);
  });
});
