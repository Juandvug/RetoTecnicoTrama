import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { TurnoInput, TurnoResponse } from "@/contracts/interview";
import { CLAVE_STORAGE, type Propuesta, type Sesion } from "@/domain/session";
import { InterviewWorkspace } from "@/features/workspace/interview-workspace";

import { PROMPT } from "./sesiones";

// Render del workspace completo y un fetch simulado para los tests de UI.

export type Llamada = { url: string; cuerpo: unknown };

type Responder = (url: string, cuerpo: unknown) => Response | Promise<Response>;

/** Reemplaza fetch y registra cada llamada con su cuerpo ya parseado. */
export function simularFetch(responder: Responder) {
  const llamadas: Llamada[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    llamadas.push({ url, cuerpo });
    return responder(url, cuerpo);
  });
  vi.stubGlobal("fetch", fetch);
  return { llamadas, fetch };
}

export const json = (cuerpo: unknown, status = 200, cabeceras = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json", ...cabeceras },
  });

export function respuestaDeTurno(
  input: TurnoInput,
  mensaje = "Respuesta del agente",
  propuesta: Propuesta | null = null,
): TurnoResponse {
  return {
    turnId: input.turnId,
    mensaje,
    propuesta,
    meta: {
      fase: "delimitar",
      cierre: false,
      promptVersion: PROMPT,
      llamadas: 1,
      reparaciones: 0,
      guardaCifras: "ok",
    },
  };
}

export const errorHttp = (
  status: number,
  code: string,
  retryable: boolean,
  retryAfterSec?: number,
) =>
  json(
    {
      error: {
        code,
        message: `Error ${code}`,
        retryable,
        ...(retryAfterSec ? { retryAfterSec } : {}),
      },
    },
    status,
  );

/** Guarda la sesión como si viniera de una visita anterior. */
export const guardar = (sesion: Sesion) =>
  window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(sesion));

export const leerGuardada = (): Sesion =>
  JSON.parse(window.localStorage.getItem(CLAVE_STORAGE) ?? "null");

/** Renderiza el workspace y espera a que la sesión guardada se hidrate. */
export async function renderWorkspace({
  sesion,
  acceso = true,
}: { sesion?: Sesion; acceso?: boolean } = {}) {
  if (sesion) guardar(sesion);
  const resultado = render(<InterviewWorkspace accesoInicial={acceso} />);
  if (acceso) {
    // El composer se habilita al hidratar (si la sesión no está confirmada).
    await screen.findByRole("log");
  }
  return resultado;
}
