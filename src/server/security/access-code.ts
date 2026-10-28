import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const resumen = (texto: string) =>
  createHash("sha256").update(texto, "utf8").digest();

/**
 * Compara el código en tiempo constante (ADR-0005). Se comparan los SHA-256 de
 * los dos textos, que siempre tienen el mismo largo: así tampoco se filtra el
 * largo del código por la duración de la comparación.
 */
export function codigoCorrecto(recibido: string, esperado: string): boolean {
  return timingSafeEqual(resumen(recibido), resumen(esperado));
}
