import {
  analizarRequerimiento,
  type RequerimientoMotor,
} from "@/domain/requirement";
import {
  sesionVacia,
  sessionReducer,
  type EventoSesion,
  type Propuesta,
  type Sesion,
} from "@/domain/session";

import { rotacionDePersonal, unRequerimiento } from "./requerimientos";

// Constructores de eventos y sesiones para los tests del reducer, del engine y
// de la UI. El turno n usa los ids turno-n, u{n} y a{n}.

export const EN = "2026-10-28T10:00:00.000Z";
export const PROMPT = "entrevista-1.0.0";

export const aplicar = (s: Sesion, ...eventos: EventoSesion[]): Sesion =>
  eventos.reduce(sessionReducer, s);

export function propuestaDe(
  req: RequerimientoMotor = unRequerimiento(),
  corpus: string[] = rotacionDePersonal.corpus,
): Propuesta {
  return {
    requerimiento: req,
    analisis: analizarRequerimiento(req, corpus),
  };
}

export const enviar = (texto: string, n = 1): EventoSesion => ({
  tipo: "mensaje_enviado",
  turnId: `turno-${n}`,
  mensajeId: `u${n}`,
  contenido: texto,
  en: EN,
});

export const resolver = (
  n = 1,
  propuesta: Propuesta | null = null,
  mensaje = "Respuesta del agente",
): EventoSesion => ({
  tipo: "turno_resuelto",
  turnId: `turno-${n}`,
  mensajeId: `a${n}`,
  mensaje,
  propuesta,
  promptVersion: PROMPT,
  en: EN,
});

export const fallar = (n = 1, retryable = true): EventoSesion => ({
  tipo: "turno_fallido",
  turnId: `turno-${n}`,
  error: {
    code: "LLM_TIMEOUT",
    message: "El modelo tardó demasiado.",
    retryable,
  },
});

export const confirmar: EventoSesion = { tipo: "confirmado", en: EN };

/** Un turno completo: el usuario escribe y el agente responde. */
export const turno = (
  s: Sesion,
  texto: string,
  n: number,
  propuesta: Propuesta | null = null,
  mensaje?: string,
): Sesion => aplicar(s, enviar(texto, n), resolver(n, propuesta, mensaje));

const faltanDatos = () =>
  unRequerimiento((r) => {
    r.alcance.periodo = null;
    r.completitud = "faltan_datos";
  });

/** v1 con faltan_datos (período sin definir). */
export const sesionConFaltanDatos = (): Sesion =>
  turno(
    sesionVacia(),
    "Aumentaron las renuncias en operaciones.",
    1,
    propuestaDe(faltanDatos()),
  );

/** v1 con faltan_datos y v2 suficiente. */
export const sesionConfirmable = (): Sesion =>
  turno(sesionConFaltanDatos(), "Desde febrero de 2026.", 2, propuestaDe());
