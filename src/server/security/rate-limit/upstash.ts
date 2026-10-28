import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { RateLimiter, ReglaDeLimite, ResultadoDeLimite } from "./port";

/** Lo que el adaptador usa de @upstash/ratelimit; se reemplaza en los tests. */
export type LimiteDeUpstash = {
  limit(clave: string): Promise<{
    success: boolean;
    remaining: number;
    reset: number;
    reason?: string;
  }>;
};

export class RedisNoDisponible extends Error {
  constructor() {
    super("Redis no respondió a tiempo.");
    this.name = "RedisNoDisponible";
  }
}

/** Plazo para Redis. Pasado este tiempo, la librería deja pasar el request. */
const PLAZO_MS = 1500;

export function crearLimitadorUpstash(
  { url, token }: { url: string; token: string },
  crear: (regla: ReglaDeLimite) => LimiteDeUpstash = (regla) =>
    new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(regla.limite, `${regla.ventanaMs} ms`),
      prefix: `trama:limite:${regla.nombre}`,
      timeout: PLAZO_MS,
    }),
  clock: { now(): number } = { now: () => Date.now() },
): RateLimiter {
  const instancias = new Map<string, LimiteDeUpstash>();

  return {
    async consumir(
      clave: string,
      regla: ReglaDeLimite,
    ): Promise<ResultadoDeLimite> {
      const clavesDeInstancia = `${regla.nombre}:${regla.limite}:${regla.ventanaMs}`;
      let instancia = instancias.get(clavesDeInstancia);
      if (!instancia) {
        instancia = crear(regla);
        instancias.set(clavesDeInstancia, instancia);
      }

      const r = await instancia.limit(clave);
      // Si Redis no respondió, @upstash/ratelimit deja pasar el request (falla
      // abierto). Se trata como una falla, para que el limitador en memoria
      // tome el control en lugar de no limitar nada.
      if (r.reason === "timeout") throw new RedisNoDisponible();

      return {
        permitido: r.success,
        restantes: Math.max(0, r.remaining),
        reintentarEnMs: r.success ? 0 : Math.max(0, r.reset - clock.now()),
      };
    },
  };
}
