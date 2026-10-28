import type { DiffRequerimiento, FuenteRequerida } from "@/domain/requirement";

import { Marca, resaltado } from "./marca";
import { marcaDe } from "./panel-state";

/** Card de una fuente: sus columnas mínimas y qué justifica cada una. */
export function SourceCard({
  fuente,
  diff,
}: {
  fuente: FuenteRequerida;
  diff: DiffRequerimiento | null;
}) {
  const marca = marcaDe(diff?.fuentes, fuente.nombre);
  return (
    <li className="rounded-xl p-4 ring-1 ring-foreground/10">
      <p className={resaltado(marca)}>
        <span className="font-medium">{fuente.nombre}</span>{" "}
        <span className="text-xs text-muted-foreground">· {fuente.tipo}</span>
        <Marca tipo={marca} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Justifica: {fuente.justifica.join(", ")}
      </p>
      <ul
        className="mt-3 space-y-1.5"
        aria-label={`Columnas de ${fuente.nombre}`}
      >
        {fuente.columnas_minimas.map((columna) => {
          const marcaColumna = marcaDe(
            diff?.columnas,
            `${fuente.nombre}.${columna.nombre}`,
          );
          return (
            <li key={columna.nombre} className={resaltado(marcaColumna)}>
              <code className="font-mono text-xs">{columna.nombre}</code>
              <Marca tipo={marcaColumna} />
              <span className="block text-xs text-muted-foreground">
                Justifica: {columna.justifica.join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
