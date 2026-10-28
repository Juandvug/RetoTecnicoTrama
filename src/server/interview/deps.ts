import "server-only";

import { UMBRALES_POR_DEFECTO, type UmbralesDeFase } from "@/domain/session";
import type { LlmClient } from "@/server/llm/port";

// Las dependencias del engine. Las define el engine, que es quien las consume;
// la raíz de composición del servidor aporta las implementaciones.

export interface Clock {
  now(): number;
}

export type CampoDeLog = string | number | boolean | null;

/** Solo escalares: el log nunca lleva contenido (ARCHITECTURE §12). */
export interface Logger {
  info(evento: string, campos?: Record<string, CampoDeLog>): void;
  warn(evento: string, campos?: Record<string, CampoDeLog>): void;
}

export type InterviewConfig = {
  /** Presupuesto de llamadas al modelo por turno (ADR-0004). */
  maxLlamadas: number;
  /** Reparaciones de una tool call inválida antes de preguntarle al usuario. */
  maxReparaciones: number;
  /** Plazo del turno completo; el maxDuration del handler es mayor. */
  plazoTurnoMs: number;
  maxOutputTokens: number;
  umbrales: UmbralesDeFase;
};

export const CONFIG_POR_DEFECTO: InterviewConfig = {
  maxLlamadas: 5,
  maxReparaciones: 2,
  plazoTurnoMs: 50_000,
  maxOutputTokens: 4096,
  umbrales: UMBRALES_POR_DEFECTO,
};

export type InterviewDeps = {
  llm: LlmClient;
  clock: Clock;
  config: InterviewConfig;
  logger: Logger;
};
