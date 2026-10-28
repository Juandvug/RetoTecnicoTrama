import "server-only";

import {
  conPlazo,
  errorDeAbort,
  esperar,
  LlmError,
  type LlmCallOptions,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
} from "./port";

// Reintentos de transporte (ADR-0004). Son política nuestra y no del SDK del
// proveedor, para que se comporten igual con cualquier adaptador y se puedan
// probar con timers simulados.

export type RetryOptions = {
  /** Reintentos por llamada, sin contar el primer intento. */
  maxReintentos?: number;
  /** Base del backoff exponencial. */
  baseMs?: number;
  /** Plazo de cada intento. */
  plazoPorIntentoMs?: number;
  clock?: { now(): number };
  /** Fuente de azar en [0, 1) para el jitter; se inyecta en los tests. */
  azar?: () => number;
};

export function withRetry(
  inner: LlmClient,
  opciones: RetryOptions = {},
): LlmClient {
  const {
    maxReintentos = 2,
    baseMs = 500,
    plazoPorIntentoMs = 25_000,
    clock = { now: () => Date.now() },
    azar = Math.random,
  } = opciones;

  return {
    async complete(
      request: LlmRequest,
      signal: AbortSignal,
      options?: LlmCallOptions,
    ): Promise<LlmResponse> {
      for (let intento = 0; ; intento++) {
        if (signal.aborted) throw errorDeAbort(signal);

        const deIntento = conPlazo(signal, plazoPorIntentoMs);
        let error: unknown;
        try {
          return await inner.complete(request, deIntento.signal, options);
        } catch (e) {
          error = e;
        } finally {
          deIntento.limpiar();
        }

        // Solo los LlmError reintentables, y no si el que cancela es el usuario.
        if (!(error instanceof LlmError) || !error.retryable) throw error;
        if (signal.aborted) throw errorDeAbort(signal);
        if (intento >= maxReintentos) throw error;

        // Backoff exponencial con jitter entre el 50 % y el 100 % del valor. Si
        // el proveedor indica cuánto esperar, se respeta.
        const backoff = baseMs * 2 ** intento * (0.5 + azar() * 0.5);
        const espera = error.retryAfterMs ?? backoff;
        // Solo se espera si el plazo del turno lo permite.
        if (
          options?.deadline !== undefined &&
          clock.now() + espera >= options.deadline
        ) {
          throw error;
        }
        await esperar(espera, signal);
      }
    },
  };
}
