import "server-only";

import { CONFIG_POR_DEFECTO, type Clock } from "@/server/interview";
import { createLlmClient } from "@/server/llm/factory";
import { ErrorDeConfiguracion, leerEnv } from "@/server/config/env";
import type { DepsDelAcceso } from "@/server/http/access-handler";
import type { DepsDelTurno } from "@/server/http/interview-handler";
import { crearLogger, type Sink } from "@/server/observability/logger";
import { conAlternativa } from "@/server/security/rate-limit/fallback";
import { crearLimitadorEnMemoria } from "@/server/security/rate-limit/memory";
import { reglasDeLimite } from "@/server/security/rate-limit/port";
import { crearLimitadorUpstash } from "@/server/security/rate-limit/upstash";
import {
  NOMBRE_COOKIE,
  verificarSesion,
} from "@/server/security/session-cookie";

// Raíz de composición del servidor: de las variables de entorno a las
// dependencias de cada handler. Es el único lugar que conoce las
// implementaciones concretas.

export type Dependencias = { turno: DepsDelTurno; acceso: DepsDelAcceso };

export type ResultadoDeComposicion =
  { ok: true; deps: Dependencias } | { ok: false };

export function construirDependencias(
  fuente: Record<string, string | undefined>,
  {
    sink,
    clock = { now: () => Date.now() },
  }: { sink?: Sink; clock?: Clock } = {},
): Dependencias {
  const env = leerEnv(fuente);
  const logger = crearLogger(sink, clock);

  const llm = createLlmClient(
    { provider: env.llm.provider, scenario: env.llm.scenario },
    { telemetria: logger, clock },
  );

  const memoria = crearLimitadorEnMemoria(clock);
  const limitador = env.upstash
    ? conAlternativa(crearLimitadorUpstash(env.upstash), memoria, logger)
    : memoria;
  const reglas = reglasDeLimite(env.limites);

  return {
    turno: {
      secretoDeSesion: env.acceso.secretoDeSesion,
      limitador,
      reglas,
      logger,
      clock,
      interview: {
        llm,
        clock,
        logger,
        config: {
          ...CONFIG_POR_DEFECTO,
          maxOutputTokens: env.llm.maxOutputTokens,
          umbrales: env.umbrales,
        },
      },
    },
    acceso: {
      codigo: env.acceso.codigo,
      secretoDeSesion: env.acceso.secretoDeSesion,
      limitador,
      reglas,
      logger,
      clock,
      cookieSegura: !env.desarrollo,
    },
  };
}

let memo: ResultadoDeComposicion | undefined;

/**
 * Dependencias memoizadas por instancia. Si la configuración es inválida, cada
 * request responde 503 sin decir qué falta; el log del servidor nombra las
 * variables (nunca sus valores).
 */
export function obtenerDependencias(): ResultadoDeComposicion {
  if (memo) return memo;
  try {
    memo = { ok: true, deps: construirDependencias(process.env) };
  } catch (error) {
    // Los mensajes de estos errores los escribimos nosotros y no incluyen valores.
    const detalle =
      error instanceof ErrorDeConfiguracion
        ? error.message
        : error instanceof Error
          ? `No se pudieron construir las dependencias: ${error.message}`
          : "No se pudieron construir las dependencias.";
    console.error(`[trama] ${detalle}`);
    memo = { ok: false };
  }
  return memo;
}

/**
 * Para la página: si la cookie de sesión es válida, se salta la pantalla del
 * código de acceso. Con la configuración inválida, siempre false.
 */
export function sesionVigente(cookies: {
  get(nombre: string): { value: string } | undefined;
}): boolean {
  const composicion = obtenerDependencias();
  if (!composicion.ok) return false;
  const { secretoDeSesion, clock } = composicion.deps.acceso;
  return (
    verificarSesion(
      cookies.get(NOMBRE_COOKIE)?.value,
      secretoDeSesion,
      clock.now(),
    ) !== null
  );
}
