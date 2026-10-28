"use client";

import { Button } from "@/components/ui/button";
import type { Mensaje } from "@/domain/session";
import { useInterview } from "@/features/workspace/interview-provider";

import { formatearEspera, useCuentaRegresiva } from "./countdown";

/**
 * Un turno que falló (ADR-0004): el texto se conserva, Reintentar lo reenvía
 * con el mismo turnId y Editar lo devuelve al composer. Si fue un 429, el
 * botón se habilita cuando pasa el Retry-After.
 */
export function TurnError({ mensaje }: { mensaje: Mensaje }) {
  const { reintentar, editarFallido, reintentableDesde } = useInterview();
  const restante = useCuentaRegresiva(reintentableDesde(mensaje.turnId));
  const error = mensaje.error;
  if (!error) return null;

  return (
    <div className="mt-2 border-t border-dashed pt-2">
      <p className="text-xs font-medium">No se pudo enviar</p>
      <p className="text-xs">{error.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {error.retryable && (
          <Button
            size="sm"
            variant="outline"
            disabled={restante > 0}
            onClick={() => reintentar(mensaje.turnId)}
          >
            {restante > 0
              ? `Reintentar en ${formatearEspera(restante)}`
              : "Reintentar"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editarFallido(mensaje.turnId)}
        >
          Editar
        </Button>
      </div>
    </div>
  );
}
