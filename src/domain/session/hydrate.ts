import { analizarRequerimiento } from "@/domain/requirement";

import { SCHEMA_VERSION } from "./limits";
import { sesionVacia } from "./reducer";
import { SesionSchema, type Sesion } from "./types";

export type AvisoDeHidratacion = "invalida" | "version_distinta";

export type ResultadoDeHidratacion = {
  sesion: Sesion;
  /** null si no había nada guardado o la sesión guardada era válida. */
  aviso: AvisoDeHidratacion | null;
};

const descartada = (aviso: AvisoDeHidratacion): ResultadoDeHidratacion => ({
  sesion: sesionVacia(),
  aviso,
});

/**
 * Reconstruye la sesión guardada en localStorage (ADR-0003). Si el contenido
 * está corrupto o es de otra versión del esquema, devuelve una sesión vacía
 * con la marca de aviso para que la UI se lo diga al usuario.
 */
export function hidratarSesion(guardado: unknown): ResultadoDeHidratacion {
  if (guardado === null || guardado === undefined) {
    return { sesion: sesionVacia(), aviso: null };
  }

  let crudo = guardado;
  if (typeof guardado === "string") {
    try {
      crudo = JSON.parse(guardado);
    } catch {
      return descartada("invalida");
    }
  }

  if (
    typeof crudo === "object" &&
    crudo !== null &&
    "schemaVersion" in crudo &&
    crudo.schemaVersion !== SCHEMA_VERSION
  ) {
    return descartada("version_distinta");
  }

  const resultado = SesionSchema.safeParse(crudo);
  if (!resultado.success) return descartada("invalida");
  const sesion = resultado.data;

  const consistente =
    sesion.versiones.every((v, i) => v.version === i + 1) &&
    (sesion.confirmacion === null ||
      sesion.confirmacion.version <= sesion.versiones.length) &&
    (sesion.versionVisible === null ||
      sesion.versionVisible <= sesion.versiones.length);
  if (!consistente) return descartada("invalida");

  // Se recalcula el análisis de cada versión: no se confía en lo guardado. Sin
  // la guarda de cifras, porque ya pasó en el turno que creó cada versión.
  const corpus = sesion.mensajes
    .filter((m) => m.rol === "user")
    .map((m) => m.contenido);
  const versiones = sesion.versiones.map((v) => ({
    ...v,
    analisis: analizarRequerimiento(v.requerimiento, corpus, {
      verificarCifras: false,
    }),
  }));
  if (versiones.some((v) => v.analisis.errores.length > 0))
    return descartada("invalida");

  // Un mensaje "enviando" es un turno que la recarga interrumpió: la respuesta
  // se perdió, así que queda como fallido y reintentable con el mismo turnId.
  const mensajes = sesion.mensajes.map((m) =>
    m.estado === "enviando"
      ? {
          ...m,
          estado: "fallido" as const,
          error: {
            code: "INTERRUPTED",
            message: "Se recargó la página antes de recibir la respuesta.",
            retryable: true,
          },
        }
      : m,
  );

  return {
    sesion: { ...sesion, mensajes, versiones, turnoEnCurso: null },
    aviso: null,
  };
}
