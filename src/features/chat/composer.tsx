"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { puedeEnviar, versionVigente } from "@/domain/session";
import { useInterview } from "@/features/workspace/interview-provider";

/**
 * Enter envía y Shift+Enter inserta un salto de línea. Mientras un método de
 * entrada (IME) está componiendo, Enter confirma la composición y no envía.
 * El borrador vive en la sesión, así que sobrevive a una recarga.
 */
export function Composer() {
  const { sesion, hidratada, enviar, actualizarBorrador } = useInterview();
  const campo = useRef<HTMLTextAreaElement>(null);
  const idMotivo = useId();
  const idCampo = useId();
  const [rechazo, setRechazo] = useState<string | null>(null);

  const ajustando = sesion.intencion === "ajuste";
  const vigente = versionVigente(sesion);
  // El bloqueo que no depende del texto: turno en curso, fallido o confirmado.
  const bloqueo = puedeEnviar(sesion, "·").motivo;
  const confirmada = sesion.confirmacion !== null;

  useEffect(() => {
    if (ajustando) campo.current?.focus();
  }, [ajustando]);

  const enviarBorrador = () => {
    const permiso = enviar(sesion.borrador);
    setRechazo(permiso.permitido ? null : permiso.motivo);
  };

  const alPresionar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // keyCode 229: algunos navegadores lo usan durante la composición del IME.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    enviarBorrador();
  };

  const motivo = bloqueo ?? rechazo;

  return (
    <form
      className="border-t px-6 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviarBorrador();
      }}
    >
      <label
        htmlFor={idCampo}
        className={ajustando ? "mb-2 block text-xs font-medium" : "sr-only"}
      >
        {ajustando && vigente
          ? `Ajuste de v${vigente.version}: contá qué querés cambiar`
          : "Mensaje para el agente"}
      </label>
      <div className="flex items-end gap-2">
        <Textarea
          ref={campo}
          id={idCampo}
          value={sesion.borrador}
          onChange={(e) => {
            actualizarBorrador(e.target.value);
            if (rechazo) setRechazo(null);
          }}
          onKeyDown={alPresionar}
          disabled={!hidratada || confirmada}
          placeholder="Escribí tu mensaje"
          aria-describedby={motivo ? idMotivo : undefined}
          className="max-h-48 min-h-16 rounded-lg"
        />
        <Button
          type="submit"
          disabled={!hidratada || bloqueo !== null || !sesion.borrador.trim()}
          aria-describedby={motivo ? idMotivo : undefined}
        >
          Enviar
        </Button>
      </div>
      {motivo && (
        <p id={idMotivo} className="mt-2 text-xs text-muted-foreground">
          {motivo}
        </p>
      )}
    </form>
  );
}
