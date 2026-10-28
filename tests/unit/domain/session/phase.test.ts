import { describe, expect, it } from "vitest";

import {
  derivarFase,
  faseDeSesion,
  sesionVacia,
  type ResumenFase,
} from "@/domain/session";
import {
  aplicar,
  confirmar,
  enviar,
  sesionConfirmable,
  sesionConFaltanDatos,
  turno,
} from "@tests/fixtures/sesiones";

const resumen = (cambios: Partial<ResumenFase>): ResumenFase => ({
  completitudVigente: null,
  confirmada: false,
  mensajesUsuario: 1,
  turnosSinVersionNueva: 0,
  ...cambios,
});

// Tabla completa de ADR-0007, con los bordes de cada umbral.
describe("derivarFase (ADR-0007)", () => {
  it.each([
    // sin versión: delimitar hasta 2 mensajes, proponer desde 3
    [{ mensajesUsuario: 1 }, "delimitar", false],
    [{ mensajesUsuario: 2 }, "delimitar", false],
    [{ mensajesUsuario: 3 }, "proponer", false],
    [{ mensajesUsuario: 4 }, "proponer", false],
    // faltan_datos: pedir hasta 2 turnos sin versión nueva, cierre desde 3
    [
      { completitudVigente: "faltan_datos", turnosSinVersionNueva: 0 },
      "pedir",
      false,
    ],
    [
      { completitudVigente: "faltan_datos", turnosSinVersionNueva: 2 },
      "pedir",
      false,
    ],
    [
      { completitudVigente: "faltan_datos", turnosSinVersionNueva: 3 },
      "pedir",
      true,
    ],
    [
      { completitudVigente: "faltan_datos", turnosSinVersionNueva: 4 },
      "pedir",
      true,
    ],
    // suficiente: confirmar, sin importar los contadores
    [{ completitudVigente: "suficiente_para_confirmar" }, "confirmar", false],
    [
      {
        completitudVigente: "suficiente_para_confirmar",
        mensajesUsuario: 9,
        turnosSinVersionNueva: 9,
      },
      "confirmar",
      false,
    ],
    // confirmada: confirmado, gane lo que gane
    [
      { completitudVigente: "suficiente_para_confirmar", confirmada: true },
      "confirmado",
      false,
    ],
    [
      {
        completitudVigente: "faltan_datos",
        confirmada: true,
        turnosSinVersionNueva: 5,
      },
      "confirmado",
      false,
    ],
  ] as const)("%j → %s (cierre: %s)", (cambios, fase, cierre) => {
    expect(derivarFase(resumen(cambios as Partial<ResumenFase>))).toEqual({
      fase,
      cierre,
    });
  });

  it("respeta umbrales configurables", () => {
    const umbrales = { maxMensajesDelimitar: 2, maxTurnosSinVersion: 1 };
    expect(derivarFase(resumen({ mensajesUsuario: 2 }), umbrales).fase).toBe(
      "proponer",
    );
    expect(
      derivarFase(
        resumen({
          completitudVigente: "faltan_datos",
          turnosSinVersionNueva: 1,
        }),
        umbrales,
      ).cierre,
    ).toBe(true);
  });
});

describe("faseDeSesion", () => {
  it("recorre el flujo de una entrevista", () => {
    let s = sesionVacia();
    expect(faseDeSesion(s).fase).toBe("delimitar");

    s = turno(s, "Uno", 1);
    s = aplicar(s, enviar("Dos", 2));
    expect(faseDeSesion(s).fase).toBe("delimitar"); // 2 mensajes

    s = aplicar(s, {
      tipo: "turno_resuelto",
      turnId: "turno-2",
      mensajeId: "a2",
      mensaje: "?",
      propuesta: null,
      promptVersion: "p",
      en: "x",
    });
    s = aplicar(s, enviar("Tres", 3));
    expect(faseDeSesion(s).fase).toBe("proponer"); // 3 mensajes y sin versión

    expect(faseDeSesion(sesionConFaltanDatos()).fase).toBe("pedir");
    expect(faseDeSesion(sesionConfirmable()).fase).toBe("confirmar");
    expect(faseDeSesion(aplicar(sesionConfirmable(), confirmar)).fase).toBe(
      "confirmado",
    );
  });

  it("fuerza el cierre de pedir tras 3 turnos sin versión nueva", () => {
    let s = sesionConFaltanDatos();
    for (const n of [2, 3]) s = turno(s, `Pregunta ${n}`, n);
    expect(faseDeSesion(s)).toEqual({ fase: "pedir", cierre: false });
    s = turno(s, "Pregunta 4", 4);
    expect(faseDeSesion(s)).toEqual({ fase: "pedir", cierre: true });
  });
});
