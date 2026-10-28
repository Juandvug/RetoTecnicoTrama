import "server-only";

// Puerto LlmClient (ADR-0002). Sus tipos son neutrales: modelan lo que tienen en
// común los proveedores con tool calling. No depende de nada, ni de OpenAI ni
// del dominio de la entrevista.

export type JsonSchema = Record<string, unknown>;

export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema; // lo genera el dominio; cada adaptador lo lleva a su dialecto
}

export type LlmToolChoice = "auto" | "none" | { name: string };

export interface LlmRequest {
  system: string; // prompt estático y versionado
  context: string; // bloque dinámico del turno: fase, versión vigente, fecha
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  toolChoice: LlmToolChoice;
  maxOutputTokens: number;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string; // JSON crudo: el adaptador no lo interpreta
}

export interface LlmResponse {
  text: string | null;
  toolCalls: LlmToolCall[];
  refusal: string | null;
  finishReason: "stop" | "tool_calls" | "length" | "content_filter" | "other";
  usage: { inputTokens: number; outputTokens: number } | null;
}

/** Opciones de una llamada que no son parte del pedido al modelo. */
export interface LlmCallOptions {
  /**
   * Instante (ms, en la hora del reloj inyectado) en que vence el plazo del
   * turno. Los reintentos no esperan más allá de él.
   */
  deadline?: number;
}

export interface LlmClient {
  complete(
    request: LlmRequest,
    signal: AbortSignal,
    options?: LlmCallOptions,
  ): Promise<LlmResponse>;
}

export type LlmErrorKind =
  | "timeout"
  | "rate_limited"
  | "quota_exceeded"
  | "unavailable"
  | "auth"
  | "bad_request"
  | "aborted"
  | "unknown";

/** Los únicos errores que tiene sentido reintentar (ADR-0004). */
export const KINDS_REINTENTABLES: ReadonlySet<LlmErrorKind> = new Set([
  "timeout",
  "rate_limited",
  "unavailable",
]);

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(kind);
    this.name = "LlmError";
  }

  /** Crea el error con el `retryable` que corresponde a su tipo. */
  static de(kind: LlmErrorKind, retryAfterMs?: number): LlmError {
    return new LlmError(kind, KINDS_REINTENTABLES.has(kind), retryAfterMs);
  }
}

const esTimeout = (razon: unknown) =>
  typeof razon === "object" &&
  razon !== null &&
  "name" in razon &&
  razon.name === "TimeoutError";

/**
 * El error que corresponde a una señal abortada: `timeout` si venció un plazo
 * (el motivo es un TimeoutError) y `aborted` si el que cancela es el usuario.
 */
export function errorDeAbort(signal: AbortSignal): LlmError {
  return esTimeout(signal.reason)
    ? LlmError.de("timeout")
    : LlmError.de("aborted");
}

export function plazoVencido(): DOMException {
  return new DOMException("El plazo venció.", "TimeoutError");
}

/**
 * Una señal que se aborta cuando se aborta `signal` o pasan `ms`. Usa
 * setTimeout, así que los timers simulados de Vitest la controlan.
 */
export function conPlazo(
  signal: AbortSignal,
  ms: number,
): { signal: AbortSignal; limpiar: () => void } {
  const controlador = new AbortController();
  const alAbortar = () => controlador.abort(signal.reason);
  if (signal.aborted) alAbortar();
  else signal.addEventListener("abort", alAbortar, { once: true });

  const temporizador = setTimeout(() => controlador.abort(plazoVencido()), ms);
  return {
    signal: controlador.signal,
    limpiar: () => {
      clearTimeout(temporizador);
      signal.removeEventListener("abort", alAbortar);
    },
  };
}

/** Espera `ms`; si la señal se aborta antes, falla con el error de abort. */
export function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (signal.aborted) return rechazar(errorDeAbort(signal));
    const alAbortar = () => {
      clearTimeout(temporizador);
      rechazar(errorDeAbort(signal));
    };
    const temporizador = setTimeout(() => {
      signal.removeEventListener("abort", alAbortar);
      resolver();
    }, ms);
    signal.addEventListener("abort", alAbortar, { once: true });
  });
}
