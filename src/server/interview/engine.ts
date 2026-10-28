import "server-only";

import type { TurnoInput } from "@/contracts/interview";
import {
  analizarRequerimiento,
  detectarCifras,
  validarArgumentos,
  type Analisis,
  type RequerimientoMotor,
} from "@/domain/requirement";
import { derivarFase, type Fase } from "@/domain/session";
import {
  conPlazo,
  LlmError,
  type LlmMessage,
  type LlmResponse,
  type LlmToolChoice,
} from "@/server/llm/port";

import type { InterviewDeps } from "./deps";
import { TEXTO_DE_RECHAZO, textoDeRespaldo } from "./fallbacks";
import { politicaDeTurno } from "./policy";
import { armarContexto, escaparDelimitadores } from "./prompt/context";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt/system";
import {
  definicionDeLaTool,
  INSTRUCCION_DE_CIERRE,
  NOMBRE_TOOL,
  resultadoDeLlamadaExtra,
  resultadoInvalido,
  resultadoValido,
} from "./tools";

export type GuardaDeCifras = "ok" | "corregido" | "respaldo";

export type TurnoResultado = {
  mensaje: string;
  propuesta: { requerimiento: RequerimientoMotor; analisis: Analisis } | null;
  meta: {
    fase: Fase;
    cierre: boolean;
    promptVersion: string;
    llamadas: number;
    reparaciones: number;
    guardaCifras: GuardaDeCifras;
  };
  /** Tokens del turno, para el log. No viaja al cliente. */
  uso: { tokensEntrada: number; tokensSalida: number };
};

const herramienta = { role: "tool" as const };

const esRechazo = (r: LlmResponse) =>
  r.refusal !== null ||
  (r.finishReason === "content_filter" && r.toolCalls.length === 0 && !r.text);

const instruccionDeCorreccion = (cifras: string[]) =>
  `Tu mensaje anterior incluía cifras que el usuario no aportó (${cifras.join(", ")}). Reescribilo sin ningún porcentaje ni monto, y sin afirmar resultados.`;

/**
 * Orquesta un turno completo (ARCHITECTURE §8.1): deriva la fase, arma el
 * contexto, llama al modelo, valida lo que registra, lo repara si hace falta y
 * revisa el texto antes de devolverlo. Los errores del proveedor (`LlmError`)
 * se propagan; el handler HTTP los traduce.
 */
export async function runTurn(
  input: TurnoInput,
  deps: InterviewDeps,
  signal: AbortSignal,
): Promise<TurnoResultado> {
  const { llm, clock, config, logger } = deps;

  const corpus = input.mensajes
    .filter((m) => m.rol === "user")
    .map((m) => m.contenido);
  const vigente = input.vigente;
  // El servidor recalcula el análisis de la versión vigente: no confía en el
  // cliente. Sin la guarda de cifras, que esa versión ya pasó en su turno.
  const analisisVigente = vigente
    ? analizarRequerimiento(vigente.requerimiento, corpus, {
        verificarCifras: false,
      })
    : null;

  const { fase, cierre } = derivarFase(
    {
      completitudVigente: analisisVigente?.completitudEfectiva ?? null,
      confirmada: false, // el servidor no acepta una sesión confirmada: no hay turno que correr
      mensajesUsuario: input.resumen.mensajesUsuario,
      turnosSinVersionNueva: input.resumen.turnosSinVersionNueva,
    },
    config.umbrales,
  );
  if (fase === "confirmado")
    throw new Error("Una entrevista confirmada no corre turnos.");

  const politica = politicaDeTurno(fase, cierre, input.intencion);
  const tool = definicionDeLaTool();
  const fecha = new Date(clock.now()).toISOString().slice(0, 10);

  const contexto = (correccion?: string) =>
    armarContexto({
      fecha,
      fase,
      instruccionDeFase: politica.instruccionDeFase,
      mensajesUsuario: input.resumen.mensajesUsuario,
      intencion: input.intencion,
      vigente,
      motivos: analisisVigente?.motivos ?? [],
      observaciones: analisisVigente?.advertencias.map((a) => a.mensaje) ?? [],
      correccion,
    });

  // El historial viaja solo como texto: las tool calls de turnos anteriores no
  // se reenvían (ADR-0003). Y se escapan los delimitadores del contexto.
  const conversacion: LlmMessage[] = input.mensajes.map((m) =>
    m.rol === "user"
      ? { role: "user", content: escaparDelimitadores(m.contenido) }
      : {
          role: "assistant",
          content: escaparDelimitadores(m.contenido),
          toolCalls: [],
        },
  );

  // El plazo del turno cubre todas las llamadas; la señal ya combina la del
  // request (si el usuario cierra la pestaña, se cancela la llamada en curso).
  const plazo = conPlazo(signal, config.plazoTurnoMs);
  const deadline = clock.now() + config.plazoTurnoMs;

  let llamadas = 0;
  let reparaciones = 0;
  let tokensEntrada = 0;
  let tokensSalida = 0;

  const llamar = async (
    toolChoice: LlmToolChoice,
    correccion?: string,
  ): Promise<LlmResponse> => {
    llamadas++;
    const respuesta = await llm.complete(
      {
        system: SYSTEM_PROMPT,
        context: contexto(correccion),
        messages: conversacion,
        tools: [tool],
        toolChoice,
        maxOutputTokens: config.maxOutputTokens,
      },
      plazo.signal,
      { deadline },
    );
    tokensEntrada += respuesta.usage?.inputTokens ?? 0;
    tokensSalida += respuesta.usage?.outputTokens ?? 0;
    return respuesta;
  };

  /**
   * Una llamada que solo redacta el texto para el usuario. Si no hay
   * presupuesto, el modelo se niega o falla por algo transitorio, devuelve null
   * y el turno usa el texto de respaldo: una propuesta ya validada no se pierde.
   */
  const redactar = async (correccion?: string): Promise<string | null> => {
    if (llamadas >= config.maxLlamadas) return null;
    try {
      const respuesta = await llamar("none", correccion);
      return respuesta.refusal !== null ? null : respuesta.text?.trim() || null;
    } catch (error) {
      if (
        error instanceof LlmError &&
        error.retryable &&
        !plazo.signal.aborted
      ) {
        logger.warn("redaccion_fallida", { kind: error.kind });
        return null;
      }
      throw error;
    }
  };

  try {
    let respuesta = await llamar(politica.toolChoice);
    let propuesta: TurnoResultado["propuesta"] = null;
    let texto: string | null;

    for (;;) {
      if (esRechazo(respuesta)) {
        // No es un error HTTP: el turno responde 200 con un mensaje neutro (ADR-0004).
        return {
          mensaje: TEXTO_DE_RECHAZO,
          propuesta: null,
          meta: {
            fase,
            cierre,
            promptVersion: PROMPT_VERSION,
            llamadas,
            reparaciones,
            guardaCifras: "ok",
          },
          uso: { tokensEntrada, tokensSalida },
        };
      }

      // Si llegan varias tool calls en una respuesta se procesa la primera.
      const [primera, ...otras] = respuesta.toolCalls;
      if (primera === undefined) {
        texto = respuesta.text?.trim() || null;
        break;
      }

      conversacion.push({
        role: "assistant",
        content: respuesta.text,
        toolCalls: respuesta.toolCalls,
      });
      for (const extra of otras) {
        conversacion.push({
          ...herramienta,
          toolCallId: extra.id,
          content: resultadoDeLlamadaExtra(),
        });
      }

      const validacion = validarArgumentos(primera.arguments, corpus);

      if (validacion.ok) {
        propuesta = {
          requerimiento: validacion.requerimiento,
          analisis: validacion.analisis,
        };
        conversacion.push({
          ...herramienta,
          toolCallId: primera.id,
          content: resultadoValido(
            (vigente?.version ?? 0) + 1,
            validacion.analisis,
          ),
        });
        texto = await redactar();
        break;
      }

      logger.info("tool_invalida", {
        reparaciones,
        codigos: [...new Set(validacion.errores.map((e) => e.codigo))].join(
          ",",
        ),
      });

      if (reparaciones < config.maxReparaciones) {
        reparaciones++;
        conversacion.push({
          ...herramienta,
          toolCallId: primera.id,
          content: resultadoInvalido(validacion.errores),
        });
        // El modelo corrige: se fuerza la tool para que no conteste con texto.
        respuesta = await llamar({ name: NOMBRE_TOOL });
        continue;
      }

      // Reparaciones agotadas: el turno termina sin propuesta, y la versión
      // vigente sigue siendo la anterior. Una última llamada sin tools le pide
      // al modelo que pregunte lo que falta.
      conversacion.push({
        ...herramienta,
        toolCallId: primera.id,
        content: resultadoInvalido(validacion.errores, INSTRUCCION_DE_CIERRE),
      });
      texto = await redactar();
      break;
    }

    // Guarda de cifras sobre el mensaje al usuario (ADR-0004): una corrección y,
    // si la cifra persiste, el texto de respaldo.
    let guardaCifras: GuardaDeCifras = "ok";
    if (texto) {
      const cifrasDe = (t: string) =>
        detectarCifras(t, corpus).filter((c) => c.tipo !== "numero");
      const halladas = cifrasDe(texto);
      if (halladas.length > 0) {
        const corregido = await redactar(
          instruccionDeCorreccion(halladas.map((c) => c.texto)),
        );
        if (corregido && cifrasDe(corregido).length === 0) {
          texto = corregido;
          guardaCifras = "corregido";
        } else {
          texto = null;
          guardaCifras = "respaldo";
        }
      }
    }

    const mensaje =
      texto ??
      textoDeRespaldo(
        fase,
        propuesta
          ? { completitud: propuesta.analisis.completitudEfectiva }
          : null,
      );

    return {
      mensaje,
      propuesta,
      meta: {
        fase,
        cierre,
        promptVersion: PROMPT_VERSION,
        llamadas,
        reparaciones,
        guardaCifras,
      },
      uso: { tokensEntrada, tokensSalida },
    };
  } finally {
    plazo.limpiar();
  }
}
