import { describe, expect, it } from "vitest";

import { hidratarSesion, sesionVacia } from "@/domain/session";
import { aplicar, enviar, sesionConfirmable } from "@tests/fixtures/sesiones";

describe("hidratarSesion", () => {
  it("sin nada guardado devuelve una sesión vacía y sin aviso", () => {
    expect(hidratarSesion(null)).toEqual({
      sesion: sesionVacia(),
      aviso: null,
    });
  });

  it("recupera la sesión, las versiones y el borrador de un JSON guardado", () => {
    const original = aplicar(sesionConfirmable(), {
      tipo: "borrador_actualizado",
      texto: "a medio escribir",
    });
    const { sesion, aviso } = hidratarSesion(JSON.stringify(original));
    expect(aviso).toBeNull();
    expect(sesion).toEqual(original);
    expect(sesion.versiones).toHaveLength(2);
    expect(sesion.borrador).toBe("a medio escribir");
  });

  it.each([
    ["JSON corrupto", "{no es json"],
    ["un valor que no es una sesión", JSON.stringify({ hola: "mundo" })],
    ["un array", "[]"],
    [
      "un campo con el tipo equivocado",
      JSON.stringify({ ...sesionVacia(), mensajes: "no" }),
    ],
  ])("descarta %s y avisa", (_, guardado) => {
    expect(hidratarSesion(guardado)).toEqual({
      sesion: sesionVacia(),
      aviso: "invalida",
    });
  });

  it("descarta una sesión de otra schemaVersion y avisa", () => {
    const guardado = JSON.stringify({ ...sesionVacia(), schemaVersion: 2 });
    expect(hidratarSesion(guardado)).toEqual({
      sesion: sesionVacia(),
      aviso: "version_distinta",
    });
  });

  it("descarta una sesión con versiones desordenadas", () => {
    const s = sesionConfirmable();
    const guardado = { ...s, versiones: [s.versiones[1]!, s.versiones[0]!] };
    expect(hidratarSesion(guardado).aviso).toBe("invalida");
  });

  it("descarta una confirmación de una versión que no existe", () => {
    const guardado = {
      ...sesionConfirmable(),
      confirmacion: { version: 7, en: "x" },
    };
    expect(hidratarSesion(guardado).aviso).toBe("invalida");
  });

  it("recalcula el análisis en lugar de confiar en el guardado", () => {
    const s = sesionConfirmable();
    const v = s.versiones[1]!;
    // Alguien edita el JSON para forzar la suficiencia de una versión con huecos.
    const manipulada = {
      ...s,
      versiones: [
        s.versiones[0]!,
        {
          ...v,
          requerimiento: {
            ...v.requerimiento,
            alcance: { ...v.requerimiento.alcance, periodo: null },
          },
        },
      ],
    };
    const { sesion } = hidratarSesion(manipulada);
    expect(sesion.versiones[1]?.analisis.completitudEfectiva).toBe(
      "faltan_datos",
    );
  });

  it("descarta una versión cuyo requerimiento rompe una invariante", () => {
    const s = sesionConfirmable();
    const v = s.versiones[1]!;
    const rota = {
      ...s,
      versiones: [
        s.versiones[0]!,
        {
          ...v,
          requerimiento: {
            ...v.requerimiento,
            esquema: {
              ...v.requerimiento.esquema,
              relaciones: [
                { sujeto: "Empleado", predicado: "x", objeto: "Fantasma" },
              ],
            },
          },
        },
      ],
    };
    expect(hidratarSesion(rota).aviso).toBe("invalida");
  });

  it("deja como fallido y reintentable un turno que la recarga interrumpió", () => {
    const enCurso = aplicar(sesionVacia(), enviar("Hola"));
    expect(enCurso.turnoEnCurso).toBe("turno-1");

    const { sesion } = hidratarSesion(JSON.stringify(enCurso));
    expect(sesion.turnoEnCurso).toBeNull();
    expect(sesion.mensajes[0]).toMatchObject({
      estado: "fallido",
      contenido: "Hola",
      turnId: "turno-1",
      error: { code: "INTERRUPTED", retryable: true },
    });
  });
});
