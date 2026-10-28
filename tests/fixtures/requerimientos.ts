import type { RequerimientoMotor } from "@/domain/requirement";

// Requerimientos válidos de tres dominios, con los mensajes del usuario que los
// producirían. Son datos de prueba: su vocabulario no puede aparecer en src/
// (guarda de agnosticismo, PLAN F5.6).

export type Fixture = { requerimiento: RequerimientoMotor; corpus: string[] };

export const rotacionDePersonal: Fixture = {
  corpus: [
    "Aumentaron las renuncias en operaciones en los últimos 8 meses.",
    "Quiero decidir si cambio el esquema de turnos o el de supervisión. Empezó en febrero.",
  ],
  requerimiento: {
    necesidad:
      "Explicar el aumento de renuncias en operaciones (últimos 8 meses)",
    decision_objetivo:
      "Decidir entre cambiar esquema de turnos o de supervisión",
    alcance: { periodo: "2026-02 / 2026-10", unidades: ["Operaciones"] },
    esquema: {
      clases: ["Empleado", "Turno", "Supervisor", "Salida"],
      relaciones: [
        { sujeto: "Empleado", predicado: "asignadoA", objeto: "Turno" },
        { sujeto: "Empleado", predicado: "reportaA", objeto: "Supervisor" },
        { sujeto: "Empleado", predicado: "registra", objeto: "Salida" },
      ],
    },
    reglas_candidatas: [
      {
        id: "R1",
        enunciado:
          "Si un Empleado cambió de Turno rotativo en los 60 días previos a su Salida, la Salida se asocia a rotación",
        usa: ["Empleado", "asignadoA", "Turno", "registra", "Salida"],
      },
      {
        id: "R2",
        enunciado:
          "Si las Salidas se concentran en Empleados que reportan a un mismo Supervisor, la Salida se asocia a supervisión",
        usa: ["Empleado", "reportaA", "Supervisor", "registra", "Salida"],
      },
    ],
    fuentes_requeridas: [
      {
        nombre: "Nómina",
        tipo: "excel",
        columnas_minimas: [
          { nombre: "empleado_id", justifica: ["Empleado"] },
          { nombre: "supervisor_id", justifica: ["Supervisor", "reportaA"] },
          { nombre: "fecha_salida", justifica: ["Salida", "registra", "R1"] },
          { nombre: "motivo_salida", justifica: ["Salida"] },
        ],
        justifica: ["Salida", "R1", "R2"],
      },
      {
        nombre: "Asignación de turnos",
        tipo: "csv",
        columnas_minimas: [
          { nombre: "empleado_id", justifica: ["asignadoA"] },
          { nombre: "turno_id", justifica: ["Turno", "asignadoA"] },
          { nombre: "tipo_turno", justifica: ["Turno", "R1"] },
          { nombre: "fecha_desde", justifica: ["asignadoA", "R1"] },
        ],
        justifica: ["asignadoA", "R1"],
      },
    ],
    preguntas_abiertas: [
      "¿El motivo de salida se registra con categorías fijas o es texto libre?",
      "¿Una ventana de 60 días antes de la salida es razonable para asociarla a un cambio de turno?",
    ],
    completitud: "suficiente_para_confirmar",
  },
};

export const cuellosDeBotella: Fixture = {
  corpus: [
    "Las órdenes tardan cada vez más en salir de planta.",
    "Quiero saber en qué etapa reforzar personal o si hay que rediseñar el proceso. Desde enero.",
  ],
  requerimiento: {
    necesidad: "Encontrar en qué etapa del proceso se demoran las órdenes",
    decision_objetivo:
      "Decidir en qué etapa reforzar personal o si rediseñar el proceso",
    alcance: { periodo: "2026-01 / 2026-10", unidades: ["Planta"] },
    esquema: {
      clases: ["Orden", "Paso", "Etapa", "Responsable"],
      relaciones: [
        { sujeto: "Orden", predicado: "tienePaso", objeto: "Paso" },
        { sujeto: "Paso", predicado: "enEtapa", objeto: "Etapa" },
        { sujeto: "Paso", predicado: "atendidoPor", objeto: "Responsable" },
      ],
    },
    reglas_candidatas: [
      {
        id: "R1",
        enunciado:
          "Si el tiempo de los Pasos en una Etapa supera al de las demás Etapas, la Etapa se marca como cuello de botella",
        usa: ["Orden", "tienePaso", "Paso", "enEtapa", "Etapa"],
      },
      {
        id: "R2",
        enunciado:
          "Si los Pasos demorados de una Etapa se concentran en un mismo Responsable, la demora se asocia a ese Responsable",
        usa: ["Paso", "enEtapa", "Etapa", "atendidoPor", "Responsable"],
      },
    ],
    fuentes_requeridas: [
      {
        nombre: "Registro de etapas",
        tipo: "csv",
        columnas_minimas: [
          { nombre: "orden_id", justifica: ["Orden", "tienePaso"] },
          { nombre: "etapa", justifica: ["Etapa", "enEtapa"] },
          { nombre: "fecha_entrada", justifica: ["Paso", "R1"] },
          { nombre: "fecha_salida", justifica: ["Paso", "R1"] },
          {
            nombre: "responsable_id",
            justifica: ["Responsable", "atendidoPor"],
          },
        ],
        justifica: ["Paso", "R1", "R2"],
      },
    ],
    preguntas_abiertas: ["¿Las órdenes pueden volver a una etapa anterior?"],
    completitud: "suficiente_para_confirmar",
  },
};

export const inconsistenciasDeInventario: Fixture = {
  corpus: [
    "Los conteos físicos del depósito no coinciden con lo que dice el sistema.",
    "Queremos saber si el problema está en la recepción o en los despachos. Pasa en el depósito central, desde que cambiamos de transportista en marzo.",
    "El transportista figura solo en los remitos, en PDF.",
  ],
  requerimiento: {
    necesidad:
      "Explicar las diferencias entre los conteos físicos y el stock del sistema",
    decision_objetivo: "Reforzar el control en la recepción o en los despachos",
    alcance: { periodo: "2026-03 / 2026-10", unidades: ["Depósito central"] },
    esquema: {
      clases: [
        "Articulo",
        "Recepcion",
        "Despacho",
        "ConteoFisico",
        "Transportista",
      ],
      relaciones: [
        { sujeto: "Recepcion", predicado: "ingresa", objeto: "Articulo" },
        { sujeto: "Despacho", predicado: "egresa", objeto: "Articulo" },
        { sujeto: "ConteoFisico", predicado: "cuenta", objeto: "Articulo" },
        {
          sujeto: "Recepcion",
          predicado: "entregadaPor",
          objeto: "Transportista",
        },
      ],
    },
    reglas_candidatas: [
      {
        id: "R1",
        enunciado:
          "Si la diferencia de conteo de un Articulo aparece después de una Recepcion, sin ningún Despacho en el medio, la diferencia se asocia a la recepción",
        usa: ["Articulo", "ConteoFisico", "cuenta", "Recepcion", "ingresa"],
      },
      {
        id: "R2",
        enunciado:
          "Si la diferencia de conteo de un Articulo aparece después de un Despacho, sin ninguna Recepcion en el medio, la diferencia se asocia al despacho",
        usa: ["Articulo", "ConteoFisico", "cuenta", "Despacho", "egresa"],
      },
      {
        id: "R3",
        enunciado:
          "Si las diferencias asociadas a recepción se repiten en recepciones de un mismo Transportista, la diferencia se asocia a ese transportista",
        usa: ["Recepcion", "entregadaPor", "Transportista"],
      },
    ],
    fuentes_requeridas: [
      {
        nombre: "Movimientos de stock",
        tipo: "csv",
        columnas_minimas: [
          {
            nombre: "articulo_id",
            justifica: ["Articulo", "ingresa", "egresa"],
          },
          { nombre: "tipo_movimiento", justifica: ["Recepcion", "Despacho"] },
          { nombre: "documento_id", justifica: ["Recepcion", "Despacho"] },
          { nombre: "fecha", justifica: ["R1", "R2"] },
        ],
        justifica: ["Recepcion", "Despacho", "R1", "R2"],
      },
      {
        nombre: "Conteos físicos",
        tipo: "excel",
        columnas_minimas: [
          { nombre: "articulo_id", justifica: ["cuenta"] },
          { nombre: "fecha_conteo", justifica: ["ConteoFisico", "R1", "R2"] },
          { nombre: "cantidad_contada", justifica: ["ConteoFisico"] },
        ],
        justifica: ["ConteoFisico", "cuenta"],
      },
      {
        nombre: "Remitos de recepción",
        tipo: "pdf",
        columnas_minimas: [
          { nombre: "recepcion_id", justifica: ["Recepcion", "entregadaPor"] },
          {
            nombre: "transportista",
            justifica: ["Transportista", "entregadaPor"],
          },
        ],
        justifica: ["Transportista", "R3"],
      },
    ],
    preguntas_abiertas: [
      "¿Los conteos cubren todo el depósito o se rotan por sector?",
    ],
    completitud: "suficiente_para_confirmar",
  },
};

export const FIXTURES = {
  rotacionDePersonal,
  cuellosDeBotella,
  inconsistenciasDeInventario,
} as const;

/**
 * Copia independiente de un requerimiento válido, opcionalmente modificada.
 * Por defecto parte de rotación de personal.
 *
 *   unRequerimiento((r) => { r.alcance.periodo = null; })
 */
export function unRequerimiento(
  modificar?: (r: RequerimientoMotor) => void,
  base: Fixture = rotacionDePersonal,
): RequerimientoMotor {
  const copia = structuredClone(base.requerimiento);
  modificar?.(copia);
  return copia;
}

export const corpus = rotacionDePersonal.corpus;
