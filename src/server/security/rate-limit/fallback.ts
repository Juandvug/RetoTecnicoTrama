import "server-only";

import type { Logger } from "@/server/interview";

import type { RateLimiter } from "./port";

/**
 * Si el limitador principal (Redis) falla, el request se limita con el de
 * memoria y se registra (ADR-0005). Se prefiere degradar el control a dejar
 * caída la demo; el tope de gasto de la key es la última barrera.
 */
export function conAlternativa(
  principal: RateLimiter,
  alternativa: RateLimiter,
  logger: Logger,
): RateLimiter {
  return {
    async consumir(clave, regla) {
      try {
        return await principal.consumir(clave, regla);
      } catch {
        logger.warn("rate_limit_degradado", {
          backend: "memoria",
          regla: regla.nombre,
        });
        return alternativa.consumir(clave, regla);
      }
    },
  };
}
