import type { Cobertura, ReglaCandidata } from "@/domain/requirement";
import { cn } from "@/lib/utils";

import { Marca, resaltado } from "./marca";

/** Una regla con su cobertura: sin datos, el borde es punteado y se dice qué falta. */
export function RuleItem({
  regla,
  cobertura,
  marca,
}: {
  regla: ReglaCandidata;
  cobertura: Cobertura["reglas"][string] | undefined;
  marca: "nuevo" | "cambió" | null;
}) {
  const cubierta = cobertura?.cubierta ?? false;
  return (
    <li
      data-cubierta={cubierta}
      className={cn("rounded-md border p-2", !cubierta && "border-dashed")}
    >
      <p className={resaltado(marca)}>
        <span className="font-medium">{regla.id}</span> {regla.enunciado}
        <Marca tipo={marca} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Usa: {regla.usa.join(", ")}
      </p>
      <p className={cn("mt-1 text-xs", !cubierta && "font-medium")}>
        {cubierta
          ? "Cubierta: las fuentes alimentan todo lo que usa."
          : `Sin datos para: ${(cobertura?.faltantes ?? regla.usa).join(", ")}`}
      </p>
    </li>
  );
}
