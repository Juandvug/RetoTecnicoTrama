import "server-only";

// Interfaz pública del Interview Engine (ARCHITECTURE §4.3).
export { runTurn, type GuardaDeCifras, type TurnoResultado } from "./engine";
export {
  CONFIG_POR_DEFECTO,
  type Clock,
  type InterviewConfig,
  type InterviewDeps,
  type Logger,
} from "./deps";
export { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt/system";
