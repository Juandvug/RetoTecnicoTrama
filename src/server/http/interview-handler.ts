import "server-only";

import {
  TurnoRequestSchema,
  type EventoDeTurno,
  type TurnoResponse,
} from "@/contracts/interview";
import { analizarRequerimiento } from "@/domain/requirement";
import { LIMITE_PAYLOAD_BYTES } from "@/domain/session";
import { runTurn, type Clock, type InterviewDeps } from "@/server/interview";
import type { LoggerDelServidor } from "@/server/observability/logger";
import { excedeContentLength, leerCuerpo } from "@/server/security/body";
import { ipDelCliente, seudonimo } from "@/server/security/client-ip";
import { origenPermitido } from "@/server/security/origin";
import type {
  RateLimiter,
  ReglasDeLimite,
} from "@/server/security/rate-limit/port";
import {
  leerCookie,
  NOMBRE_COOKIE,
  verificarSesion,
} from "@/server/security/session-cookie";

import { errorHttpDe } from "./errors";
import {
  demasiadasSolicitudes,
  ERRORES,
  responderError,
  responderFlujo,
  type ErrorHttp,
} from "./responses";

export type DepsDelTurno = {
  secretoDeSesion: string;
  limitador: RateLimiter;
  reglas: ReglasDeLimite;
  interview: InterviewDeps;
  logger: LoggerDelServidor;
  clock: Clock;
};

/**
 * POST /api/interview (ARCHITECTURE §7.3). Cada capa corta antes de que se
 * gaste en la siguiente: origen, tamaño, sesión, rate limit, body, versión
 * vigente y recién entonces el modelo. El rate limit se consume antes de leer
 * el body, así que una request malformada también cuenta.
 */
export async function manejarTurno(
  request: Request,
  deps: DepsDelTurno,
): Promise<Response> {
  const { logger, clock } = deps;
  const inicio = clock.now();
  const rechazar = (error: ErrorHttp, cabeceras?: Record<string, string>) => {
    logger.info("rechazo", { status: error.status, code: error.code });
    return responderError(error, cabeceras);
  };

  // 1. Origen
  if (!origenPermitido(request)) return rechazar(ERRORES.origen);
  // 2. Tamaño declarado, antes de leer nada
  if (excedeContentLength(request, LIMITE_PAYLOAD_BYTES))
    return rechazar(ERRORES.demasiadoGrande);
  // 3. Sesión
  const sesion = verificarSesion(
    leerCookie(request, NOMBRE_COOKIE),
    deps.secretoDeSesion,
    clock.now(),
  );
  if (!sesion) return rechazar(ERRORES.sinAcceso);

  // 4. Rate limit: sesión, IP y global
  const ip = seudonimo(ipDelCliente(request), deps.secretoDeSesion);
  let restantes = Number.POSITIVE_INFINITY;
  for (const [regla, clave] of [
    [deps.reglas.sesion, sesion.id],
    [deps.reglas.ip, ip],
    [deps.reglas.global, "todas"],
  ] as const) {
    const resultado = await deps.limitador.consumir(clave, regla);
    if (!resultado.permitido) {
      logger.info("limite_alcanzado", { regla: regla.nombre });
      return rechazar(demasiadasSolicitudes(resultado.reintentarEnMs), {
        "X-RateLimit-Remaining": "0",
      });
    }
    restantes = Math.min(restantes, resultado.restantes);
  }

  // 5. Body
  const cuerpo = await leerCuerpo(request, LIMITE_PAYLOAD_BYTES);
  if (!cuerpo.ok) return rechazar(ERRORES.demasiadoGrande);
  let datos: unknown;
  try {
    datos = JSON.parse(cuerpo.texto);
  } catch {
    return rechazar(ERRORES.solicitudInvalida);
  }
  const validacion = TurnoRequestSchema.safeParse(datos);
  if (!validacion.success) return rechazar(ERRORES.solicitudInvalida);
  const input = validacion.data;

  // 6. La versión vigente la manda el cliente: se revalida. Sin la guarda de
  // cifras, que ya pasó en su turno (ARCHITECTURE §7.3).
  if (input.vigente) {
    const corpus = input.mensajes
      .filter((m) => m.rol === "user")
      .map((m) => m.contenido);
    const analisis = analizarRequerimiento(
      input.vigente.requerimiento,
      corpus,
      {
        verificarCifras: false,
      },
    );
    if (analisis.errores.length > 0) return rechazar(ERRORES.vigenteInvalida);
  }

  // 7. El turno, transmitido en NDJSON (ADR-0003). Lo anterior respondió con
  // su status; desde acá el status es 200 y un error llega como evento. Si el
  // usuario cierra la pestaña, la señal del request cancela la llamada en curso;
  // el plazo del turno lo pone el engine.
  const sesionLog = seudonimo(sesion.id, deps.secretoDeSesion).slice(0, 12);
  const cabecerasDeLimite = { "X-RateLimit-Remaining": String(restantes) };

  return responderFlujo(async (enviar: (evento: EventoDeTurno) => void) => {
    try {
      const r = await runTurn(input, deps.interview, request.signal, enviar);
      logger.info("turno", {
        turnId: input.turnId,
        sesion: sesionLog,
        fase: r.meta.fase,
        cierre: r.meta.cierre,
        promptVersion: r.meta.promptVersion,
        llamadas: r.meta.llamadas,
        reparaciones: r.meta.reparaciones,
        latenciaMs: clock.now() - inicio,
        tokensEntrada: r.uso.tokensEntrada,
        tokensSalida: r.uso.tokensSalida,
        resultado: r.propuesta ? "propuesta" : "mensaje",
        completitudEfectiva: r.propuesta?.analisis.completitudEfectiva ?? null,
        guardaCifras: r.meta.guardaCifras,
      });
      const respuesta: TurnoResponse = {
        turnId: input.turnId,
        mensaje: r.mensaje,
        propuesta: r.propuesta,
        meta: r.meta,
      };
      enviar({ tipo: "fin", respuesta });
    } catch (error) {
      const http = errorHttpDe(error);
      logger.error("turno", {
        turnId: input.turnId,
        sesion: sesionLog,
        resultado: http.code,
        status: http.status,
        kind: http.kind,
        latenciaMs: clock.now() - inicio,
      });
      enviar({
        tipo: "error",
        status: http.status,
        error: {
          code: http.code,
          message: http.message,
          retryable: http.retryable,
          ...(http.retryAfterSec !== undefined
            ? { retryAfterSec: http.retryAfterSec }
            : {}),
        },
      });
    }
  }, cabecerasDeLimite);
}
