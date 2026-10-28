import "server-only";

import type { RateLimiter, ReglaDeLimite, ResultadoDeLimite } from "./port";

/**
 * Ventana deslizante en memoria. Sirve para desarrollo, tests y como
 * alternativa si Redis falla. No limita de verdad en producción: cada
 * instancia serverless tiene su propio contador.
 */
export function crearLimitadorEnMemoria(
  clock: { now(): number } = { now: () => Date.now() },
): RateLimiter {
  const registros = new Map<string, number[]>();

  return {
    async consumir(
      clave: string,
      regla: ReglaDeLimite,
    ): Promise<ResultadoDeLimite> {
      const ahora = clock.now();
      const id = `${regla.nombre}:${clave}`;
      const vigentes = (registros.get(id) ?? []).filter(
        (t) => t > ahora - regla.ventanaMs,
      );

      if (vigentes.length >= regla.limite) {
        registros.set(id, vigentes);
        return {
          permitido: false,
          restantes: 0,
          reintentarEnMs: vigentes[0]! + regla.ventanaMs - ahora,
        };
      }

      vigentes.push(ahora);
      registros.set(id, vigentes);
      return {
        permitido: true,
        restantes: regla.limite - vigentes.length,
        reintentarEnMs: 0,
      };
    },
  };
}
