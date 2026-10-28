import { observacion, type Observacion } from "./observations";
import type { RequerimientoMotor } from "./schema";

// Guarda de cifras (ADR-0004). Es heurística: detecta números escritos con
// dígitos, no cifras escritas con palabras.

export type TipoCifra = "porcentaje" | "monto" | "numero";

export type CifraDetectada = {
  texto: string; // tal como aparece, con su símbolo
  tipo: TipoCifra;
  indice: number;
  valores: string[]; // interpretaciones numéricas posibles ("1.500" → 1500 o 1.5)
};

// Un número que no es parte de un identificador (R1, v2, columna_3).
const NUMERO = /(?<![\p{L}\p{N}_.,])\d+(?:[.,]\d+)*(?![\p{L}\p{N}_])/gu;
// Las fechas (AAAA-MM o AAAA-MM-DD) no son cifras.
const FECHA = /(?<![\p{N}])\d{4}-\d{2}(?:-\d{2})?(?![\p{N}])/gu;

const MONEDAS = "USD|EUR|GBP|COP|ARS|MXN|CLP|PEN|BRL|UYU";
const PORCENTAJE_DESPUES = /^\s?(?:%|por\s?ciento)/iu;
const MONTO_ANTES = new RegExp(`(?:US\\$|\\$|€|£|\\b(?:${MONEDAS}))\\s?$`, "u");
const MONTO_DESPUES = new RegExp(
  `^\\s?(?:${MONEDAS}|d[oó]lares|pesos|euros)(?![\\p{L}])`,
  "iu",
);

/**
 * Valores numéricos posibles de un token, con punto o coma como separador de
 * miles o decimal. "1.500" puede ser 1500 o 1.5; "15,5" solo puede ser 15.5.
 */
function valores(token: string): string[] {
  const resultado = new Set<string>();
  const interpretar = (miles: string, decimal: string) => {
    const partes = token.split(decimal);
    if (partes.length > 2) return;
    const [entera = "", fraccion] = partes;
    if (fraccion?.includes(miles)) return;
    const grupos = entera.split(miles);
    if (grupos.slice(1).some((g) => g.length !== 3)) return;
    const n = Number(
      grupos.join("") + (fraccion === undefined ? "" : `.${fraccion}`),
    );
    if (Number.isFinite(n)) resultado.add(String(n));
  };
  interpretar(".", ",");
  interpretar(",", ".");
  return [...resultado];
}

function extraer(texto: string): CifraDetectada[] {
  const limpio = texto.replace(FECHA, (f) => " ".repeat(f.length));
  const cifras: CifraDetectada[] = [];
  for (const m of limpio.matchAll(NUMERO)) {
    const inicio = m.index;
    const fin = inicio + m[0].length;
    const antes = limpio.slice(Math.max(0, inicio - 4), inicio);
    const despues = limpio.slice(fin, fin + 12);

    const porcentaje = PORCENTAJE_DESPUES.exec(despues);
    const montoAntes = MONTO_ANTES.exec(antes);
    const montoDespues = MONTO_DESPUES.exec(despues);

    const tipo: TipoCifra = porcentaje
      ? "porcentaje"
      : montoAntes || montoDespues
        ? "monto"
        : "numero";
    const desde = inicio - (montoAntes?.[0].length ?? 0);
    const hasta =
      fin + (porcentaje?.[0].length ?? montoDespues?.[0].length ?? 0);

    cifras.push({
      texto: texto.slice(desde, hasta),
      tipo,
      indice: desde,
      valores: valores(m[0]),
    });
  }
  return cifras;
}

const coincide = (a: string[], b: Set<string>) => a.some((v) => b.has(v));

/** Valores que aparecen en los textos, separando los porcentajes del resto. */
function valoresDe(textos: string[]) {
  const todos = new Set<string>();
  const porcentajes = new Set<string>();
  for (const cifra of textos.flatMap(extraer)) {
    for (const v of cifra.valores) {
      todos.add(v);
      if (cifra.tipo === "porcentaje") porcentajes.add(v);
    }
  }
  return { todos, porcentajes };
}

/**
 * Cifras del texto que no aparecen en los mensajes del usuario. Un porcentaje
 * solo cuenta como aportado si el usuario dio ese mismo porcentaje; un monto o
 * un número, si dio ese valor de cualquier forma.
 */
export function detectarCifras(
  texto: string,
  corpusUsuario: string[],
): CifraDetectada[] {
  const corpus = valoresDe(corpusUsuario);
  return extraer(texto).filter(
    (c) =>
      !coincide(
        c.valores,
        c.tipo === "porcentaje" ? corpus.porcentajes : corpus.todos,
      ),
  );
}

const mensajeCifra = (cifra: CifraDetectada) =>
  `"${cifra.texto}" es una cifra que el usuario no aportó. No afirmes porcentajes ni montos: si una regla necesita un umbral, proponelo como supuesto y agregalo a preguntas_abiertas.`;

/**
 * CIFRA_NO_APORTADA y UMBRAL_NO_CONFIRMADO (ARCHITECTURE §6.3):
 * - en necesidad, decisión y período, todo porcentaje o monto no aportado es un error;
 * - en una regla, un número no aportado es un umbral: si es porcentaje o monto
 *   es un error, si no una advertencia, salvo que esté declarado como supuesto
 *   en preguntas_abiertas;
 * - en una pregunta abierta, un porcentaje o monto no aportado solo se acepta si
 *   es el umbral de alguna regla (el supuesto que se declara).
 */
export function observacionesDeCifras(
  req: RequerimientoMotor,
  corpusUsuario: string[],
): Observacion[] {
  const observaciones: Observacion[] = [];
  const enReglas = valoresDe(
    req.reglas_candidatas.map((r) => r.enunciado),
  ).todos;
  const enPreguntas = valoresDe(req.preguntas_abiertas).todos;

  const campos = [
    ["necesidad", req.necesidad],
    ["decision_objetivo", req.decision_objetivo],
    ["alcance.periodo", req.alcance.periodo],
  ] as const;
  for (const [ruta, texto] of campos) {
    if (texto === null) continue;
    for (const cifra of detectarCifras(texto, corpusUsuario)) {
      if (cifra.tipo !== "numero") {
        observaciones.push(
          observacion("CIFRA_NO_APORTADA", ruta, mensajeCifra(cifra)),
        );
      }
    }
  }

  req.reglas_candidatas.forEach((regla, i) => {
    const ruta = `reglas_candidatas[${i}].enunciado`;
    for (const cifra of detectarCifras(regla.enunciado, corpusUsuario)) {
      if (coincide(cifra.valores, enPreguntas)) continue;
      observaciones.push(
        cifra.tipo === "numero"
          ? observacion(
              "UMBRAL_NO_CONFIRMADO",
              ruta,
              `${regla.id} usa el umbral "${cifra.texto}", que el usuario no confirmó. Si es un supuesto, agregalo a preguntas_abiertas.`,
            )
          : observacion("CIFRA_NO_APORTADA", ruta, mensajeCifra(cifra)),
      );
    }
  });

  req.preguntas_abiertas.forEach((pregunta, i) => {
    for (const cifra of detectarCifras(pregunta, corpusUsuario)) {
      if (cifra.tipo === "numero" || coincide(cifra.valores, enReglas))
        continue;
      observaciones.push(
        observacion(
          "CIFRA_NO_APORTADA",
          `preguntas_abiertas[${i}]`,
          mensajeCifra(cifra),
        ),
      );
    }
  });

  return observaciones;
}
