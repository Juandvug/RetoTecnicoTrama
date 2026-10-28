import { describe, expect, it } from "vitest";

import {
  canConfirm,
  LIMITE_MENSAJE_USUARIO,
  puedeEnviar,
  sesionVacia,
} from "@/domain/session";
import {
  aplicar,
  confirmar,
  enviar,
  fallar,
  sesionConfirmable,
  sesionConFaltanDatos,
} from "@tests/fixtures/sesiones";

describe("canConfirm", () => {
  it("permite confirmar una versión suficiente", () => {
    expect(canConfirm(sesionConfirmable())).toEqual({
      permitido: true,
      motivo: null,
    });
  });

  it.each([
    [
      "sin versión",
      () => sesionVacia(),
      "Todavía no hay un requerimiento para confirmar.",
    ],
    [
      "ya confirmada",
      () => aplicar(sesionConfirmable(), confirmar),
      "El requerimiento ya está confirmado.",
    ],
    [
      "con un turno en curso",
      () => aplicar(sesionConfirmable(), enviar("Hola", 3)),
      "Esperá a que el agente termine de responder.",
    ],
    [
      "con un mensaje fallido",
      () => aplicar(sesionConfirmable(), enviar("Hola", 3), fallar(3)),
      "Hay un mensaje que no se pudo enviar. Reintentalo o editalo antes de confirmar.",
    ],
    [
      "con faltan_datos",
      () => sesionConFaltanDatos(),
      "Faltan datos: El período no está definido.",
    ],
  ])("%s", (_, crear, motivo) => {
    expect(canConfirm(crear())).toEqual({ permitido: false, motivo });
  });

  it("explica que el agente marcó incompleto cuando no hay motivos del sistema", () => {
    const s = sesionConFaltanDatos();
    const v = s.versiones[0]!;
    const sinMotivos = {
      ...s,
      versiones: [{ ...v, analisis: { ...v.analisis, motivos: [] } }],
    };
    expect(canConfirm(sinMotivos).motivo).toBe(
      "El agente todavía marca el requerimiento como incompleto.",
    );
  });
});

describe("puedeEnviar", () => {
  it("permite enviar en una sesión libre", () => {
    expect(puedeEnviar(sesionVacia(), "Hola")).toEqual({
      permitido: true,
      motivo: null,
    });
  });

  it.each([
    [
      "sesión confirmada",
      () => aplicar(sesionConfirmable(), confirmar),
      "Hola",
    ],
    ["turno en curso", () => aplicar(sesionVacia(), enviar("Hola")), "Otro"],
    [
      "mensaje fallido",
      () => aplicar(sesionVacia(), enviar("Hola"), fallar()),
      "Otro",
    ],
    ["texto vacío", () => sesionVacia(), "   "],
    [
      "texto demasiado largo",
      () => sesionVacia(),
      "x".repeat(LIMITE_MENSAJE_USUARIO + 1),
    ],
  ])("rechaza con %s", (_, crear, texto) => {
    const permiso = puedeEnviar(crear(), texto);
    expect(permiso.permitido).toBe(false);
    expect(permiso.motivo).toEqual(expect.any(String));
  });

  it("acepta un mensaje justo en el límite", () => {
    expect(
      puedeEnviar(sesionVacia(), "x".repeat(LIMITE_MENSAJE_USUARIO)).permitido,
    ).toBe(true);
  });
});
