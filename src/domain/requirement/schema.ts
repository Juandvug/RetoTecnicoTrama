import { z } from "zod";

// Contrato RequerimientoMotor: la forma base del enunciado más las extensiones
// E1–E5 de ADR-0006. No hay campos opcionales: lo desconocido es null, para
// que el esquema sea compatible con el modo estricto de function calling.

export const TIPOS_FUENTE = ["excel", "csv", "pdf", "crm-export"] as const;
export const COMPLETITUD = [
  "suficiente_para_confirmar",
  "faltan_datos",
] as const;

// E5
export const LIMITES = {
  texto: 500,
  identificador: 64,
  clases: 12,
  relaciones: 16,
  reglas: 8,
  usaPorRegla: 8,
  fuentes: 6,
  columnasPorFuente: 15,
  justificaciones: 6,
  unidades: 8,
  preguntas: 6,
} as const;

const Texto = z.string().min(1).max(LIMITES.texto);
const Identificador = z.string().min(1).max(LIMITES.identificador);
const Referencias = (max: number) => z.array(Identificador).min(1).max(max);

export const RelacionSchema = z.strictObject({
  sujeto: Identificador, // nombre de una clase
  predicado: Identificador, // E3: único en el esquema, identifica la relación
  objeto: Identificador, // nombre de una clase
});

export const ReglaCandidataSchema = z.strictObject({
  id: z.string().regex(/^R[1-9]\d?$/),
  enunciado: Texto,
  usa: Referencias(LIMITES.usaPorRegla), // E2: clases y predicados que la regla necesita
});

export const ColumnaSchema = z.strictObject({
  nombre: Identificador,
  justifica: Referencias(LIMITES.justificaciones), // E1
});

export const FuenteRequeridaSchema = z.strictObject({
  nombre: Identificador,
  tipo: z.enum(TIPOS_FUENTE),
  columnas_minimas: z
    .array(ColumnaSchema)
    .min(1)
    .max(LIMITES.columnasPorFuente), // E1
  justifica: Referencias(LIMITES.justificaciones),
});

export const RequerimientoMotorSchema = z.strictObject({
  necesidad: Texto,
  decision_objetivo: Texto.nullable(), // E4
  alcance: z.strictObject({
    periodo: Texto.nullable(), // E4. "AAAA-MM / AAAA-MM" cuando se puede
    unidades: z.array(Identificador).max(LIMITES.unidades),
  }),
  esquema: z.strictObject({
    clases: z.array(Identificador).min(1).max(LIMITES.clases),
    relaciones: z.array(RelacionSchema).max(LIMITES.relaciones),
  }),
  reglas_candidatas: z.array(ReglaCandidataSchema).max(LIMITES.reglas),
  fuentes_requeridas: z.array(FuenteRequeridaSchema).max(LIMITES.fuentes),
  preguntas_abiertas: z.array(Texto).max(LIMITES.preguntas),
  completitud: z.enum(COMPLETITUD),
});

export type RequerimientoMotor = z.infer<typeof RequerimientoMotorSchema>;
export type Relacion = z.infer<typeof RelacionSchema>;
export type ReglaCandidata = z.infer<typeof ReglaCandidataSchema>;
export type FuenteRequerida = z.infer<typeof FuenteRequeridaSchema>;
export type Completitud = (typeof COMPLETITUD)[number];
export type TipoFuente = (typeof TIPOS_FUENTE)[number];
