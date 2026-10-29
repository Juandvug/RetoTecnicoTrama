import { z } from "zod";

import { AnalisisSchema, RequerimientoMotorSchema } from "@/domain/requirement";
import {
  FaseSchema,
  LIMITE_MENSAJE_ASISTENTE,
  LIMITE_MENSAJE_USUARIO,
  MAX_MENSAJES_USUARIO,
  MAX_MENSAJES_VENTANA,
} from "@/domain/session";

// Contrato HTTP de POST /api/interview (ARCHITECTURE §7.1), compartido por el
// cliente (que valida la respuesta antes de tocar el estado) y el servidor.

export const MensajeDto = z.discriminatedUnion("rol", [
  z.strictObject({
    rol: z.literal("user"),
    contenido: z.string().min(1).max(LIMITE_MENSAJE_USUARIO),
  }),
  z.strictObject({
    rol: z.literal("assistant"),
    contenido: z.string().min(1).max(LIMITE_MENSAJE_ASISTENTE),
  }),
]);

export const TurnoRequestSchema = z.strictObject({
  turnId: z.uuid(),
  mensajes: z
    .array(MensajeDto)
    .min(1)
    .max(MAX_MENSAJES_VENTANA)
    .refine(
      (m) => m.at(-1)?.rol === "user",
      "El último mensaje debe ser del usuario",
    ),
  vigente: z
    .strictObject({
      version: z.int().positive(),
      requerimiento: RequerimientoMotorSchema,
    })
    .nullable(),
  resumen: z.strictObject({
    mensajesUsuario: z.int().min(1).max(MAX_MENSAJES_USUARIO),
    turnosSinVersionNueva: z.int().min(0).max(MAX_MENSAJES_USUARIO),
  }),
  intencion: z.enum(["mensaje", "ajuste"]),
});

export const GuardaDeCifrasSchema = z.enum(["ok", "corregido", "respaldo"]);

export const TurnoResponseSchema = z.strictObject({
  turnId: z.uuid(),
  mensaje: z.string().min(1),
  propuesta: z
    .strictObject({
      requerimiento: RequerimientoMotorSchema,
      analisis: AnalisisSchema,
    })
    .nullable(),
  meta: z.strictObject({
    fase: FaseSchema,
    cierre: z.boolean(),
    promptVersion: z.string(),
    llamadas: z.int(),
    reparaciones: z.int(),
    guardaCifras: GuardaDeCifrasSchema,
  }),
});

export const CODIGOS_DE_ERROR = [
  "INVALID_REQUEST",
  "ACCESS_REQUIRED",
  "FORBIDDEN",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "LLM_TIMEOUT",
  "LLM_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL",
] as const;

export const ErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(CODIGOS_DE_ERROR),
    message: z.string(),
    retryable: z.boolean(),
    retryAfterSec: z.int().optional(),
  }),
});

/**
 * POST /api/interview responde en NDJSON, un evento por línea (ADR-0003). El
 * texto llega en fragmentos; `reinicio` descarta lo mostrado (un reintento o
 * un texto que se reemplaza), y `fin` trae la respuesta completa y validada,
 * que es la única que cambia la sesión. Un error después de empezar a
 * transmitir llega como evento, con el status que habría tenido.
 */
export const EventoDeTurnoSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("texto"), texto: z.string() }),
  z.strictObject({ tipo: z.literal("reinicio") }),
  z.strictObject({ tipo: z.literal("fin"), respuesta: TurnoResponseSchema }),
  z.strictObject({
    tipo: z.literal("error"),
    status: z.int(),
    error: ErrorResponseSchema.shape.error,
  }),
]);

export const TIPO_NDJSON = "application/x-ndjson";

export type TurnoInput = z.infer<typeof TurnoRequestSchema>;
export type TurnoResponse = z.infer<typeof TurnoResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type EventoDeTurno = z.infer<typeof EventoDeTurnoSchema>;
export type EventoDeTexto = Extract<
  EventoDeTurno,
  { tipo: "texto" | "reinicio" }
>;
export type CodigoDeError = (typeof CODIGOS_DE_ERROR)[number];
