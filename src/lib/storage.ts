import { CLAVE_STORAGE, type Sesion } from "@/domain/session";

// Persistencia de la sesión en localStorage (ADR-0003). El almacenamiento
// puede no estar disponible (modo privado, cuota llena o bloqueado): en ese
// caso la entrevista sigue en memoria y no se rompe nada.

export function leerSesionGuardada(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_STORAGE);
  } catch {
    return null;
  }
}

/** Devuelve false si no se pudo guardar. */
export function guardarSesion(sesion: Sesion): boolean {
  try {
    window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(sesion));
    return true;
  } catch {
    return false;
  }
}
