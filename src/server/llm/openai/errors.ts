import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";

import { errorDeAbort, LlmError } from "@/server/llm/port";

// Traduce los errores del SDK al vocabulario del puerto (ADR-0002, ADR-0004).
// Nunca copia el mensaje del SDK: puede traer fragmentos del pedido.

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const enMs = Number(headers?.get("retry-after-ms"));
  if (Number.isFinite(enMs) && enMs > 0) return Math.round(enMs);
  const enSegundos = Number(headers?.get("retry-after"));
  if (Number.isFinite(enSegundos) && enSegundos > 0)
    return Math.round(enSegundos * 1000);
  return undefined;
}

function sinCuota(error: APIError): boolean {
  return (
    error.code === "insufficient_quota" || error.type === "insufficient_quota"
  );
}

export function traducirError(error: unknown, signal: AbortSignal): LlmError {
  if (error instanceof LlmError) return error;
  // Si la señal del llamador se abortó, el motivo manda sobre lo que lance el SDK.
  if (signal.aborted || error instanceof APIUserAbortError)
    return errorDeAbort(signal);
  if (error instanceof APIConnectionTimeoutError) return LlmError.de("timeout");
  if (error instanceof APIConnectionError) return LlmError.de("unavailable");

  if (error instanceof APIError) {
    const { status } = error;
    if (status === 429) {
      return sinCuota(error)
        ? LlmError.de("quota_exceeded")
        : LlmError.de("rate_limited", retryAfterMs(error.headers));
    }
    if (status === 401 || status === 403) return LlmError.de("auth");
    if (status === 408) return LlmError.de("timeout");
    if (status === 400 || status === 404 || status === 413 || status === 422)
      return LlmError.de("bad_request");
    if (status === 409 || (status !== undefined && status >= 500))
      return LlmError.de("unavailable");
  }
  return LlmError.de("unknown");
}
