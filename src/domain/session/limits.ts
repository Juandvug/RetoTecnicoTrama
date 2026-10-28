// Límites compartidos por el cliente (que arma el snapshot) y el servidor (que
// lo valida): ADR-0003, ADR-0005 y ARCHITECTURE §7.1.

export const SCHEMA_VERSION = 1 as const;
export const CLAVE_STORAGE = "trama.session.v1";

export const LIMITE_MENSAJE_USUARIO = 2000;
export const LIMITE_MENSAJE_ASISTENTE = 4000;
export const MAX_MENSAJES_VENTANA = 40;
/** Tope de mensajes del usuario por entrevista; el servidor lo acota igual (`resumen`). */
export const MAX_MENSAJES_USUARIO = 500;

/** Content-Length máximo que acepta POST /api/interview (ADR-0005). */
export const LIMITE_PAYLOAD_BYTES = 64 * 1024;
