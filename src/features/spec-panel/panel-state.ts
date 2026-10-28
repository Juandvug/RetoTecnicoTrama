import { diffVersiones, type DiffRequerimiento } from "@/domain/requirement";
import {
  versionVigente,
  type Sesion,
  type VersionRequerimiento,
} from "@/domain/session";

// Estado del panel (ARCHITECTURE §8.4). Se deriva de la sesión: la versión que
// se mira, si es la vigente, si está confirmada y si es suficiente.

export type EstadoDelPanel =
  | { tipo: "sin_propuesta" }
  | { tipo: "faltan_datos"; version: number; motivos: string[] }
  | { tipo: "esperando_confirmacion"; version: number }
  | { tipo: "confirmado"; version: number }
  | { tipo: "anterior"; version: number; reemplazadaPor: number };

export type VistaDelPanel = {
  estado: EstadoDelPanel;
  /** La versión que se muestra, o null si todavía no hay ninguna. */
  visible: VersionRequerimiento | null;
  /** Cambios respecto de la versión anterior a la visible; null en v1. */
  diff: DiffRequerimiento | null;
};

const SIN_MOTIVOS = "El agente todavía marca el requerimiento como incompleto.";

export function vistaDelPanel(sesion: Sesion): VistaDelPanel {
  const vigente = versionVigente(sesion);
  if (!vigente)
    return { estado: { tipo: "sin_propuesta" }, visible: null, diff: null };

  const visible =
    sesion.versiones.find((v) => v.version === sesion.versionVisible) ??
    vigente;
  const previa = sesion.versiones.find(
    (v) => v.version === visible.version - 1,
  );
  const diff = previa
    ? diffVersiones(previa.requerimiento, visible.requerimiento)
    : null;

  let estado: EstadoDelPanel;
  if (visible.version < vigente.version) {
    estado = {
      tipo: "anterior",
      version: visible.version,
      reemplazadaPor: vigente.version,
    };
  } else if (sesion.confirmacion?.version === visible.version) {
    estado = { tipo: "confirmado", version: visible.version };
  } else if (
    visible.analisis.completitudEfectiva === "suficiente_para_confirmar"
  ) {
    estado = { tipo: "esperando_confirmacion", version: visible.version };
  } else {
    const motivos = visible.analisis.motivos;
    estado = {
      tipo: "faltan_datos",
      version: visible.version,
      motivos: motivos.length > 0 ? motivos : [SIN_MOTIVOS],
    };
  }

  return { estado, visible, diff };
}

export function etiquetaDelEstado(estado: EstadoDelPanel): string {
  switch (estado.tipo) {
    case "sin_propuesta":
      return "Todavía no hay requerimiento";
    case "faltan_datos":
      return "Faltan datos";
    case "esperando_confirmacion":
      return "Esperando confirmación";
    case "confirmado":
      return `Confirmado · v${estado.version}`;
    case "anterior":
      return `v${estado.version} · reemplazada por v${estado.reemplazadaPor}`;
  }
}

/** "nuevo" o "cambió" para un elemento, según el diff con la versión anterior. */
export function marcaDe(
  cambios: { agregados: string[]; modificados: string[] } | undefined,
  clave: string,
): "nuevo" | "cambió" | null {
  if (!cambios) return null;
  if (cambios.agregados.includes(clave)) return "nuevo";
  if (cambios.modificados.includes(clave)) return "cambió";
  return null;
}
