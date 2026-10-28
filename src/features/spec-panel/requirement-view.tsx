import { useId, type ReactNode } from "react";

import type { DiffRequerimiento } from "@/domain/requirement";
import type { VersionRequerimiento } from "@/domain/session";

import { Marca, resaltado } from "./marca";
import { marcaDe } from "./panel-state";
import { RuleItem } from "./rule-item";
import { SourceCard } from "./source-card";

// Las secciones del panel, en el orden de ARCHITECTURE §8.4 (2 a 10).

function Seccion({
  titulo,
  cambio = false,
  children,
}: {
  titulo: string;
  cambio?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3
        id={id}
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {titulo}
        <Marca tipo={cambio ? "cambió" : null} />
      </h3>
      {children}
    </section>
  );
}

const SinDefinir = () => (
  <p className="text-sm text-muted-foreground">Sin definir</p>
);
const Ninguna = ({ texto = "Ninguna" }: { texto?: string }) => (
  <p className="text-sm text-muted-foreground">{texto}</p>
);

export function RequirementView({
  version,
  diff,
}: {
  version: VersionRequerimiento;
  diff: DiffRequerimiento | null;
}) {
  const { requerimiento: req, analisis } = version;
  const cambio = (campo: DiffRequerimiento["campos"][number]) =>
    diff?.campos.includes(campo) ?? false;

  const quitados = diff
    ? [
        ...diff.clases.quitados,
        ...diff.relaciones.quitados,
        ...diff.reglas.quitados,
        ...diff.fuentes.quitados,
        ...diff.columnas.quitados,
      ]
    : [];

  return (
    <div className="space-y-6 text-sm">
      {quitados.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Respecto de v{version.version - 1} se quitó: {quitados.join(", ")}
        </p>
      )}

      <Seccion titulo="Necesidad" cambio={cambio("necesidad")}>
        <p>{req.necesidad}</p>
      </Seccion>

      <Seccion titulo="Decisión objetivo" cambio={cambio("decision_objetivo")}>
        {req.decision_objetivo ? (
          <p>{req.decision_objetivo}</p>
        ) : (
          <SinDefinir />
        )}
      </Seccion>

      <Seccion
        titulo="Alcance"
        cambio={cambio("alcance.periodo") || cambio("alcance.unidades")}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Período</dt>
          <dd>{req.alcance.periodo ?? "Sin definir"}</dd>
          <dt className="text-muted-foreground">Unidades</dt>
          <dd>
            {req.alcance.unidades.length > 0
              ? req.alcance.unidades.join(", ")
              : "Todas"}
          </dd>
        </dl>
      </Seccion>

      <Seccion titulo="Clases">
        <ul className="flex flex-wrap gap-1.5">
          {req.esquema.clases.map((clase) => {
            const marca = marcaDe(diff?.clases, clase);
            return (
              <li
                key={clase}
                className={`rounded-md border px-1.5 py-0.5 ${resaltado(marca)}`}
              >
                {clase}
                <Marca tipo={marca} />
              </li>
            );
          })}
        </ul>
      </Seccion>

      <Seccion titulo="Relaciones">
        {req.esquema.relaciones.length > 0 ? (
          <ul className="space-y-1">
            {req.esquema.relaciones.map((r) => {
              const marca = marcaDe(diff?.relaciones, r.predicado);
              return (
                <li key={r.predicado} className={resaltado(marca)}>
                  {r.sujeto} —
                  <span className="font-mono text-xs">{r.predicado}</span>→{" "}
                  {r.objeto}
                  <Marca tipo={marca} />
                </li>
              );
            })}
          </ul>
        ) : (
          <Ninguna />
        )}
      </Seccion>

      <Seccion titulo="Reglas candidatas">
        {req.reglas_candidatas.length > 0 ? (
          <ul className="space-y-2">
            {req.reglas_candidatas.map((regla) => (
              <RuleItem
                key={regla.id}
                regla={regla}
                cobertura={analisis.cobertura.reglas[regla.id]}
                marca={marcaDe(diff?.reglas, regla.id)}
              />
            ))}
          </ul>
        ) : (
          <Ninguna />
        )}
      </Seccion>

      <Seccion titulo="Fuentes requeridas">
        {req.fuentes_requeridas.length > 0 ? (
          <ul className="space-y-3">
            {req.fuentes_requeridas.map((fuente) => (
              <SourceCard key={fuente.nombre} fuente={fuente} diff={diff} />
            ))}
          </ul>
        ) : (
          <Ninguna />
        )}
      </Seccion>

      <Seccion titulo="Preguntas abiertas">
        {req.preguntas_abiertas.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {req.preguntas_abiertas.map((p) => {
              const marca = marcaDe(diff?.preguntas_abiertas, p);
              return (
                <li key={p} className={resaltado(marca)}>
                  {p}
                  <Marca tipo={marca} />
                </li>
              );
            })}
          </ul>
        ) : (
          <Ninguna />
        )}
      </Seccion>

      <Seccion titulo="Observaciones">
        {analisis.advertencias.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5">
            {analisis.advertencias.map((o) => (
              <li key={`${o.codigo}:${o.ruta}`}>{o.mensaje}</li>
            ))}
          </ul>
        ) : (
          <Ninguna texto="Sin observaciones" />
        )}
      </Seccion>
    </div>
  );
}
