import { describe, expect, it } from "vitest";

import { diffVersiones } from "@/domain/requirement";
import { unRequerimiento } from "@tests/fixtures/requerimientos";

const vacio = { agregados: [], quitados: [], modificados: [] };

describe("diffVersiones", () => {
  it("no informa cambios entre dos versiones iguales", () => {
    const diff = diffVersiones(unRequerimiento(), unRequerimiento());
    expect(diff.sinCambios).toBe(true);
    expect(diff.campos).toEqual([]);
  });

  it("informa elementos agregados, quitados y modificados", () => {
    const v2 = unRequerimiento((r) => {
      r.esquema.clases.push("Sede");
      r.esquema.relaciones.splice(1, 1); // quita reportaA
      r.reglas_candidatas[0]!.enunciado = "Otro enunciado";
      r.fuentes_requeridas[1]!.tipo = "excel";
      r.fuentes_requeridas[0]!.columnas_minimas.push({
        nombre: "sede",
        justifica: ["Sede"],
      });
      r.fuentes_requeridas[0]!.columnas_minimas[0]!.justifica.push("R2");
      r.preguntas_abiertas.shift();
    });
    const diff = diffVersiones(unRequerimiento(), v2);

    expect(diff.sinCambios).toBe(false);
    expect(diff.clases).toEqual({ ...vacio, agregados: ["Sede"] });
    expect(diff.relaciones).toEqual({ ...vacio, quitados: ["reportaA"] });
    expect(diff.reglas).toEqual({ ...vacio, modificados: ["R1"] });
    expect(diff.fuentes).toEqual({
      ...vacio,
      modificados: ["Asignación de turnos"],
    });
    expect(diff.columnas).toEqual({
      ...vacio,
      agregados: ["Nómina.sede"],
      modificados: ["Nómina.empleado_id"],
    });
    expect(diff.preguntas_abiertas.quitados).toHaveLength(1);
  });

  it("informa los campos escalares que cambiaron", () => {
    const v2 = unRequerimiento((r) => {
      r.alcance.periodo = null;
      r.alcance.unidades.push("Logística");
      r.completitud = "faltan_datos";
    });
    expect(diffVersiones(unRequerimiento(), v2).campos).toEqual([
      "alcance.periodo",
      "alcance.unidades",
      "completitud",
    ]);
  });

  it("detecta una relación que cambia de objeto con el mismo predicado", () => {
    const v2 = unRequerimiento((r) => {
      r.esquema.relaciones[0]!.objeto = "Supervisor";
    });
    expect(diffVersiones(unRequerimiento(), v2).relaciones.modificados).toEqual(
      ["asignadoA"],
    );
  });
});
