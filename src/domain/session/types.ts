import { z } from "zod";

import {
  AnalisisSchema,
  RequerimientoMotorSchema,
  type Analisis,
  type RequerimientoMotor,
} from "@/domain/requirement";

import { SCHEMA_VERSION } from "./limits";

export const FaseSchema = z.enum([
  "delimitar",
  "proponer",
  "pedir",
  "confirmar",
  "confirmado",
]);
export type Fase = z.infer<typeof FaseSchema>;

export const ErrorMensajeSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});
export type ErrorMensaje = z.infer<typeof ErrorMensajeSchema>;

export const MensajeSchema = z.strictObject({
  id: z.string(),
  turnId: z.string(),
  rol: z.enum(["user", "assistant"]),
  contenido: z.string(),
  estado: z.enum(["enviando", "enviado", "fallido"]),
  error: ErrorMensajeSchema.nullable(),
  creadoEn: z.string(),
});
export type Mensaje = z.infer<typeof MensajeSchema>;

// El envoltorio de una versión: el contrato describe la necesidad, no el
// proceso que la produjo (ADR-0006).
export const VersionRequerimientoSchema = z.strictObject({
  version: z.int().positive(), // 1, 2, 3…; lo asigna el cliente
  requerimiento: RequerimientoMotorSchema,
  analisis: AnalisisSchema, // por construcción, sin errores
  turnId: z.string(),
  creadaEn: z.string(), // ISO 8601
  promptVersion: z.string(),
});
export type VersionRequerimiento = z.infer<typeof VersionRequerimientoSchema>;

export const SesionSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  mensajes: z.array(MensajeSchema).max(2000),
  versiones: z.array(VersionRequerimientoSchema).max(500),
  confirmacion: z
    .strictObject({ version: z.int().positive(), en: z.string() })
    .nullable(),
  turnoEnCurso: z.string().nullable(),
  intencion: z.enum(["mensaje", "ajuste"]),
  turnosSinVersionNueva: z.int().min(0),
  versionVisible: z.int().positive().nullable(), // null: la más reciente
  borrador: z.string(), // texto del composer; también se persiste
});
export type Sesion = z.infer<typeof SesionSchema>;

export type Intencion = Sesion["intencion"];

/** Lo que devuelve el servidor cuando el turno registra un requerimiento. */
export type Propuesta = {
  requerimiento: RequerimientoMotor;
  analisis: Analisis;
};

export type EventoSesion =
  | {
      tipo: "mensaje_enviado";
      turnId: string;
      mensajeId: string;
      contenido: string;
      en: string;
    }
  | {
      tipo: "turno_resuelto";
      turnId: string;
      mensajeId: string;
      mensaje: string;
      propuesta: Propuesta | null;
      promptVersion: string;
      en: string;
    }
  | { tipo: "turno_fallido"; turnId: string; error: ErrorMensaje }
  | { tipo: "reintento" }
  | { tipo: "edicion" }
  | { tipo: "ajuste_iniciado" }
  | { tipo: "version_seleccionada"; version: number | null }
  | { tipo: "confirmado"; en: string }
  | { tipo: "reabierto" }
  | { tipo: "reiniciado" }
  | { tipo: "hidratado"; sesion: Sesion }
  | { tipo: "borrador_actualizado"; texto: string };
