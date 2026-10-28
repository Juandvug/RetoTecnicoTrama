import { LIMITE_MENSAJE_USUARIO, MAX_MENSAJES_USUARIO } from "./limits";
import type { Mensaje, Sesion, VersionRequerimiento } from "./types";

export type Permiso = { permitido: boolean; motivo: string | null };

const permitido: Permiso = { permitido: true, motivo: null };
const denegado = (motivo: string): Permiso => ({ permitido: false, motivo });

export const versionVigente = (s: Sesion): VersionRequerimiento | null =>
  s.versiones.at(-1) ?? null;

export const mensajeFallido = (s: Sesion): Mensaje | null =>
  s.mensajes.find((m) => m.rol === "user" && m.estado === "fallido") ?? null;

export const contarMensajesUsuario = (s: Sesion): number =>
  s.mensajes.filter((m) => m.rol === "user").length;

/** Una versión es de solo lectura cuando ya existe una más reciente. */
export const esSoloLectura = (s: Sesion, version: number): boolean =>
  version < (versionVigente(s)?.version ?? 0);

/**
 * Solo se puede confirmar la versión más reciente, con completitud efectiva
 * suficiente y sin ningún turno en curso (ADR-0003). Cuando no se puede,
 * devuelve el motivo para mostrarlo junto al botón.
 */
export function canConfirm(s: Sesion): Permiso {
  const vigente = versionVigente(s);
  if (s.confirmacion) return denegado("El requerimiento ya está confirmado.");
  if (!vigente)
    return denegado("Todavía no hay un requerimiento para confirmar.");
  if (s.turnoEnCurso)
    return denegado("Esperá a que el agente termine de responder.");
  if (mensajeFallido(s))
    return denegado(
      "Hay un mensaje que no se pudo enviar. Reintentalo o editalo antes de confirmar.",
    );
  if (s.versionVisible !== null)
    return denegado(
      "Estás viendo una versión anterior. Volvé a la más reciente para confirmarla.",
    );
  if (vigente.analisis.completitudEfectiva !== "suficiente_para_confirmar") {
    const motivos = vigente.analisis.motivos;
    return denegado(
      motivos.length > 0
        ? `Faltan datos: ${motivos.join(" ")}`
        : "El agente todavía marca el requerimiento como incompleto.",
    );
  }
  return permitido;
}

/** Un turno a la vez, sin mensajes fallidos pendientes y sin sesión confirmada. */
export function puedeEnviar(s: Sesion, texto: string): Permiso {
  if (s.confirmacion)
    return denegado("El requerimiento está confirmado. Reabrilo para seguir.");
  if (s.turnoEnCurso)
    return denegado("Esperá a que el agente termine de responder.");
  if (mensajeFallido(s))
    return denegado("Reintentá o editá el mensaje que no se pudo enviar.");
  if (texto.trim().length === 0) return denegado("Escribí un mensaje.");
  if (texto.trim().length > LIMITE_MENSAJE_USUARIO)
    return denegado(
      `El mensaje supera los ${LIMITE_MENSAJE_USUARIO} caracteres.`,
    );
  if (contarMensajesUsuario(s) >= MAX_MENSAJES_USUARIO)
    return denegado(
      "Esta entrevista llegó al máximo de mensajes. Empezá una nueva.",
    );
  return permitido;
}
