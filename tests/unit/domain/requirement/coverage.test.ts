import { describe, expect, it } from "vitest";

import { analizarRequerimiento } from "@/domain/requirement";
import { corpus, unRequerimiento } from "@tests/fixtures/requerimientos";

const analizar = (req: ReturnType<typeof unRequerimiento>) =>
  analizarRequerimiento(req, corpus);

describe("alimentación y cobertura", () => {
  it("registra qué columnas alimentan cada clase y predicado", () => {
    const { cobertura } = analizar(unRequerimiento());
    expect(cobertura.alimentacion["asignadoA"]).toEqual([
      "Asignación de turnos.empleado_id",
      "Asignación de turnos.turno_id",
      "Asignación de turnos.fecha_desde",
    ]);
    expect(cobertura.alimentacion["Supervisor"]).toEqual([
      "Nómina.supervisor_id",
    ]);
  });

  it("no cuenta las citas a reglas como alimentación", () => {
    const { cobertura } = analizar(unRequerimiento());
    expect(cobertura.alimentacion).not.toHaveProperty("R1");
  });

  it("marca cubiertas las reglas cuyos elementos tienen columnas", () => {
    const { cobertura } = analizar(unRequerimiento());
    expect(cobertura.reglas).toEqual({
      R1: { cubierta: true, faltantes: [] },
      R2: { cubierta: true, faltantes: [] },
    });
  });

  it("REGLA_SIN_COBERTURA: una regla que usa un predicado sin columnas", () => {
    const req = unRequerimiento((r) => {
      r.fuentes_requeridas[0]!.columnas_minimas[1]!.justifica = ["Supervisor"];
    });
    const a = analizar(req);
    expect(a.cobertura.reglas["R2"]).toEqual({
      cubierta: false,
      faltantes: ["reportaA"],
    });
    expect(a.advertencias).toContainEqual(
      expect.objectContaining({
        codigo: "REGLA_SIN_COBERTURA",
        ruta: "reglas_candidatas[1]",
        mensaje: "R2 no tiene columnas que alimenten: reportaA.",
      }),
    );
    expect(a.errores).toEqual([]);
  });

  describe("ELEMENTO_HUERFANO", () => {
    it("advierte sobre una clase que nada usa ni alimenta", () => {
      const req = unRequerimiento((r) => {
        r.esquema.clases.push("Sede");
      });
      expect(analizar(req).advertencias).toContainEqual(
        expect.objectContaining({
          codigo: "ELEMENTO_HUERFANO",
          ruta: "esquema.clases[4]",
        }),
      );
    });

    it("advierte sobre una relación que nada usa ni alimenta", () => {
      const req = unRequerimiento((r) => {
        r.esquema.relaciones.push({
          sujeto: "Supervisor",
          predicado: "supervisa",
          objeto: "Turno",
        });
      });
      expect(analizar(req).advertencias).toContainEqual(
        expect.objectContaining({
          codigo: "ELEMENTO_HUERFANO",
          ruta: "esquema.relaciones[3]",
        }),
      );
    });

    it("no advierte sobre un elemento que alguna columna alimenta, aunque ninguna regla lo use", () => {
      const req = unRequerimiento((r) => {
        r.esquema.clases.push("Sede");
        r.fuentes_requeridas[0]!.columnas_minimas.push({
          nombre: "sede",
          justifica: ["Sede"],
        });
      });
      expect(analizar(req).advertencias.map((o) => o.codigo)).not.toContain(
        "ELEMENTO_HUERFANO",
      );
    });
  });
});
