import "server-only";

import type { RequerimientoMotor } from "@/domain/requirement";
import type { Fase, Intencion } from "@/domain/session";

// Bloque dinámico del turno (ARCHITECTURE §10.3). Viaja con rol system, como un
// segundo mensaje después del prompt estático, para que el prefijo estable
// aproveche el caché del proveedor.

const DELIMITADOR = /<(\/?)contexto_del_turno/gi;

/**
 * Escapa los delimitadores del bloque en cualquier texto que venga del usuario
 * (o de algo que el usuario pudo influir), para que no pueda hacerse pasar por
 * el sistema cerrando el bloque y escribiendo uno propio.
 */
export function escaparDelimitadores(texto: string): string {
  return texto.replace(DELIMITADOR, "&lt;$1contexto_del_turno");
}

export type DatosDeContexto = {
  fecha: string; // AAAA-MM-DD
  fase: Fase;
  instruccionDeFase: string;
  mensajesUsuario: number;
  intencion: Intencion;
  vigente: { version: number; requerimiento: RequerimientoMotor } | null;
  motivos: string[];
  observaciones: string[];
  /** Pedido de corrección de la guarda de cifras, solo en la llamada que corrige. */
  correccion?: string;
};

const lista = (items: string[]) =>
  items.length > 0
    ? items.map((i) => `- ${escaparDelimitadores(i)}`).join("\n")
    : "- ninguno";

export function armarContexto(d: DatosDeContexto): string {
  const lineas = [
    "<contexto_del_turno>",
    `fecha_actual: ${d.fecha}`,
    `fase: ${d.fase}`,
    `instruccion_de_fase: ${d.instruccionDeFase}`,
    `mensajes_del_usuario: ${d.mensajesUsuario}`,
    `intencion: ${d.intencion}`,
  ];

  if (d.vigente) {
    lineas.push(
      `version_vigente: ${d.vigente.version}`,
      `requerimiento_vigente: ${escaparDelimitadores(JSON.stringify(d.vigente.requerimiento))}`,
      "motivos_de_completitud:",
      lista(d.motivos),
      "observaciones:",
      lista(d.observaciones),
    );
  } else {
    lineas.push("version_vigente: ninguna");
  }

  if (d.correccion) {
    lineas.push(`correccion: ${escaparDelimitadores(d.correccion)}`);
  }

  lineas.push("</contexto_del_turno>");
  return lineas.join("\n");
}
