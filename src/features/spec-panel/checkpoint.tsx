"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { versionVigente, type VersionRequerimiento } from "@/domain/session";
import { useInterview } from "@/features/workspace/interview-provider";

import { ExportMenu } from "./export-menu";

/**
 * Ajustar y Confirmar (o Reabrir, si ya está confirmado), la exportación y
 * Nueva entrevista. Confirmar deshabilitado muestra el motivo y lo enlaza con
 * aria-describedby.
 */
export function Checkpoint({
  visible,
}: {
  visible: VersionRequerimiento | null;
}) {
  const { sesion, confirmacion, iniciarAjuste, confirmar, reabrir } =
    useInterview();
  const idMotivo = useId();
  const vigente = versionVigente(sesion);
  const confirmada = sesion.confirmacion !== null;
  const puedeAjustar =
    vigente !== null && !confirmada && sesion.turnoEnCurso === null;

  return (
    <div className="border-t px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {confirmada ? (
          <Button variant="outline" onClick={reabrir}>
            Reabrir
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={iniciarAjuste}
              disabled={!puedeAjustar}
              aria-pressed={sesion.intencion === "ajuste"}
            >
              Ajustar
            </Button>
            <Button
              onClick={confirmar}
              disabled={!confirmacion.permitido}
              aria-describedby={confirmacion.permitido ? undefined : idMotivo}
            >
              Confirmar
            </Button>
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportMenu version={visible} />
          <NuevaEntrevista />
        </div>
      </div>
      {!confirmada && confirmacion.motivo && (
        <p id={idMotivo} className="mt-2 text-xs text-muted-foreground">
          {confirmacion.motivo}
        </p>
      )}
      {confirmada && (
        <p className="mt-2 text-xs text-muted-foreground">
          Confirmaste v{sesion.confirmacion?.version}. Reabrí para seguir
          ajustando.
        </p>
      )}
    </div>
  );
}

/** Reinicia la sesión, con un paso de confirmación para no borrar por error. */
function NuevaEntrevista() {
  const { sesion, reiniciar } = useInterview();
  const [preguntando, setPreguntando] = useState(false);
  const vacia = sesion.mensajes.length === 0 && !sesion.borrador;

  if (!preguntando) {
    return (
      <Button
        variant="ghost"
        disabled={vacia}
        onClick={() => setPreguntando(true)}
      >
        Nueva entrevista
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label="Confirmar nueva entrevista"
      className="flex gap-2"
    >
      <Button
        variant="destructive"
        autoFocus
        onClick={() => {
          reiniciar();
          setPreguntando(false);
        }}
      >
        Borrar y empezar
      </Button>
      <Button variant="ghost" onClick={() => setPreguntando(false)}>
        Cancelar
      </Button>
    </div>
  );
}
