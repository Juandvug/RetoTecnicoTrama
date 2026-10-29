import "server-only";

import {
  TIPO_NDJSON,
  type CodigoDeError,
  type ErrorResponse,
  type EventoDeTurno,
} from "@/contracts/interview";

// Respuestas de la API: JSON, sin caché (ADR-0005) y con errores en español,
// sin detalles internos (ADR-0004).

const SIN_CACHE = { "Cache-Control": "no-store" };

export function responderJson(
  status: number,
  cuerpo: unknown,
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...SIN_CACHE,
      ...cabeceras,
    },
  });
}

/**
 * Una respuesta NDJSON que se escribe a medida que `producir` envía eventos.
 * `no-transform` evita que una compresión intermedia la retenga entera.
 */
export function responderFlujo(
  producir: (enviar: (evento: EventoDeTurno) => void) => Promise<void>,
  cabeceras: Record<string, string> = {},
): Response {
  const codificador = new TextEncoder();
  const cuerpo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      let abierto = true;
      const enviar = (evento: EventoDeTurno) => {
        if (!abierto) return;
        try {
          controlador.enqueue(
            codificador.encode(`${JSON.stringify(evento)}\n`),
          );
        } catch {
          abierto = false; // el cliente ya se fue
        }
      };
      try {
        await producir(enviar);
      } finally {
        if (abierto) controlador.close();
      }
    },
  });
  return new Response(cuerpo, {
    status: 200,
    headers: {
      "Content-Type": `${TIPO_NDJSON}; charset=utf-8`,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      ...cabeceras,
    },
  });
}

export function responderVacio(
  status: number,
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(null, {
    status,
    headers: { ...SIN_CACHE, ...cabeceras },
  });
}

export type ErrorHttp = {
  status: number;
  code: CodigoDeError;
  message: string;
  retryable: boolean;
  retryAfterSec?: number;
};

export function responderError(
  error: ErrorHttp,
  cabeceras: Record<string, string> = {},
): Response {
  const cuerpo: ErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.retryAfterSec !== undefined
        ? { retryAfterSec: error.retryAfterSec }
        : {}),
    },
  };
  return responderJson(error.status, cuerpo, {
    ...(error.retryAfterSec !== undefined
      ? { "Retry-After": String(error.retryAfterSec) }
      : {}),
    ...cabeceras,
  });
}

export const ERRORES = {
  origen: {
    status: 403,
    code: "FORBIDDEN",
    message: "El origen de la solicitud no está permitido.",
    retryable: false,
  },
  demasiadoGrande: {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "La solicitud es demasiado grande para enviarla.",
    retryable: false,
  },
  sinAcceso: {
    status: 401,
    code: "ACCESS_REQUIRED",
    message: "Necesitás el código de acceso para usar la entrevista.",
    retryable: false,
  },
  codigoIncorrecto: {
    status: 401,
    code: "ACCESS_REQUIRED",
    message: "El código de acceso no es correcto.",
    retryable: false,
  },
  solicitudInvalida: {
    status: 400,
    code: "INVALID_REQUEST",
    message: "La solicitud no es válida.",
    retryable: false,
  },
  vigenteInvalida: {
    status: 400,
    code: "INVALID_REQUEST",
    message: "La versión vigente del requerimiento no es válida.",
    retryable: false,
  },
  sinServicio: {
    status: 503,
    code: "SERVICE_UNAVAILABLE",
    message: "El servicio no está disponible en este momento.",
    retryable: false,
  },
} satisfies Record<string, ErrorHttp>;

export function demasiadasSolicitudes(reintentarEnMs: number): ErrorHttp {
  return {
    status: 429,
    code: "RATE_LIMITED",
    message:
      "Hiciste muchas solicitudes. Esperá un momento antes de volver a intentar.",
    retryable: true,
    retryAfterSec: Math.max(1, Math.ceil(reintentarEnMs / 1000)),
  };
}

/** Cuando la configuración del servidor es inválida: no se dice qué falta. */
export const responderSinServicio = () => responderError(ERRORES.sinServicio);
