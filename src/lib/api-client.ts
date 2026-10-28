import type { z } from "zod";

import { AccesoRequestSchema } from "@/contracts/access";
import {
  ErrorResponseSchema,
  TurnoResponseSchema,
  type TurnoInput,
  type TurnoResponse,
} from "@/contracts/interview";

// Cliente de la API (PLAN F7.1). Nunca lanza: devuelve el resultado o un error
// normalizado, con la forma del cuerpo de error de ADR-0004. Las respuestas se
// validan con Zod antes de tocar el estado (ARCHITECTURE §7.1).

export type ErrorDeApi = {
  /** Un código de CODIGOS_DE_ERROR o uno propio del cliente: NETWORK, BAD_RESPONSE. */
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSec?: number;
  status: number | null; // null si no hubo respuesta
};

export type Resultado<T> =
  { ok: true; datos: T } | { ok: false; error: ErrorDeApi };

const SIN_CONEXION: ErrorDeApi = {
  code: "NETWORK",
  message:
    "No se pudo conectar con el servidor. Revisá tu conexión y volvé a intentar.",
  retryable: true,
  status: null,
};

const respuestaInesperada = (status: number): ErrorDeApi => ({
  code: "BAD_RESPONSE",
  message: "La respuesta del servidor no tiene el formato esperado.",
  retryable: true,
  status,
});

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return undefined;
  }
}

async function errorDe(respuesta: Response): Promise<ErrorDeApi> {
  const cuerpo = ErrorResponseSchema.safeParse(await leerJson(respuesta));
  if (!cuerpo.success) return respuestaInesperada(respuesta.status);
  return { ...cuerpo.data.error, status: respuesta.status };
}

async function post(
  url: string,
  cuerpo: unknown,
  signal?: AbortSignal,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    // Una cancelación propia no es un error de red: quien canceló lo sabe.
    if (signal?.aborted) throw error;
    return null;
  }
}

async function validar<S extends z.ZodType>(
  respuesta: Response,
  schema: S,
): Promise<Resultado<z.infer<S>>> {
  const datos = schema.safeParse(await leerJson(respuesta));
  return datos.success
    ? { ok: true, datos: datos.data }
    : { ok: false, error: respuestaInesperada(respuesta.status) };
}

/** POST /api/interview. Si `signal` se cancela, la promesa se rechaza con AbortError. */
export async function enviarTurno(
  input: TurnoInput,
  signal?: AbortSignal,
): Promise<Resultado<TurnoResponse>> {
  const respuesta = await post("/api/interview", input, signal);
  if (!respuesta) return { ok: false, error: SIN_CONEXION };
  if (!respuesta.ok) return { ok: false, error: await errorDe(respuesta) };

  const resultado = await validar(respuesta, TurnoResponseSchema);
  if (resultado.ok && resultado.datos.turnId !== input.turnId) {
    return { ok: false, error: respuestaInesperada(respuesta.status) };
  }
  return resultado;
}

/** POST /api/access. Con 204, el servidor deja la cookie de sesión. */
export async function enviarCodigo(codigo: string): Promise<Resultado<null>> {
  const cuerpo = AccesoRequestSchema.safeParse({ codigo: codigo.trim() });
  if (!cuerpo.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Escribí el código de acceso.",
        retryable: false,
        status: null,
      },
    };
  }
  const respuesta = await post("/api/access", cuerpo.data);
  if (!respuesta) return { ok: false, error: SIN_CONEXION };
  if (respuesta.status === 204) return { ok: true, datos: null };
  if (respuesta.ok)
    return { ok: false, error: respuestaInesperada(respuesta.status) };
  return { ok: false, error: await errorDe(respuesta) };
}
