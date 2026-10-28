import "server-only";

import { AccesoRequestSchema } from "@/contracts/access";
import type { Clock } from "@/server/interview";
import type { LoggerDelServidor } from "@/server/observability/logger";
import { codigoCorrecto } from "@/server/security/access-code";
import { excedeContentLength, leerCuerpo } from "@/server/security/body";
import { ipDelCliente, seudonimo } from "@/server/security/client-ip";
import { origenPermitido } from "@/server/security/origin";
import type {
  RateLimiter,
  ReglasDeLimite,
} from "@/server/security/rate-limit/port";
import {
  cabeceraDeCookie,
  emitirSesion,
} from "@/server/security/session-cookie";

import {
  demasiadasSolicitudes,
  ERRORES,
  responderError,
  responderVacio,
  type ErrorHttp,
} from "./responses";

export type DepsDelAcceso = {
  codigo: string;
  secretoDeSesion: string;
  limitador: RateLimiter;
  reglas: ReglasDeLimite;
  logger: LoggerDelServidor;
  clock: Clock;
  /** Secure en la cookie; solo se apaga en desarrollo local, sin HTTPS. */
  cookieSegura: boolean;
};

const LIMITE_CUERPO = 1024;

/**
 * POST /api/access (ARCHITECTURE §7.2, ADR-0005). Cada intento cuenta para el
 * límite por IP, haya acertado o no: 5 cada 10 minutos, así que el sexto
 * intento seguido recibe 429 aunque traiga el código correcto.
 */
export async function manejarAcceso(
  request: Request,
  deps: DepsDelAcceso,
): Promise<Response> {
  const { logger, clock } = deps;
  const rechazar = (error: ErrorHttp) => {
    logger.info("acceso_rechazado", { status: error.status, code: error.code });
    return responderError(error);
  };

  if (!origenPermitido(request)) return rechazar(ERRORES.origen);
  if (excedeContentLength(request, LIMITE_CUERPO))
    return rechazar(ERRORES.demasiadoGrande);

  const ip = seudonimo(ipDelCliente(request), deps.secretoDeSesion);
  const limite = await deps.limitador.consumir(ip, deps.reglas.acceso);
  if (!limite.permitido)
    return rechazar(demasiadasSolicitudes(limite.reintentarEnMs));

  const cuerpo = await leerCuerpo(request, LIMITE_CUERPO);
  if (!cuerpo.ok) return rechazar(ERRORES.demasiadoGrande);
  let datos: unknown;
  try {
    datos = JSON.parse(cuerpo.texto);
  } catch {
    return rechazar(ERRORES.solicitudInvalida);
  }
  const validacion = AccesoRequestSchema.safeParse(datos);
  if (!validacion.success) return rechazar(ERRORES.solicitudInvalida);

  if (!codigoCorrecto(validacion.data.codigo, deps.codigo)) {
    return rechazar(ERRORES.codigoIncorrecto);
  }

  const sesion = emitirSesion(deps.secretoDeSesion, clock.now());
  logger.info("acceso_concedido", {
    sesion: seudonimo(sesion.id, deps.secretoDeSesion).slice(0, 12),
  });
  return responderVacio(204, {
    "Set-Cookie": cabeceraDeCookie(sesion.valor, { segura: deps.cookieSegura }),
  });
}
