import { cn } from "@/lib/utils";

/** Marcador de texto para lo que cambió respecto de la versión anterior. */
export function Marca({ tipo }: { tipo: "nuevo" | "cambió" | null }) {
  if (!tipo) return null;
  return (
    <>
      {" "}
      <span className="rounded-sm border px-1 text-[0.7rem] font-semibold tracking-wide uppercase">
        {tipo}
      </span>
    </>
  );
}

/** Un elemento nuevo o cambiado va en font-semibold, además del marcador. */
export const resaltado = (tipo: "nuevo" | "cambió" | null) =>
  cn(tipo && "font-semibold");
