// Interfaz pública de la sesión (ARCHITECTURE §4.3).
export * from "./limits";
export * from "./types";
export { sessionReducer, sesionVacia } from "./reducer";
export {
  canConfirm,
  puedeEnviar,
  versionVigente,
  mensajeFallido,
  esSoloLectura,
  contarMensajesUsuario,
  type Permiso,
} from "./guards";
export {
  derivarFase,
  faseDeSesion,
  resumenDeFase,
  UMBRALES_POR_DEFECTO,
  type ResumenFase,
  type UmbralesDeFase,
} from "./phase";
export {
  hidratarSesion,
  type AvisoDeHidratacion,
  type ResultadoDeHidratacion,
} from "./hydrate";
export {
  armarVentana,
  presupuestoDeMensajes,
  type MensajeDeVentana,
} from "./window";
export { exportarTranscripcion, exportarRequerimiento } from "./export";
