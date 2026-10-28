"use client";

import { useId } from "react";

import { versionVigente } from "@/domain/session";
import { useInterview } from "@/features/workspace/interview-provider";

/** Selector de la versión que se mira. Las anteriores son de solo lectura. */
export function VersionSwitcher() {
  const { sesion, verVersion } = useInterview();
  const id = useId();
  const vigente = versionVigente(sesion);
  if (!vigente) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Versión
      </label>
      <select
        id={id}
        value={sesion.versionVisible ?? vigente.version}
        onChange={(e) => verVersion(Number(e.target.value))}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {sesion.versiones.map((v) => (
          <option key={v.version} value={v.version}>
            v{v.version}
            {v.version === vigente.version ? " · vigente" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
