"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatearEspera } from "@/features/chat/countdown";
import { enviarCodigo } from "@/lib/api-client";

/**
 * Pantalla del código de acceso (ADR-0005). Aparece al entrar sin sesión y
 * cuando un turno recibe 401; la entrevista guardada no se toca.
 */
export function AccessGate({ onAcceso }: { onAcceso(): void }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idCampo = useId();
  const idError = useId();

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <form
        aria-labelledby={`${idCampo}-titulo`}
        className="w-full max-w-sm space-y-4 rounded-xl p-4 ring-1 ring-foreground/10"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          const resultado = await enviarCodigo(codigo);
          setEnviando(false);
          if (resultado.ok) {
            onAcceso();
            return;
          }
          const { error } = resultado;
          setError(
            error.code === "RATE_LIMITED" && error.retryAfterSec
              ? `Demasiados intentos. Probá de nuevo en ${formatearEspera(error.retryAfterSec * 1000)}.`
              : error.message,
          );
        }}
      >
        <div className="space-y-1">
          <h2 id={`${idCampo}-titulo`} className="text-sm font-semibold">
            Código de acceso
          </h2>
          <p className="text-sm text-muted-foreground">
            La entrevista usa un modelo con presupuesto limitado. El código
            viene junto con la URL.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor={idCampo} className="text-xs font-medium">
            Código
          </label>
          <Input
            id={idCampo}
            type="password"
            autoComplete="off"
            autoFocus
            required
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value);
              setError(null);
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? idError : undefined}
          />
          {error && (
            <p id={idError} role="alert" className="text-sm font-medium">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Verificando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
