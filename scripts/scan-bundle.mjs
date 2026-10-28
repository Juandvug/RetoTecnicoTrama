// Escaneo del bundle del cliente (PLAN F8.4, ADR-0005): falla si .next/static
// contiene algo con forma de key de OpenAI, el nombre OPENAI_API_KEY o el valor
// de cualquier variable sensible definida en el entorno al escanear (en la CI
// y en Vercel, las del build).
//
//   node scripts/scan-bundle.mjs [directorio]   (por defecto, .next/static)

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// "sk-" a secas aparece en CSS legítimo (mask-, -webkit-mask-); una key tiene
// sk- (o sk-proj-) seguido de una cadena larga.
const PATRONES = [
  {
    nombre: "key con forma de OpenAI",
    regex: /(?<![\w-])sk-(?:proj-)?[\w-]{16,}/,
  },
  { nombre: "OPENAI_API_KEY", regex: /OPENAI_API_KEY/ },
];

export const VARIABLES_SENSIBLES = [
  "OPENAI_API_KEY",
  "ACCESS_CODE",
  "SESSION_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
];

async function* archivos(directorio) {
  for (const entrada of await readdir(directorio, { withFileTypes: true })) {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) yield* archivos(ruta);
    else yield ruta;
  }
}

/**
 * Devuelve los hallazgos: archivo y qué se encontró. Nunca incluye el valor de
 * una variable, para no filtrarlo en el log de la CI.
 */
export async function escanear(directorio, entorno = {}) {
  const valores = VARIABLES_SENSIBLES.flatMap((nombre) => {
    const valor = entorno[nombre];
    return valor && valor.length >= 8 ? [{ nombre, valor }] : [];
  });

  const hallazgos = [];
  for await (const archivo of archivos(directorio)) {
    const contenido = await readFile(archivo, "utf8");
    for (const { nombre, regex } of PATRONES) {
      if (regex.test(contenido)) hallazgos.push({ archivo, que: nombre });
    }
    for (const { nombre, valor } of valores) {
      if (contenido.includes(valor))
        hallazgos.push({ archivo, que: `el valor de ${nombre}` });
    }
  }
  return hallazgos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directorio = path.resolve(process.argv[2] ?? ".next/static");
  try {
    const hallazgos = await escanear(directorio, process.env);
    if (hallazgos.length > 0) {
      for (const h of hallazgos) {
        console.error(`✗ ${path.relative(process.cwd(), h.archivo)}: ${h.que}`);
      }
      process.exit(1);
    }
    console.log(`✓ ${path.relative(process.cwd(), directorio)}: sin secretos.`);
  } catch (error) {
    console.error(`No se pudo escanear ${directorio}: ${error.message}`);
    process.exit(2);
  }
}
