import type { ReactNode } from "react";

import type { Mensaje } from "@/domain/session";
import { cn } from "@/lib/utils";

import { TurnError } from "./turn-error";

// Estilos de la tabla "Estilos de la app" del enunciado. La etiqueta va sobre
// el fondo de la columna (bg-sidebar) y no dentro de la burbuja: sobre bg-muted,
// text-muted-foreground no llega al contraste 4,5:1 en el tema claro.

type Props = {
  rol: Mensaje["rol"];
  children: ReactNode;
  /** Un mensaje fallido se marca con borde punteado, no con color. */
  fallido?: boolean;
  pie?: ReactNode;
};

export function Burbuja({ rol, children, fallido = false, pie }: Props) {
  const agente = rol === "assistant";
  return (
    <article aria-label={agente ? "Mensaje del agente" : "Tu mensaje"}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {agente ? "Agente" : "Vos"}
      </p>
      <div
        className={cn(
          "rounded-md border p-2 text-sm",
          agente ? "bg-muted" : "border-foreground/20",
          fallido && "border-dashed",
        )}
      >
        <p className="break-words whitespace-pre-wrap">{children}</p>
        {pie}
      </div>
    </article>
  );
}

export function Message({ mensaje }: { mensaje: Mensaje }) {
  return (
    <Burbuja
      rol={mensaje.rol}
      fallido={mensaje.estado === "fallido"}
      pie={
        mensaje.estado === "enviando" ? (
          <p className="mt-1 text-xs text-muted-foreground">Enviando…</p>
        ) : mensaje.estado === "fallido" ? (
          <TurnError mensaje={mensaje} />
        ) : null
      }
    >
      {mensaje.contenido}
    </Burbuja>
  );
}
