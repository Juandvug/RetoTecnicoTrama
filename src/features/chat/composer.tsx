"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  LIMITE_MENSAJE_USUARIO,
  puedeEnviar,
  versionVigente,
} from "@/domain/session";
import { useInterview } from "@/features/workspace/interview-provider";

const formato = new Intl.NumberFormat("es-AR");
/** Desde este largo se muestra el contador, antes de que el límite sorprenda. */
const AVISO_DESDE = Math.floor(LIMITE_MENSAJE_USUARIO * 0.8);

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

  // Se avisa al pegar o escribir, no solo al intentar enviar: un texto largo
  // pegado de golpe no puede parecer que el sistema no hace nada.
  const largo = sesion.borrador.trim().length;
  const excedido = largo > LIMITE_MENSAJE_USUARIO;
  const motivo =
    bloqueo ??
    (excedido ? puedeEnviar(sesion, sesion.borrador).motivo : rechazo);

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
          disabled={
            !hidratada ||
            bloqueo !== null ||
            excedido ||
            !sesion.borrador.trim()
          }
          aria-describedby={motivo ? idMotivo : undefined}
        >
          Enviar
        </Button>
      </div>
      {(motivo || largo >= AVISO_DESDE) && (
        <div className="mt-2 flex items-start justify-between gap-4 text-xs">
          <p
            id={idMotivo}
            role={excedido ? "alert" : undefined}
            className={
              excedido ? "font-medium text-foreground" : "text-muted-foreground"
            }
          >
            {motivo}
          </p>
          {largo >= AVISO_DESDE && (
            <span
              className={`shrink-0 tabular-nums ${excedido ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {formato.format(largo)} / {formato.format(LIMITE_MENSAJE_USUARIO)}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
