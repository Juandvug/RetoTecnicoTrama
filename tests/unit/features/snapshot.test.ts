import { describe, expect, it } from "vitest";

import { TurnoRequestSchema } from "@/contracts/interview";
import {
  LIMITE_MENSAJE_ASISTENTE,
  sesionVacia,
  type EventoSesion,
} from "@/domain/session";
import { armarSnapshot } from "@/features/workspace/snapshot";
import {
  aplicar,
  EN,
  enviar,
  resolver,
  sesionConfirmable,
} from "@tests/fixtures/sesiones";

// El snapshot de cada turno (ADR-0003) tiene que pasar el esquema del servidor.

const TURNO = "3f2b8c1e-6a4d-4e7b-9c1a-5d8e2f7a9b10";

/** El turno en curso, con un turnId que el esquema acepta (UUID). */
const enviarEnCurso = (contenido: string): EventoSesion => ({
  tipo: "mensaje_enviado",
  turnId: TURNO,
  mensajeId: "u-en-curso",
  contenido,
  en: EN,
});

describe("armarSnapshot", () => {
  it("lleva la ventana, la versión vigente, el resumen y la intención", () => {
    const sesion = aplicar(
      sesionConfirmable(),
      { tipo: "ajuste_iniciado" },
      enviarEnCurso("El período empieza en marzo"),
    );
    const snapshot = armarSnapshot(sesion, TURNO);

    expect(TurnoRequestSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.vigente?.version).toBe(2);
    expect(snapshot.resumen).toEqual({
      mensajesUsuario: 3,
      turnosSinVersionNueva: 0,
    });
    expect(snapshot.intencion).toBe("ajuste");
    expect(snapshot.mensajes.at(-1)).toEqual({
      rol: "user",
      contenido: "El período empieza en marzo",
    });
  });

  it("sin versión, vigente es null", () => {
    const sesion = aplicar(sesionVacia(), enviarEnCurso("Hola"));
    const snapshot = armarSnapshot(sesion, TURNO);
    expect(snapshot.vigente).toBeNull();
    expect(TurnoRequestSchema.safeParse(snapshot).success).toBe(true);
  });

  it("recorta una respuesta del agente más larga de lo que acepta el servidor", () => {
    const larga = "a".repeat(LIMITE_MENSAJE_ASISTENTE + 500);
    const sesion = aplicar(
      sesionVacia(),
      enviar("Hola", 1),
      resolver(1, null, larga),
      enviarEnCurso("Sigo"),
    );
    const snapshot = armarSnapshot(sesion, TURNO);
    expect(snapshot.mensajes[1]?.contenido).toHaveLength(
      LIMITE_MENSAJE_ASISTENTE,
    );
    expect(TurnoRequestSchema.safeParse(snapshot).success).toBe(true);
  });
});
