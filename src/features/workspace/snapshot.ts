import type { TurnoInput } from "@/contracts/interview";
import {
  armarVentana,
  contarMensajesUsuario,
  LIMITE_MENSAJE_ASISTENTE,
  presupuestoDeMensajes,
  versionVigente,
  type Sesion,
} from "@/domain/session";

/**
 * El snapshot acotado que viaja en cada turno (ADR-0003): la ventana de
 * mensajes, la versión vigente, el resumen numérico y la intención. Se arma
 * para el turno en curso, que puede ser un reintento con el mismo turnId.
 */
export function armarSnapshot(sesion: Sesion, turnId: string): TurnoInput {
  const vigente = versionVigente(sesion);
  const vigenteDto = vigente
    ? { version: vigente.version, requerimiento: vigente.requerimiento }
    : null;

  const mensajes = sesion.mensajes
    .filter((m) => m.contenido.trim().length > 0)
    .map((m) =>
      m.rol === "user"
        ? { rol: m.rol, contenido: m.contenido }
        : // El servidor acota la respuesta del agente; una respuesta más larga
          // que lo que acepta de vuelta se recorta en lugar de invalidar el turno.
          {
            rol: m.rol,
            contenido: m.contenido.slice(0, LIMITE_MENSAJE_ASISTENTE),
          },
    );

  return {
    turnId,
    mensajes: armarVentana(mensajes, {
      presupuesto: presupuestoDeMensajes(vigenteDto),
    }),
    vigente: vigenteDto,
    resumen: {
      mensajesUsuario: contarMensajesUsuario(sesion),
      turnosSinVersionNueva: sesion.turnosSinVersionNueva,
    },
    intencion: sesion.intencion,
  };
}
