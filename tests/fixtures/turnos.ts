import type { TurnoInput } from "@/contracts/interview";
import type { RequerimientoMotor } from "@/domain/requirement";
import { CONFIG_POR_DEFECTO, type InterviewDeps } from "@/server/interview";
import { llamada } from "@/server/llm/fake/client";
import type { LlmClient, LlmRequest } from "@/server/llm/port";

import { rotacionDePersonal } from "./requerimientos";

// Entradas y dependencias para los tests del Interview Engine.

export const TURNO_ID = "3f2b8c1e-6a4d-4e7b-9c1a-5d8e2f7a9b10";
export const AHORA = Date.parse("2026-10-28T12:00:00.000Z");

export const mensajesDeRotacion = (): TurnoInput["mensajes"] => [
  { rol: "user", contenido: rotacionDePersonal.corpus[0]! },
  {
    rol: "assistant",
    contenido: "¿Qué decisión querés tomar y desde cuándo lo notan?",
  },
  { rol: "user", contenido: rotacionDePersonal.corpus[1]! },
];

export function unTurno(cambios: Partial<TurnoInput> = {}): TurnoInput {
  return {
    turnId: TURNO_ID,
    mensajes: mensajesDeRotacion(),
    vigente: null,
    resumen: { mensajesUsuario: 2, turnosSinVersionNueva: 0 },
    intencion: "mensaje",
    ...cambios,
  };
}

export const conVigente = (
  requerimiento: RequerimientoMotor,
  version = 1,
): TurnoInput["vigente"] => ({ version, requerimiento });

export function unasDeps(llm: LlmClient, cambios: Partial<InterviewDeps> = {}) {
  const logs: Array<{ nivel: string; evento: string; campos: unknown }> = [];
  const deps: InterviewDeps = {
    llm,
    clock: { now: () => AHORA },
    config: CONFIG_POR_DEFECTO,
    logger: {
      info: (evento, campos) => logs.push({ nivel: "info", evento, campos }),
      warn: (evento, campos) => logs.push({ nivel: "warn", evento, campos }),
    },
    ...cambios,
  };
  return { deps, logs };
}

export const sinCancelar = () => new AbortController().signal;

/** Una tool call de registrar_requerimiento para el guion del fake. */
export const registrar = (req: RequerimientoMotor) =>
  llamada("registrar_requerimiento", req);

/** El contenido (ya parseado) de los mensajes de herramienta de un request. */
export const resultadosDeHerramienta = (request: LlmRequest) =>
  request.messages
    .filter((m) => m.role === "tool")
    .map((m) => JSON.parse(m.content) as Record<string, unknown>);
