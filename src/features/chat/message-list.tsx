"use client";

import { useEffect, useRef } from "react";

import { useInterview } from "@/features/workspace/interview-provider";

import { Burbuja, Message } from "./message";

export const SALUDO =
  "Contame qué decisión querés tomar y con qué datos contás.";

/**
 * La transcripción. role="log" con aria-live="polite" anuncia las respuestas
 * nuevas; aria-busy las retiene mientras el agente está pensando, para que se
 * lea la respuesta completa y no el indicador.
 */
export function MessageList() {
  const { sesion } = useInterview();
  const contenedor = useRef<HTMLDivElement>(null);
  const pensando = sesion.turnoEnCurso !== null;

  useEffect(() => {
    const el = contenedor.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sesion.mensajes.length, pensando]);

  return (
    <div
      ref={contenedor}
      role="log"
      aria-live="polite"
      aria-busy={pensando}
      aria-label="Conversación"
      // Enfocable para poder desplazarla con el teclado.
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      {/* El saludo no es parte de la sesión: no viaja al modelo ni se exporta. */}
      <Burbuja rol="assistant">{SALUDO}</Burbuja>
      {sesion.mensajes.map((m) => (
        <Message key={m.id} mensaje={m} />
      ))}
      {pensando && (
        <p className="text-xs font-medium text-muted-foreground">Pensando…</p>
      )}
    </div>
  );
}
