"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import {
  canConfirm,
  faseDeSesion,
  hidratarSesion,
  mensajeFallido,
  puedeEnviar,
  sesionVacia,
  sessionReducer,
  type AvisoDeHidratacion,
  type Fase,
  type Permiso,
  type Sesion,
} from "@/domain/session";
import { enviarTurno, type ErrorDeApi } from "@/lib/api-client";
import { ahoraIso, nuevoId } from "@/lib/ids";
import { guardarSesion, leerSesionGuardada } from "@/lib/storage";

import { armarSnapshot } from "./snapshot";

// Store de la sesión (ADR-0003): el reducer puro del dominio, la persistencia
// en localStorage y el ejecutor de turnos. La UI de chat y panel solo habla con
// useInterview().

type EstadoDelWorkspace = {
  sesion: Sesion;
  /** false hasta leer localStorage, que solo existe después del montaje. */
  hidratada: boolean;
  aviso: AvisoDeHidratacion | null;
  /** El servidor respondió 401: se pide el código antes de seguir. */
  accesoRequerido: boolean;
  /** turnId → instante (ms) desde el que se puede reintentar, por un 429. */
  esperas: Record<string, number>;
  /** La última versión que llegó en esta visita (no al hidratar), para anunciarla. */
  recibida: number | null;
  /** Llegó una versión nueva que la pestaña del panel todavía no mostró. */
  novedad: boolean;
};

type AccionDelWorkspace =
  | { tipo: "sesion"; evento: Parameters<typeof sessionReducer>[1] }
  | { tipo: "hidratacion"; sesion: Sesion; aviso: AvisoDeHidratacion | null }
  | { tipo: "aviso_descartado" }
  | { tipo: "acceso"; requerido: boolean }
  | { tipo: "espera"; turnId: string; hasta: number }
  | { tipo: "novedad_vista" };

function workspaceReducer(
  estado: EstadoDelWorkspace,
  accion: AccionDelWorkspace,
): EstadoDelWorkspace {
  switch (accion.tipo) {
    case "sesion": {
      const sesion = sessionReducer(estado.sesion, accion.evento);
      if (sesion === estado.sesion) return estado;
      if (accion.evento.tipo === "reiniciado") {
        return {
          ...estado,
          sesion,
          esperas: {},
          recibida: null,
          novedad: false,
        };
      }
      const nueva = sesion.versiones.length > estado.sesion.versiones.length;
      return nueva
        ? {
            ...estado,
            sesion,
            recibida: sesion.versiones.length,
            novedad: true,
          }
        : { ...estado, sesion };
    }
    case "hidratacion":
      return {
        ...estado,
        sesion: sessionReducer(estado.sesion, {
          tipo: "hidratado",
          sesion: accion.sesion,
        }),
        hidratada: true,
        aviso: accion.aviso,
      };
    case "aviso_descartado":
      return { ...estado, aviso: null };
    case "acceso":
      return { ...estado, accesoRequerido: accion.requerido };
    case "novedad_vista":
      return estado.novedad ? { ...estado, novedad: false } : estado;
    case "espera":
      return {
        ...estado,
        esperas: { ...estado.esperas, [accion.turnId]: accion.hasta },
      };
  }
}

export type Interview = {
  sesion: Sesion;
  hidratada: boolean;
  aviso: AvisoDeHidratacion | null;
  fase: Fase;
  confirmacion: Permiso;
  accesoRequerido: boolean;
  /** "Nueva versión v3 · Faltan datos" para la región aria-live, o "". */
  anuncio: string;
  novedad: boolean;
  marcarNovedadVista(): void;
  /** Instante (ms) desde el que se puede reintentar ese turno, o null. */
  reintentableDesde(turnId: string): number | null;
  enviar(texto: string): Permiso;
  reintentar(turnId: string): void;
  editarFallido(turnId: string): void;
  actualizarBorrador(texto: string): void;
  iniciarAjuste(): void;
  confirmar(): void;
  reabrir(): void;
  verVersion(version: number | null): void;
  reiniciar(): void;
  descartarAviso(): void;
  accesoConcedido(): void;
};

const ContextoDeEntrevista = createContext<Interview | null>(null);

export function useInterview(): Interview {
  const contexto = use(ContextoDeEntrevista);
  if (!contexto) {
    throw new Error("useInterview() necesita un <InterviewProvider>.");
  }
  return contexto;
}

const aErrorDeMensaje = ({ code, message, retryable }: ErrorDeApi) => ({
  code,
  message,
  retryable,
});

export function InterviewProvider({
  accesoInicial,
  children,
}: {
  /** Si el servidor ya vio una cookie de sesión válida al renderizar la página. */
  accesoInicial: boolean;
  children: ReactNode;
}) {
  const [estado, despachar] = useReducer(workspaceReducer, undefined, () => ({
    sesion: sesionVacia(),
    hidratada: false,
    aviso: null,
    accesoRequerido: !accesoInicial,
    esperas: {},
    recibida: null,
    novedad: false,
  }));
  const { sesion, hidratada } = estado;
  const enVuelo = useRef<{ turnId: string; control: AbortController } | null>(
    null,
  );

  const evento = useCallback(
    (e: Parameters<typeof sessionReducer>[1]) =>
      despachar({ tipo: "sesion", evento: e }),
    [],
  );

  // La sesión guardada se lee después del montaje: el HTML del servidor no la
  // conoce, y leerla durante el render rompería la hidratación de React.
  useEffect(() => {
    const { sesion: guardada, aviso } = hidratarSesion(leerSesionGuardada());
    despachar({ tipo: "hidratacion", sesion: guardada, aviso });
  }, []);

  // Cada cambio se guarda antes de que salga el turno: el efecto de
  // persistencia se declara antes que el del ejecutor, y React los corre en
  // ese orden. Así un mensaje "enviando" ya está en localStorage (ADR-0004).
  useEffect(() => {
    if (hidratada) guardarSesion(sesion);
  }, [sesion, hidratada]);

  // Ejecutor de turnos: cuando hay un turno en curso que todavía no salió (un
  // envío nuevo o un reintento con el mismo turnId), lo manda.
  useEffect(() => {
    const turnId = sesion.turnoEnCurso;
    if (!hidratada || !turnId || enVuelo.current?.turnId === turnId) return;

    const control = new AbortController();
    enVuelo.current = { turnId, control };
    const liberar = () => {
      if (enVuelo.current?.control === control) enVuelo.current = null;
    };

    enviarTurno(armarSnapshot(sesion, turnId), control.signal).then(
      (resultado) => {
        liberar();
        if (resultado.ok) {
          evento({
            tipo: "turno_resuelto",
            turnId,
            mensajeId: nuevoId(),
            mensaje: resultado.datos.mensaje,
            propuesta: resultado.datos.propuesta,
            promptVersion: resultado.datos.meta.promptVersion,
            en: ahoraIso(),
          });
          return;
        }
        const { error } = resultado;
        evento({
          tipo: "turno_fallido",
          turnId,
          error: aErrorDeMensaje(error),
        });
        if (error.status === 401)
          despachar({ tipo: "acceso", requerido: true });
        if (error.retryAfterSec) {
          despachar({
            tipo: "espera",
            turnId,
            hasta: Date.now() + error.retryAfterSec * 1000,
          });
        }
      },
      // Solo se rechaza por una cancelación propia (reinicio o desmontaje): el
      // reducer ya descarta cualquier respuesta de ese turno.
      liberar,
    );
  }, [sesion, hidratada, evento]);

  useEffect(() => () => enVuelo.current?.control.abort(), []);

  const valor = useMemo<Interview>(() => {
    const fallido = mensajeFallido(sesion);
    const recibida = sesion.versiones.find(
      (v) => v.version === estado.recibida,
    );
    return {
      sesion,
      hidratada,
      aviso: estado.aviso,
      fase: faseDeSesion(sesion).fase,
      confirmacion: canConfirm(sesion),
      accesoRequerido: estado.accesoRequerido,
      anuncio: recibida
        ? `Nueva versión v${recibida.version} · ${
            recibida.analisis.completitudEfectiva ===
            "suficiente_para_confirmar"
              ? "Esperando confirmación"
              : "Faltan datos"
          }`
        : "",
      novedad: estado.novedad,
      marcarNovedadVista: () => despachar({ tipo: "novedad_vista" }),
      reintentableDesde: (turnId) => estado.esperas[turnId] ?? null,
      enviar(texto) {
        const permiso = puedeEnviar(sesion, texto);
        if (!hidratada || !permiso.permitido) return permiso;
        evento({
          tipo: "mensaje_enviado",
          turnId: nuevoId(),
          mensajeId: nuevoId(),
          contenido: texto,
          en: ahoraIso(),
        });
        return permiso;
      },
      reintentar(turnId) {
        if (fallido?.turnId === turnId) evento({ tipo: "reintento" });
      },
      editarFallido(turnId) {
        if (fallido?.turnId === turnId) evento({ tipo: "edicion" });
      },
      actualizarBorrador: (texto) =>
        evento({ tipo: "borrador_actualizado", texto }),
      iniciarAjuste: () => evento({ tipo: "ajuste_iniciado" }),
      confirmar: () => evento({ tipo: "confirmado", en: ahoraIso() }),
      reabrir: () => evento({ tipo: "reabierto" }),
      verVersion: (version) =>
        evento({ tipo: "version_seleccionada", version }),
      reiniciar() {
        enVuelo.current?.control.abort();
        enVuelo.current = null;
        evento({ tipo: "reiniciado" });
      },
      descartarAviso: () => despachar({ tipo: "aviso_descartado" }),
      accesoConcedido() {
        despachar({ tipo: "acceso", requerido: false });
        // El mensaje que se cortó por falta de sesión sale de nuevo, con el
        // mismo turnId (ARCHITECTURE §8.3).
        if (fallido?.error?.code === "ACCESS_REQUIRED") {
          evento({ tipo: "reintento" });
        }
      },
    };
  }, [sesion, hidratada, estado, evento]);

  return <ContextoDeEntrevista value={valor}>{children}</ContextoDeEntrevista>;
}
