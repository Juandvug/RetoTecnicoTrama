// Interfaz pública del Validation Engine (ARCHITECTURE §4.3).
export * from "./schema";
export * from "./observations";
export {
  analizarRequerimiento,
  validarArgumentos,
  type OpcionesDeAnalisis,
} from "./analysis";
export { detectarCifras, type CifraDetectada, type TipoCifra } from "./figures";
export {
  aContratoBase,
  ContratoBaseSchema,
  SIN_DEFINIR,
  type ContratoBase,
} from "./projection";
