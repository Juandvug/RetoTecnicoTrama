import "server-only";

import {
  LlmError,
  type LlmCallOptions,
  type LlmClient,
  type LlmRequest,
} from "./port";

// Telemetría de cada llamada (ARCHITECTURE §12): latencia, tokens y tipo de
// error. Nunca registra contenido: ni el pedido, ni la respuesta, ni los
// argumentos de una tool call.

export type CampoDeTelemetria = string | number | boolean | null;

export interface Telemetria {
  registrar(evento: Record<string, CampoDeTelemetria>): void;
}

export function withTelemetry(
  inner: LlmClient,
  telemetria: Telemetria,
  clock: { now(): number } = { now: () => Date.now() },
): LlmClient {
  return {
    async complete(
      request: LlmRequest,
      signal: AbortSignal,
      options?: LlmCallOptions,
    ) {
      const inicio = clock.now();
      try {
        const respuesta = await inner.complete(request, signal, options);
        telemetria.registrar({
          evento: "llm",
          resultado: "ok",
          finishReason: respuesta.finishReason,
          latenciaMs: clock.now() - inicio,
          tokensEntrada: respuesta.usage?.inputTokens ?? null,
          tokensSalida: respuesta.usage?.outputTokens ?? null,
        });
        return respuesta;
      } catch (error) {
        telemetria.registrar({
          evento: "llm",
          resultado: error instanceof LlmError ? error.kind : "error_no_tipado",
          reintentable: error instanceof LlmError ? error.retryable : false,
          latenciaMs: clock.now() - inicio,
        });
        throw error;
      }
    },
  };
}
