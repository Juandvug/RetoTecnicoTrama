import "server-only";

import { detectarCifras } from "@/domain/requirement";

// Transmisión del texto con la guarda de cifras (ADR-0004): el texto sale a
// medida que llega, pero nunca una cifra que el usuario no aportó. Una cifra se
// retiene hasta ver lo que la sigue ("%", "por ciento", una moneda), que es lo
// que mira detectarCifras. Si resulta no aportada, la transmisión se corta y el
// engine corrige el texto completo, que llega en el evento final.

/** Caracteres de contexto que se esperan detrás de una cifra antes de soltarla. */
const VENTANA = 20;
const RETENER = /[\p{N}$€£%]/u;

/** Porcentajes y montos del texto que el usuario no aportó. */
export function cifrasNoAportadas(texto: string, corpus: string[]) {
  return detectarCifras(texto, corpus).filter((c) => c.tipo !== "numero");
}

const inicioDePalabra = (texto: string, i: number) => {
  const espacio = texto.slice(0, i).search(/\s\S*$/);
  return espacio === -1 ? 0 : espacio + 1;
};

/** Hasta dónde se puede transmitir el texto acumulado sin riesgo. */
export function fronteraSegura(texto: string): number {
  // La última palabra puede estar a medias: se retiene.
  const ultimoEspacio = texto.search(/\s\S*$/);
  let corte = ultimoEspacio === -1 ? 0 : ultimoEspacio + 1;
  const desde = Math.max(0, corte - VENTANA);
  const cifra = texto.slice(desde, corte).search(RETENER);
  if (cifra !== -1) corte = inicioDePalabra(texto, desde + cifra);
  return corte;
}

export type Transmisor = {
  agregar(delta: string): void;
  /** La llamada terminó: sale lo retenido, si no trae cifras no aportadas. */
  cerrar(): void;
};

export function crearTransmisor(
  corpus: string[],
  emitir: (fragmento: string) => void,
): Transmisor {
  let texto = "";
  let emitido = 0;
  let cortado = false;
  return {
    agregar(delta) {
      texto += delta;
      if (cortado) return;
      if (cifrasNoAportadas(texto, corpus).length > 0) {
        cortado = true;
        return;
      }
      const corte = fronteraSegura(texto);
      if (corte > emitido) {
        emitir(texto.slice(emitido, corte));
        emitido = corte;
      }
    },
    cerrar() {
      if (cortado || emitido === texto.length) return;
      if (cifrasNoAportadas(texto, corpus).length > 0) return;
      emitir(texto.slice(emitido));
      emitido = texto.length;
    },
  };
}
