import "server-only";

import { FakeLlmClient } from "./fake/client";
import { cargarEscenario } from "./fake/scenarios";
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
};

export type LlmDeps = {
  telemetria: Telemetria;
  clock?: { now(): number };
  reintentos?: RetryOptions;
};

export function createLlmClient(env: LlmEnv, deps: LlmDeps): LlmClient {
  let base: LlmClient;

  if (env.provider === "fake") {
    if (!env.scenario) {
      throw new Error("LLM_PROVIDER=fake requiere FAKE_LLM_SCENARIO.");
    }
    base = new FakeLlmClient(cargarEscenario(env.scenario));
  } else {
    // El adaptador real se agrega en el paso de conexión con OpenAI (PLAN F4.5).
    throw new Error("El adaptador de OpenAI todavía no está disponible.");
  }

  // La telemetría mide cada intento; el reintento envuelve a la telemetría.
  return withRetry(withTelemetry(base, deps.telemetria, deps.clock), {
    clock: deps.clock,
    ...deps.reintentos,
  });
}
