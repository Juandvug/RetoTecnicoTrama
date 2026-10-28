import "server-only";

import { LlmError } from "@/server/llm/port";

import type { ErrorHttp } from "./responses";

// Mapeo de errores del turno a HTTP (ADR-0004). Nunca se usa el mensaje del
// error original: podría traer detalles internos, o algo peor.

const MENSAJE_TIMEOUT =
  "El modelo tardó demasiado en responder. Probá de nuevo.";
const MENSAJE_NO_DISPONIBLE =
  "El modelo no está disponible en este momento. Probá de nuevo en unos segundos.";
const MENSAJE_SIN_SERVICIO =
  "El servicio del modelo no está disponible. Avisale al equipo de Trama.";
const MENSAJE_INTERNO =
  "Ocurrió un error inesperado. Probá de nuevo más tarde.";

export function errorHttpDe(error: unknown): ErrorHttp & { kind: string } {
  if (!(error instanceof LlmError)) {
    return {
      status: 500,
      code: "INTERNAL",
      message: MENSAJE_INTERNO,
      retryable: false,
      kind: "no_tipado",
    };
  }

  const retryAfterSec =
    error.retryAfterMs !== undefined
      ? Math.max(1, Math.ceil(error.retryAfterMs / 1000))
      : undefined;

  switch (error.kind) {
    case "timeout":
      return {
        status: 504,
        code: "LLM_TIMEOUT",
        message: MENSAJE_TIMEOUT,
        retryable: true,
        kind: error.kind,
      };
    case "rate_limited":
      return {
        status: 503,
        code: "LLM_UNAVAILABLE",
        message: MENSAJE_NO_DISPONIBLE,
        retryable: true,
        ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
        kind: error.kind,
      };
    case "unavailable":
      return {
        status: 502,
        code: "LLM_UNAVAILABLE",
        message: MENSAJE_NO_DISPONIBLE,
        retryable: true,
        kind: error.kind,
      };
    case "quota_exceeded":
    case "auth":
      // Se agotó el tope de gasto o la key no sirve: reintentar no ayuda.
      return {
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: MENSAJE_SIN_SERVICIO,
        retryable: false,
        kind: error.kind,
      };
    case "aborted":
      // El cliente se fue: nadie lee esta respuesta, pero queda en el log.
      return {
        status: 499,
        code: "INTERNAL",
        message: "La solicitud se canceló.",
        retryable: true,
        kind: error.kind,
      };
    case "bad_request":
    case "unknown":
      return {
        status: 500,
        code: "INTERNAL",
        message: MENSAJE_INTERNO,
        retryable: false,
        kind: error.kind,
      };
  }
}
