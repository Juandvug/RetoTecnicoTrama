import "server-only";

import { FakeLlmClient } from "./fake/client";
import { cargarEscenario } from "./fake/scenarios";
import { OpenAiLlmClient } from "./openai/client";
import type { LlmClient } from "./port";
import { withRetry, type RetryOptions } from "./retry";
import { withTelemetry, type Telemetria } from "./telemetry";

// createLlmClient(env): compone el adaptador con los decoradores (ADR-0002).
// Vive en la raíz de composición del servidor; la entrevista solo conoce el
// puerto.

export type LlmEnv = {
  provider: "openai" | "fake";
  /** Nombre del escenario del fake (FAKE_LLM_SCENARIO). */
  scenario?: string | null;
  apiKey?: string | null;
  model?: string | null;
};

export type LlmDeps = {
  telemetria: Telemetria;
  clock?: { now(): number };
  reintentos?: RetryOptions;
  /** Para los tests: respuestas grabadas sin red. */
  fetch?: typeof fetch;
};

export function createLlmClient(env: LlmEnv, deps: LlmDeps): LlmClient {
  let base: LlmClient;

  if (env.provider === "fake") {
    if (!env.scenario) {
      throw new Error("LLM_PROVIDER=fake requiere FAKE_LLM_SCENARIO.");
    }
    base = new FakeLlmClient(cargarEscenario(env.scenario));
  } else {
    if (!env.apiKey)
      throw new Error("LLM_PROVIDER=openai requiere OPENAI_API_KEY.");
    if (!env.model) throw new Error("LLM_PROVIDER=openai requiere LLM_MODEL.");
    base = new OpenAiLlmClient({
      apiKey: env.apiKey,
      model: env.model,
      fetch: deps.fetch,
    });
  }

  // La telemetría mide cada intento; el reintento envuelve a la telemetría.
  return withRetry(withTelemetry(base, deps.telemetria, deps.clock), {
    clock: deps.clock,
    ...deps.reintentos,
  });
}
