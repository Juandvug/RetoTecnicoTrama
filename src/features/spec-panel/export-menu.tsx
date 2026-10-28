"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportarRequerimiento,
  exportarTranscripcion,
  type VersionRequerimiento,
} from "@/domain/session";
import { useInterview } from "@/features/workspace/interview-provider";
import { descargar } from "@/lib/download";

/** Exporta la transcripción (Markdown) y la versión que se mira (JSON). */
export function ExportMenu({
  version,
}: {
  version: VersionRequerimiento | null;
}) {
  const { sesion } = useInterview();
  const sinMensajes = sesion.mensajes.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={sinMensajes}>
          <Download aria-hidden />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            descargar(
              "trama-transcripcion.md",
              exportarTranscripcion(sesion),
              "text/markdown",
            )
          }
        >
          Transcripción (Markdown)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!version}
          onSelect={() =>
            version &&
            descargar(
              `trama-requerimiento-v${version.version}.json`,
              exportarRequerimiento(version, "extendida"),
              "application/json",
            )
          }
        >
          Requerimiento{version ? ` v${version.version}` : ""} (JSON)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!version}
          onSelect={() =>
            version &&
            descargar(
              `trama-requerimiento-v${version.version}-base.json`,
              exportarRequerimiento(version, "base"),
              "application/json",
            )
          }
        >
          Requerimiento{version ? ` v${version.version}` : ""} (contrato base)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
