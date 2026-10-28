import { aContratoBase, type Completitud } from "@/domain/requirement";

import type { Sesion, VersionRequerimiento } from "./types";

const ETIQUETA_COMPLETITUD: Record<Completitud, string> = {
  suficiente_para_confirmar: "Suficiente para confirmar",
  faltan_datos: "Faltan datos",
};

const citar = (texto: string) =>
  texto
    .split("\n")
    .map((linea) => `> ${linea}`.trimEnd())
    .join("\n");

/** Transcripción en Markdown, con las versiones que registró cada respuesta. */
export function exportarTranscripcion(s: Sesion): string {
  const partes = ["# Transcripción de la entrevista"];

  for (const mensaje of s.mensajes) {
    const autor = mensaje.rol === "user" ? "Vos" : "Agente";
    let bloque = `## ${autor} · ${mensaje.creadoEn}\n\n${citar(mensaje.contenido)}`;
    if (mensaje.rol === "assistant") {
      const version = s.versiones.find((v) => v.turnId === mensaje.turnId);
      if (version) {
        bloque += `\n\n_Registró la versión v${version.version} · ${ETIQUETA_COMPLETITUD[version.analisis.completitudEfectiva]}._`;
      }
    }
    partes.push(bloque);
  }

  if (s.confirmacion) {
    partes.push(
      `---\n\n**Confirmada la versión v${s.confirmacion.version}** · ${s.confirmacion.en}`,
    );
  }
  return `${partes.join("\n\n")}\n`;
}

/**
 * El requerimiento como JSON. La forma extendida es la que valida el sistema;
 * la base es la del enunciado y lleva la completitud efectiva (ADR-0006).
 */
export function exportarRequerimiento(
  v: VersionRequerimiento,
  forma: "extendida" | "base",
): string {
  const contenido =
    forma === "base"
      ? aContratoBase(v.requerimiento, v.analisis.completitudEfectiva)
      : v.requerimiento;
  return `${JSON.stringify(contenido, null, 2)}\n`;
}
