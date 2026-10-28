import "server-only";

import type { Completitud } from "@/domain/requirement";
import type { Fase } from "@/domain/session";

// Textos de respaldo deterministas (ADR-0004): se usan cuando el modelo no
// devuelve un texto utilizable, para que el turno nunca termine sin mensaje.
// Son fijos y con el trato por defecto (vos), porque no hay modelo que lo adapte.

export const TEXTO_DE_RECHAZO =
  "No puedo ayudarte con eso. Si querés, seguimos con el requerimiento.";

const SIN_PROPUESTA: Record<Exclude<Fase, "confirmado">, string> = {
  delimitar:
    "Para empezar: ¿qué decisión querés tomar con esto y desde cuándo lo notan?",
  proponer:
    "Todavía no pude armar una propuesta con lo que me contaste. ¿Qué decisión querés tomar y qué entidades están involucradas?",
  pedir:
    "Sigo sin poder completar el requerimiento. ¿Qué datos tenés disponibles hoy sobre este tema y en qué sistema o archivo están?",
  confirmar:
    "El requerimiento está listo para revisar en el panel. Confirmalo o pedime los ajustes que necesites.",
};

const CON_PROPUESTA: Record<Completitud, string> = {
  suficiente_para_confirmar:
    "Registré una versión en el panel. Revisala y confirmala, o pedime ajustes.",
  faltan_datos:
    "Registré una versión en el panel. Todavía faltan datos: contame qué podés aportar para completarla.",
};

export function textoDeRespaldo(
  fase: Exclude<Fase, "confirmado">,
  propuesta: { completitud: Completitud } | null,
): string {
  return propuesta ? CON_PROPUESTA[propuesta.completitud] : SIN_PROPUESTA[fase];
}
