import type { z } from "zod";

import { AccesoRequestSchema } from "@/contracts/access";
import {
  ErrorResponseSchema,
  EventoDeTurnoSchema,
  TIPO_NDJSON,
  TurnoResponseSchema,
  type EventoDeTexto,
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

const CORTADA: ErrorDeApi = {
  code: "NETWORK",
  message: "La respuesta se cortó antes de terminar. Volvé a intentar.",
  retryable: true,
  status: null,
};

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

/** Las líneas de un cuerpo NDJSON, a medida que llegan. */
async function* lineas(cuerpo: ReadableStream<Uint8Array>) {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let pendiente = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true });
    const partes = pendiente.split("\n");
    pendiente = partes.pop() ?? "";
    for (const linea of partes) if (linea.trim()) yield linea;
  }
  pendiente += decodificador.decode();
  if (pendiente.trim()) yield pendiente;
}

/**
 * Lee los eventos del turno (ADR-0003): el texto parcial va a `alTexto` y el
 * resultado sale del evento `fin`, o del evento `error`.
 */
async function leerFlujo(
  respuesta: Response,
  alTexto: (evento: EventoDeTexto) => void,
  signal?: AbortSignal,
): Promise<Resultado<TurnoResponse>> {
  if (!respuesta.body) return { ok: false, error: CORTADA };
  try {
    for await (const linea of lineas(respuesta.body)) {
      let datos: unknown;
      try {
        datos = JSON.parse(linea);
      } catch {
        return { ok: false, error: respuestaInesperada(respuesta.status) };
      }
      const evento = EventoDeTurnoSchema.safeParse(datos);
      if (!evento.success)
        return { ok: false, error: respuestaInesperada(respuesta.status) };
      const e = evento.data;
      if (e.tipo === "fin") return { ok: true, datos: e.respuesta };
      if (e.tipo === "error")
        return { ok: false, error: { ...e.error, status: e.status } };
      alTexto(e);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, error: CORTADA };
  }
  return { ok: false, error: CORTADA };
}

/**
 * POST /api/interview. La respuesta llega en NDJSON: el texto parcial se
 * entrega a `alTexto` a medida que llega. Si `signal` se cancela, la promesa
 * se rechaza con AbortError.
 */
export async function enviarTurno(
  input: TurnoInput,
  signal?: AbortSignal,
  alTexto: (evento: EventoDeTexto) => void = () => {},
): Promise<Resultado<TurnoResponse>> {
  const respuesta = await post("/api/interview", input, signal);
  if (!respuesta) return { ok: false, error: SIN_CONEXION };
  if (!respuesta.ok) return { ok: false, error: await errorDe(respuesta) };

  const esFlujo = respuesta.headers
    .get("content-type")
    ?.startsWith(TIPO_NDJSON);
  const resultado = esFlujo
    ? await leerFlujo(respuesta, alTexto, signal)
    : await validar(respuesta, TurnoResponseSchema);
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
