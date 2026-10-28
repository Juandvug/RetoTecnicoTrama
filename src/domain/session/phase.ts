import type { Completitud } from "@/domain/requirement";

import { contarMensajesUsuario, versionVigente } from "./guards";
import type { Fase, Sesion } from "./types";

// La fase se deriva de forma determinista del estado observable; el LLM decide
// qué hacer dentro de cada fase (ADR-0007). La comparten cliente y servidor.

export type ResumenFase = {
  completitudVigente: Completitud | null; // null: no hay versión
  confirmada: boolean;
  mensajesUsuario: number; // total de la sesión, incluido el actual
  turnosSinVersionNueva: number;
};

export type UmbralesDeFase = {
  /** Con esta cantidad de mensajes del usuario y sin versión, la propuesta es obligatoria. */
  maxMensajesDelimitar: number;
  /** Con esta cantidad de turnos sin versión nueva y faltan_datos, se fuerza el cierre. */
  maxTurnosSinVersion: number;
};

export const UMBRALES_POR_DEFECTO: UmbralesDeFase = {
  maxMensajesDelimitar: 3,
  maxTurnosSinVersion: 3,
};

export function derivarFase(
  resumen: ResumenFase,
  umbrales: UmbralesDeFase = UMBRALES_POR_DEFECTO,
): { fase: Fase; cierre: boolean } {
  if (resumen.confirmada) return { fase: "confirmado", cierre: false };

  if (resumen.completitudVigente === null) {
    const fase =
      resumen.mensajesUsuario >= umbrales.maxMensajesDelimitar
        ? "proponer"
        : "delimitar";
    return { fase, cierre: false };
  }

  if (resumen.completitudVigente === "suficiente_para_confirmar")
    return { fase: "confirmar", cierre: false };

  return {
    fase: "pedir",
    cierre: resumen.turnosSinVersionNueva >= umbrales.maxTurnosSinVersion,
  };
}

export function resumenDeFase(s: Sesion): ResumenFase {
  return {
    completitudVigente: versionVigente(s)?.analisis.completitudEfectiva ?? null,
    confirmada: s.confirmacion !== null,
    mensajesUsuario: contarMensajesUsuario(s),
    turnosSinVersionNueva: s.turnosSinVersionNueva,
  };
}

export const faseDeSesion = (s: Sesion, umbrales?: UmbralesDeFase) =>
  derivarFase(resumenDeFase(s), umbrales);
