import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { etiquetaDelEstado, type EstadoDelPanel } from "./panel-state";

// Cada estado combina grosor de borde, borde punteado o sólido, fondo y peso de
// fuente, además de la etiqueta: ninguno depende del color (ARCHITECTURE §8.4).
// El texto va en text-foreground: sobre bg-muted y bg-foreground/5,
// text-muted-foreground no llega al contraste 4,5:1 en el tema claro.
const CONTENEDOR: Record<EstadoDelPanel["tipo"], string> = {
  sin_propuesta: "border border-dashed bg-muted",
  faltan_datos: "border border-dashed bg-background",
  esperando_confirmacion: "border bg-foreground/5 font-medium",
  confirmado: "border-2 bg-foreground/5 font-semibold",
  anterior: "border border-dashed bg-muted",
};

export function CompletenessBadge({
  estado,
  children,
}: {
  estado: EstadoDelPanel;
  children?: ReactNode;
}) {
  return (
    <div
      data-estado={estado.tipo}
      className={cn("rounded-md p-3 text-sm", CONTENEDOR[estado.tipo])}
    >
      <p className={estado.tipo === "faltan_datos" ? "font-medium" : undefined}>
        {etiquetaDelEstado(estado)}
      </p>
      {estado.tipo === "faltan_datos" && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 font-normal">
          {estado.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
