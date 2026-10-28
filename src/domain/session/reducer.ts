import {
  canConfirm,
  mensajeFallido,
  puedeEnviar,
  versionVigente,
} from "./guards";
import { SCHEMA_VERSION } from "./limits";
import type { EventoSesion, Mensaje, Sesion } from "./types";

// Reducer puro de la sesión (ARCHITECTURE §8.2). Un evento cuya guarda no se
// cumple deja el estado como estaba (misma referencia): así la UI y los tests
// pueden distinguir "no pasó nada" sin excepciones.

export function sesionVacia(): Sesion {
  return {
    schemaVersion: SCHEMA_VERSION,
    mensajes: [],
    versiones: [],
    confirmacion: null,
    turnoEnCurso: null,
    intencion: "mensaje",
    turnosSinVersionNueva: 0,
    versionVisible: null,
    borrador: "",
  };
}

const actualizarMensaje = (
  mensajes: Mensaje[],
  turnId: string,
  cambios: Partial<Mensaje>,
): Mensaje[] =>
  mensajes.map((m) =>
    m.rol === "user" && m.turnId === turnId ? { ...m, ...cambios } : m,
  );

export function sessionReducer(estado: Sesion, evento: EventoSesion): Sesion {
  switch (evento.tipo) {
    case "mensaje_enviado": {
      if (!puedeEnviar(estado, evento.contenido).permitido) return estado;
      const mensaje: Mensaje = {
        id: evento.mensajeId,
        turnId: evento.turnId,
        rol: "user",
        contenido: evento.contenido.trim(),
        estado: "enviando",
        error: null,
        creadoEn: evento.en,
      };
      return {
        ...estado,
        mensajes: [...estado.mensajes, mensaje],
        turnoEnCurso: evento.turnId,
        borrador: "",
      };
    }

    case "turno_resuelto": {
      // Una respuesta de un turno que ya no está en curso (reinicio, otra
      // respuesta anterior) se ignora.
      if (evento.turnId !== estado.turnoEnCurso) return estado;
      const respuesta: Mensaje = {
        id: evento.mensajeId,
        turnId: evento.turnId,
        rol: "assistant",
        contenido: evento.mensaje,
        estado: "enviado",
        error: null,
        creadoEn: evento.en,
      };
      const mensajes = [
        ...actualizarMensaje(estado.mensajes, evento.turnId, {
          estado: "enviado",
          error: null,
        }),
        respuesta,
      ];
      const base = {
        ...estado,
        mensajes,
        turnoEnCurso: null,
        intencion: "mensaje" as const,
      };
      if (!evento.propuesta) {
        return {
          ...base,
          turnosSinVersionNueva: estado.turnosSinVersionNueva + 1,
        };
      }
      return {
        ...base,
        versiones: [
          ...estado.versiones,
          {
            version: estado.versiones.length + 1,
            requerimiento: evento.propuesta.requerimiento,
            analisis: evento.propuesta.analisis,
            turnId: evento.turnId,
            creadaEn: evento.en,
            promptVersion: evento.promptVersion,
          },
        ],
        turnosSinVersionNueva: 0,
        versionVisible: null,
      };
    }

    case "turno_fallido": {
      if (evento.turnId !== estado.turnoEnCurso) return estado;
      return {
        ...estado,
        mensajes: actualizarMensaje(estado.mensajes, evento.turnId, {
          estado: "fallido",
          error: evento.error,
        }),
        turnoEnCurso: null,
      };
    }

    case "reintento": {
      const fallido = mensajeFallido(estado);
      if (!fallido || estado.turnoEnCurso) return estado;
      return {
        ...estado,
        mensajes: actualizarMensaje(estado.mensajes, fallido.turnId, {
          estado: "enviando",
          error: null,
        }),
        turnoEnCurso: fallido.turnId,
      };
    }

    case "edicion": {
      const fallido = mensajeFallido(estado);
      if (!fallido) return estado;
      // Ningún error borra texto: si ya se escribió algo nuevo, se conserva.
      const borrador = estado.borrador
        ? `${fallido.contenido}\n\n${estado.borrador}`
        : fallido.contenido;
      return {
        ...estado,
        mensajes: estado.mensajes.filter((m) => m !== fallido),
        borrador,
      };
    }

    case "ajuste_iniciado": {
      if (!versionVigente(estado) || estado.confirmacion || estado.turnoEnCurso)
        return estado;
      return { ...estado, intencion: "ajuste" };
    }

    case "version_seleccionada": {
      const vigente = versionVigente(estado);
      if (evento.version === null || evento.version === vigente?.version)
        return { ...estado, versionVisible: null };
      if (!estado.versiones.some((v) => v.version === evento.version))
        return estado;
      return { ...estado, versionVisible: evento.version };
    }

    case "confirmado": {
      const vigente = versionVigente(estado);
      if (!vigente || !canConfirm(estado).permitido) return estado;
      return {
        ...estado,
        confirmacion: { version: vigente.version, en: evento.en },
      };
    }

    case "reabierto": {
      if (!estado.confirmacion) return estado;
      return { ...estado, confirmacion: null };
    }

    case "reiniciado":
      // Las respuestas que lleguen después se descartan: sin turno en curso,
      // ningún turnId coincide.
      return sesionVacia();

    case "hidratado":
      return evento.sesion;

    case "borrador_actualizado":
      return { ...estado, borrador: evento.texto };
  }
}
