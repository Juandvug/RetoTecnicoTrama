"use client";

import { Button } from "@/components/ui/button";
import { useInterview } from "@/features/workspace/interview-provider";

import { Checkpoint } from "./checkpoint";
import { CompletenessBadge } from "./completeness-badge";
import { vistaDelPanel } from "./panel-state";
import { RequirementView } from "./requirement-view";
import { VersionSwitcher } from "./version-switcher";

/**
 * El panel del requerimiento: solo muestra versiones que pasaron la validación
 * del servidor. No llama al LLM ni modifica el requerimiento (ARCHITECTURE §4.2).
 */
export function SpecPanel() {
  const { sesion, verVersion } = useInterview();
  const { estado, visible, diff } = vistaDelPanel(sesion);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <h2 id="titulo-panel" className="text-sm font-semibold">
          Requerimiento
        </h2>
        <VersionSwitcher />
      </div>
      <div
        // Enfocable para poder desplazarlo con el teclado.
        tabIndex={0}
        aria-labelledby="titulo-panel"
        role="region"
        className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <CompletenessBadge estado={estado}>
          {estado.tipo === "sin_propuesta" && (
            <p className="mt-1">
              Cuando el agente tenga lo esencial, la propuesta aparece acá.
            </p>
          )}
          {estado.tipo === "anterior" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => verVersion(null)}
            >
              Ver la vigente (v{estado.reemplazadaPor})
            </Button>
          )}
        </CompletenessBadge>
        {visible && <RequirementView version={visible} diff={diff} />}
      </div>
      <Checkpoint visible={visible} />
    </>
  );
}
